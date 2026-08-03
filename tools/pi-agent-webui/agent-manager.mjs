import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_AGENTS = 3;
const MAX_HISTORY = 12;
const MAX_TASK_LENGTH = 4000;
const MAX_TITLE_LENGTH = 120;
const MAX_RESULT_LENGTH = 30000;
const MAX_ERROR_LENGTH = 3000;
const MAX_STDOUT_BUFFER = 2 * 1024 * 1024;
const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_GUARD_PATH = path.join(TOOL_ROOT, 'workspace-guard.mjs');
const AGENT_NAMES = Object.freeze([
  '青禾', '远山', '星野', '知夏', '听澜', '望舒',
  '明川', '云岫', '清和', '南枝', '时雨', '景行'
]);
const DEEPSEEK_AGENT_NAMES = Object.freeze([
  '虎鲸', '蓝鲸', '座头鲸', '抹香鲸', '白鲸', '独角鲸',
  '露脊鲸', '灰鲸', '小须鲸', '长须鲸', '弓头鲸', '塞鲸'
]);
const LUNA_AGENT_NAMES = Object.freeze([
  '新月', '弦月', '望月', '皓月', '霁月', '桂月',
  '素月', '松月', '江月', '山月', '海月', '星月'
]);

export const MODEL_PRESETS = Object.freeze({
  luna: Object.freeze({
    id: 'luna',
    label: 'GPT-5.6 Luna',
    model: 'opencode-go/gpt-5.6-luna',
    thinking: 'max',
    thinkingLabel: 'Max'
  }),
  flash: Object.freeze({
    id: 'flash',
    label: 'DeepSeek V4 Flash',
    model: 'opencode-go/deepseek-v4-flash',
    thinking: 'high',
    thinkingLabel: 'High'
  })
});

const TOOL_ACTIVITY = Object.freeze({
  read: '正在读取文件',
  grep: '正在查找内容',
  find: '正在查找文件',
  ls: '正在查看目录',
  bash: '正在执行命令',
  edit: '正在修改文件',
  write: '正在写入文件'
});

function truncate(value, limit) {
  const text = String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…内容已截短`;
}

export function normalizeTask(value) {
  const task = String(value ?? '').trim();
  if (!task) {
    throw new Error('请先写下要完成的任务。');
  }
  if (task.length > MAX_TASK_LENGTH) {
    throw new Error(`任务内容请控制在 ${MAX_TASK_LENGTH} 个字符以内。`);
  }
  return task;
}

export function normalizeTitle(value, task) {
  const fallback = String(task).split(/\r?\n/, 1)[0].trim() || 'Pi 子智能体任务';
  const title = String(value ?? '').trim() || fallback;
  return title.length <= MAX_TITLE_LENGTH ? title : `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

export function createAgentIdentity(id, preset) {
  let hash = 0;
  for (const character of String(id)) {
    hash = ((hash * 31) + character.codePointAt(0)) >>> 0;
  }

  const modelName = `${preset?.model ?? ''} ${preset?.label ?? ''}`.toLowerCase();
  const names = modelName.includes('deepseek')
    ? DEEPSEEK_AGENT_NAMES
    : modelName.includes('gpt-5.6-luna')
      ? LUNA_AGENT_NAMES
      : AGENT_NAMES;

  return {
    agentName: names[hash % names.length],
    avatarId: (hash % 6) + 1
  };
}

export function resolvePiLaunch(env = process.env) {
  const candidates = [];
  if (process.platform === 'win32' && env.APPDATA) {
    candidates.push(path.join(
      env.APPDATA,
      'npm',
      'node_modules',
      '@earendil-works',
      'pi-coding-agent',
      'dist',
      'cli.js'
    ));
  }
  if (env.npm_config_prefix) {
    candidates.push(path.join(
      env.npm_config_prefix,
      process.platform === 'win32' ? 'node_modules' : 'lib/node_modules',
      '@earendil-works',
      'pi-coding-agent',
      'dist',
      'cli.js'
    ));
  }
  const entry = candidates.find((candidate) => existsSync(candidate));
  if (entry) {
    return { command: process.execPath, prefixArgs: [entry] };
  }

  if (process.platform === 'win32') {
    throw new Error('没有找到 Pi Coding Agent，请先确认它已通过 npm 全局安装。');
  }
  return { command: 'pi', prefixArgs: [] };
}

export function buildPiArgs({ preset, task, workspaceRoot }) {
  const instruction = [
    '你是由 Codex 主智能体分派的本机 Pi 子智能体。',
    `工作区：${workspaceRoot}`,
    '你可以读取、修改和创建工作区内文件，也可以使用 Shell 运行当前任务需要的本地检查。Shell 默认从工作区启动。',
    'Shell 命令不得访问或修改工作区外文件；禁止删除大量文件；禁止升级依赖；禁止提交或推送 Git；保留已有改动。',
    '完成后用简体中文清楚说明修改内容、已执行检查和未执行检查。',
    '',
    `用户任务：${task}`
  ].join('\n');

  return [
    '--mode', 'json',
    '--model', preset.model,
    '--thinking', preset.thinking,
    '--print',
    '--no-session',
    '--tools', 'read,grep,find,ls,bash,edit,write',
    '--extension', WORKSPACE_GUARD_PATH,
    '--no-skills',
    '--no-prompt-templates',
    '--approve',
    instruction
  ];
}

function getAssistantText(message) {
  if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
    return '';
  }
  return message.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
    .trim();
}

