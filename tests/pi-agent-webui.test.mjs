import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import {
  MODEL_PRESETS,
  applyPiEvent,
  buildPiArgs,
  createAgentIdentity,
  createAgentManager,
  normalizeTask,
  normalizeTitle,
  terminateProcessTree
} from '../tools/pi-agent-webui/agent-manager.mjs';
import { parseControlArguments, requestControl } from '../tools/pi-agent-webui/control.mjs';
import { createPiWebUiServer } from '../tools/pi-agent-webui/server.mjs';
import { isInsideWorkspace, isProtectedWritePath } from '../tools/pi-agent-webui/workspace-guard.mjs';

function createFakeProcess() {
  const process = new EventEmitter();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = () => {
    process.emit('close', null);
    return true;
  };
  return process;
}

test('任务校验会清理空白并拒绝空任务', () => {
  assert.equal(normalizeTask('  检查代码  '), '检查代码');
  assert.throws(() => normalizeTask('   '), /请先写下/);
  assert.equal(normalizeTitle('', '检查代码\n详细说明'), '检查代码');
});

test('子智能体名称按模型生成并与头像保持稳定', () => {
  const lunaIdentity = createAgentIdentity('fixed-agent-id', MODEL_PRESETS.luna);
  const deepseekIdentity = createAgentIdentity('fixed-agent-id', MODEL_PRESETS.flash);
  const fallbackIdentity = createAgentIdentity('fixed-agent-id');

  assert.deepEqual(createAgentIdentity('fixed-agent-id', MODEL_PRESETS.luna), lunaIdentity);
  assert.match(lunaIdentity.agentName, /月$/);
  assert.match(deepseekIdentity.agentName, /鲸$/);
  assert.doesNotMatch(fallbackIdentity.agentName, /[月鲸]$/);
  assert.ok(lunaIdentity.avatarId >= 1 && lunaIdentity.avatarId <= 6);
});

test('Pi 参数固定模型、思考等级、工作区工具与安全说明', () => {
  const args = buildPiArgs({
    preset: MODEL_PRESETS.luna,
    task: '检查代码',
    workspaceRoot: 'C:\\workspace'
  });
  assert.deepEqual(args.slice(0, 6), ['--mode', 'json', '--model', 'opencode-go/gpt-5.6-luna', '--thinking', 'max']);
  assert.equal(args[args.indexOf('--tools') + 1], 'read,grep,find,ls,bash,edit,write');
  assert.match(args[args.indexOf('--extension') + 1], /workspace-guard\.mjs$/);
  assert.match(args.at(-1), /Shell 命令不得访问或修改工作区外文件/);
  assert.equal(MODEL_PRESETS.luna.label, 'GPT-5.6 Luna');
  assert.equal(MODEL_PRESETS.luna.thinkingLabel, 'Max');
});

test('Pi 事件转换为简明状态和最终结果', () => {
  const agent = { status: 'starting', activity: '', result: '', finishedAt: null };
  assert.equal(applyPiEvent(agent, { type: 'agent_start' }), true);
  assert.equal(agent.status, 'running');
  applyPiEvent(agent, { type: 'tool_execution_start', toolName: 'edit' });
  assert.equal(agent.activity, '正在修改文件');
  applyPiEvent(agent, { type: 'tool_execution_start', toolName: 'bash' });
  assert.equal(agent.activity, '正在执行命令');
  applyPiEvent(agent, {
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'text', text: '任务完成' }] }
  });
  assert.equal(agent.result, '任务完成');
  applyPiEvent(agent, { type: 'agent_settled' });
  assert.equal(agent.status, 'completed');
});

test('管理器限制并发并可停止任务', () => {
  const processes = [];
  const manager = createAgentManager({
    workspaceRoot: 'C:\\workspace',
    resolveLaunch: () => ({ command: 'node', prefixArgs: ['pi.js'] }),
    spawnProcess: () => {
      const process = createFakeProcess();
      processes.push(process);
      return process;
    },
    terminateProcess: (process) => process.kill()
  });

  const first = manager.start({ task: '任务一', modelId: 'luna' });
  assert.match(first.agentName, /月$/);
  assert.ok(first.avatarId >= 1 && first.avatarId <= 6);
  const second = manager.start({ task: '任务二', modelId: 'flash' });
  assert.match(second.agentName, /鲸$/);
  manager.start({ task: '任务三', modelId: 'luna' });
  assert.throws(() => manager.start({ task: '任务四', modelId: 'flash' }), /最多同时运行 3 个/);
  manager.stop(first.id);
  assert.equal(manager.list().find((agent) => agent.id === first.id).status, 'stopped');
});

