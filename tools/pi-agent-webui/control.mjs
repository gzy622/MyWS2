import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4312;
const CONTROL_HEADER = Object.freeze({ 'X-Pi-Agent-Control': 'codex' });

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return '';
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少内容。`);
  return value;
}

function parsePort(value) {
  const port = Number.parseInt(value || String(DEFAULT_PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PI_WEBUI_PORT 必须是 1～65535 的整数。');
  }
  return port;
}

async function readStandardInput(input = process.stdin) {
  if (input.isTTY) return '';
  const chunks = [];
  for await (const chunk of input) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString('utf8').trim();
}

export async function parseControlArguments(args, input = process.stdin) {
  const [command, positional] = args;
  if (!['start', 'stop', 'list'].includes(command)) {
    throw new Error('用法：control.mjs start|stop|list。');
  }

  if (command === 'start') {
    const modelId = readOption(args, '--model') || 'luna';
    if (!['luna', 'flash'].includes(modelId)) throw new Error('模型只能是 luna 或 flash。');
    const task = readOption(args, '--task') || await readStandardInput(input);
    if (!task) throw new Error('请通过 --task 或标准输入提供任务。');
    return {
      command,
      body: {
        modelId,
        title: readOption(args, '--title'),
        task
      }
    };
  }

  if (command === 'stop') {
    if (!positional || positional.startsWith('--')) throw new Error('stop 命令需要任务 ID。');
    return { command, id: positional };
  }

  return { command };
}

export async function requestControl(command, {
  fetchImpl = fetch,
  host = DEFAULT_HOST,
  port = parsePort(process.env.PI_WEBUI_PORT)
} = {}) {
  const route = command.command === 'list'
    ? '/api/agents'
    : command.command === 'start'
      ? '/api/control/agents'
      : `/api/control/agents/${encodeURIComponent(command.id)}/stop`;
  const options = command.command === 'list'
    ? { method: 'GET' }
    : {
        method: 'POST',
        headers: { ...CONTROL_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify(command.body || {})
      };

  let response;
  try {
    response = await fetchImpl(`http://${host}:${port}${route}`, options);
  } catch {
    throw new Error('Pi 状态服务未运行。请先双击 start-pi-agent-webui.bat，或运行 npm run pi:webui。');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Pi 控制命令未完成。');
  return payload;
}

async function run() {
  const command = await parseControlArguments(process.argv.slice(2));
  const result = await requestControl(command);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectRun()) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