export function applyPiEvent(agent, event) {
  if (!event || typeof event !== 'object') return false;

  switch (event.type) {
    case 'agent_start':
      agent.status = 'running';
      agent.activity = '正在思考';
      return true;
    case 'message_update': {
      const updateType = event.assistantMessageEvent?.type;
      if (updateType === 'text_start' || updateType === 'text_delta') {
        agent.activity = '正在整理结果';
        return true;
      }
      return false;
    }
    case 'tool_execution_start':
      agent.activity = TOOL_ACTIVITY[event.toolName] || '正在处理任务';
      return true;
    case 'tool_execution_end':
      agent.activity = event.isError ? '操作未完成，正在处理' : '正在继续';
      return true;
    case 'message_end': {
      const text = getAssistantText(event.message);
      if (text) {
        agent.result = truncate(text, MAX_RESULT_LENGTH);
        agent.activity = '正在完成';
        return true;
      }
      return false;
    }
    case 'agent_settled':
      agent.status = 'completed';
      agent.activity = '已完成';
      agent.finishedAt = Date.now();
      return true;
    default:
      return false;
  }
}

export function toPublicAgent(agent) {
  return {
    id: agent.id,
    modelId: agent.modelId,
    modelLabel: agent.modelLabel,
    thinkingLabel: agent.thinkingLabel,
    agentName: agent.agentName,
    avatarId: agent.avatarId,
    title: agent.title,
    task: agent.task,
    status: agent.status,
    activity: agent.activity,
    result: agent.result,
    error: agent.error,
    startedAt: agent.startedAt,
    finishedAt: agent.finishedAt
  };
}