test('工作区路径检查拒绝外部路径和受保护写入目录', () => {
  const workspace = process.cwd();
  assert.equal(isInsideWorkspace(workspace, 'tools/pi-agent-webui/server.mjs'), true);
  assert.equal(isInsideWorkspace(workspace, '..'), false);
  assert.equal(isProtectedWritePath(workspace, '.git/config'), true);
  assert.equal(isProtectedWritePath(workspace, 'tools/pi-agent-webui/new-file.mjs'), false);
});

test('管理器会解析没有末尾换行的最终 JSON 事件', () => {
  let child;
  const manager = createAgentManager({
    workspaceRoot: process.cwd(),
    resolveLaunch: () => ({ command: 'node', prefixArgs: ['pi.js'] }),
    spawnProcess: () => {
      child = createFakeProcess();
      return child;
    },
    terminateProcess: (process) => process.kill()
  });
  const started = manager.start({ task: '读取说明', modelId: 'flash' });
  child.stdout.write(JSON.stringify({
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'text', text: '已读取' }] }
  }));
  child.emit('close', 0);
  const finished = manager.list().find((agent) => agent.id === started.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.result, '已读取');
});

test('Windows 停止使用 taskkill 终止进程树', () => {
  const calls = [];
  const killer = new EventEmitter();
  const child = { pid: 4321, kill: () => { throw new Error('不应回退'); } };
  terminateProcessTree(child, (command, args, options) => {
    calls.push({ command, args, options });
    queueMicrotask(() => killer.emit('close', 0));
    return killer;
  }, 'win32');
  assert.equal(calls[0].command, 'taskkill');
  assert.deepEqual(calls[0].args, ['/pid', '4321', '/t', '/f']);
});

test('WebUI 提供健康检查和静态首页', async (t) => {
  const starts = [];
  const manager = {
    list: () => [],
    start: (body) => {
      starts.push(body);
      return { id: 'agent-1', ...body };
    },
    stop: () => {},
    stopAll: () => {},
    subscribe: () => () => {}
  };
  const server = createPiWebUiServer({ workspaceRoot: process.cwd(), manager });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, active: 0 });

  const html = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text());
  assert.match(html, /Pi 子智能体/);
  assert.match(html, /由 Codex 分派任务/);
  assert.doesNotMatch(html, /<form|开始任务|停止/);

  const browserPost = await fetch(`http://127.0.0.1:${port}/api/control/agents`, {
    method: 'POST',
    headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: '不应启动' })
  });
  assert.equal(browserPost.status, 403);

  const controlPost = await fetch(`http://127.0.0.1:${port}/api/control/agents`, {
    method: 'POST',
    headers: { 'X-Pi-Agent-Control': 'codex', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '检查状态', task: '读取状态', modelId: 'luna' })
  });
  assert.equal(controlPost.status, 201);
  assert.equal(starts[0].title, '检查状态');
});

test('Codex 控制命令从标准输入接收任务并调用专用接口', async () => {
  const command = await parseControlArguments(
    ['start', '--model', 'flash', '--title', '快速检查'],
    Readable.from(['只读取 package.json'])
  );
  assert.deepEqual(command, {
    command: 'start',
    body: { modelId: 'flash', title: '快速检查', task: '只读取 package.json' }
  });

  let request;
  const result = await requestControl(command, {
    port: 4312,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ agent: { id: 'agent-1' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  assert.equal(request.url, 'http://127.0.0.1:4312/api/control/agents');
  assert.equal(request.options.headers['X-Pi-Agent-Control'], 'codex');
  assert.equal(result.agent.id, 'agent-1');
});

test('Codex 控制命令会明确提示状态服务未运行', async () => {
  await assert.rejects(
    requestControl({ command: 'list' }, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }),
    /Pi 状态服务未运行/
  );
});