export function createAgentManager({
  workspaceRoot,
  spawnProcess = spawn,
  resolveLaunch = resolvePiLaunch,
  now = () => Date.now(),
  terminateProcess = terminateProcessTree
}) {
  const agents = new Map();
  const listeners = new Set();

  function list() {
    return [...agents.values()]
      .sort((left, right) => right.startedAt - left.startedAt)
      .map(toPublicAgent);
  }

  function emit() {
    const snapshot = list();
    for (const listener of listeners) listener(snapshot);
  }

  function trimHistory() {
    if (agents.size < MAX_HISTORY) return;
    const finished = [...agents.values()]
      .filter((agent) => !['starting', 'running'].includes(agent.status))
      .sort((left, right) => left.startedAt - right.startedAt);
    while (agents.size >= MAX_HISTORY && finished.length) {
      agents.delete(finished.shift().id);
    }
  }

  function activeCount() {
    return [...agents.values()].filter((agent) => ['starting', 'running'].includes(agent.status)).length;
  }

  function start({ task: rawTask, title: rawTitle, modelId = 'luna' }) {
    if (activeCount() >= MAX_AGENTS) {
      throw new Error(`最多同时运行 ${MAX_AGENTS} 个子智能体，请等待其中一个完成。`);
    }

    const task = normalizeTask(rawTask);
    const title = normalizeTitle(rawTitle, task);
    const preset = MODEL_PRESETS[modelId];
    if (!preset) throw new Error('请选择可用的子智能体。');

    trimHistory();
    const startedAt = now();
    const id = randomUUID();
    const identity = createAgentIdentity(id, preset);
    const agent = {
      id,
      ...identity,
      modelId: preset.id,
      modelLabel: preset.label,
      thinkingLabel: preset.thinkingLabel,
      title,
      task,
      status: 'starting',
      activity: '正在启动',
      result: '',
      error: '',
      startedAt,
      finishedAt: null,
      stoppedByUser: false,
      process: null,
      stdoutBuffer: '',
      stderrBuffer: '',
      processError: false,
      protocolError: false
    };
    agents.set(agent.id, agent);
    emit();

    let launch;
    try {
      launch = resolveLaunch();
      const args = [
        ...launch.prefixArgs,
        ...buildPiArgs({ preset, task, workspaceRoot })
      ];
      agent.process = spawnProcess(launch.command, args, {
        cwd: workspaceRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      });
    } catch (error) {
      agent.status = 'failed';
      agent.activity = '启动失败';
      agent.error = truncate(error.message, MAX_ERROR_LENGTH);
      agent.finishedAt = now();
      emit();
      return toPublicAgent(agent);
    }

    agent.process.stdout.setEncoding('utf8');
    agent.process.stdout.on('data', (chunk) => {
      agent.stdoutBuffer += chunk;
      if (agent.stdoutBuffer.length > MAX_STDOUT_BUFFER) {
        agent.stdoutBuffer = '';
        agent.protocolError = true;
      }
      const lines = agent.stdoutBuffer.split(/\r?\n/);
      agent.stdoutBuffer = lines.pop() ?? '';
      let changed = false;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          changed = applyPiEvent(agent, JSON.parse(line)) || changed;
        } catch {
          agent.protocolError = true;
        }
      }
      if (changed) emit();
    });

    agent.process.stderr.setEncoding('utf8');
    agent.process.stderr.on('data', (chunk) => {
      agent.stderrBuffer = truncate(`${agent.stderrBuffer}${chunk}`, MAX_ERROR_LENGTH);
    });

    agent.process.on('error', (error) => {
      agent.processError = true;
      agent.status = 'failed';
      agent.activity = '启动失败';
      agent.error = truncate(error.message, MAX_ERROR_LENGTH);
      agent.finishedAt = now();
      emit();
    });

    agent.process.on('close', (code) => {
      if (agent.stdoutBuffer.trim()) {
        try {
          applyPiEvent(agent, JSON.parse(agent.stdoutBuffer));
        } catch {
          agent.protocolError = true;
        }
        agent.stdoutBuffer = '';
      }
      if (agent.stoppedByUser) {
        agent.status = 'stopped';
        agent.activity = '已停止';
      } else if (agent.processError) {
        // 保留 error 事件提供的具体原因。
      } else if (code === 0 && agent.result && !agent.protocolError) {
        agent.status = 'completed';
        agent.activity = '已完成';
      } else {
        agent.status = 'failed';
        agent.activity = '运行失败';
        agent.error = agent.stderrBuffer
          || (agent.protocolError ? 'Pi 返回了无法识别的状态，请重新运行。' : 'Pi 没有返回任务结果，请重新运行。');
      }
      agent.finishedAt ??= now();
      agent.process = null;
      emit();
    });

    return toPublicAgent(agent);
  }

  function stop(id) {
    const agent = agents.get(id);
    if (!agent) throw new Error('找不到这个任务。');
    if (!['starting', 'running'].includes(agent.status) || !agent.process) {
      throw new Error('这个任务已经结束。');
    }
    agent.stoppedByUser = true;
    agent.activity = '正在停止';
    terminateProcess(agent.process);
    emit();
    return toPublicAgent(agent);
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(list());
    return () => listeners.delete(listener);
  }

  function stopAll() {
    for (const agent of agents.values()) {
      if (agent.process && ['starting', 'running'].includes(agent.status)) {
        agent.stoppedByUser = true;
        terminateProcess(agent.process);
      }
    }
  }

  return { list, start, stop, stopAll, subscribe };
}

export function terminateProcessTree(childProcess, spawnCommand = spawn, platform = process.platform) {
  if (!childProcess) return;
  if (platform === 'win32' && Number.isInteger(childProcess.pid)) {
    const killer = spawnCommand(
      'taskkill',
      ['/pid', String(childProcess.pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' }
    );
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      try { childProcess.kill(); } catch { /* 进程可能已经退出。 */ }
    };
    killer.once('error', fallback);
    killer.once('close', (code) => {
      if (code !== 0) fallback();
      else settled = true;
    });
    return;
  }
  try { childProcess.kill(); } catch { /* 进程可能已经退出。 */ }
}
