import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const PATH_TOOLS = new Set(['read', 'grep', 'find', 'ls', 'edit', 'write']);
const WRITE_TOOLS = new Set(['edit', 'write']);
const PROTECTED_SEGMENTS = new Set(['.git', 'node_modules', 'www', 'dist']);

function normalizeForCompare(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function nearestExistingPath(target) {
  let current = target;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export function resolveWorkspacePath(workspaceRoot, requestedPath = '.') {
  const root = realpathSync(workspaceRoot);
  const absoluteTarget = path.resolve(root, requestedPath || '.');
  const existingBase = nearestExistingPath(absoluteTarget);
  const realBase = realpathSync(existingBase);
  const unresolvedTail = path.relative(existingBase, absoluteTarget);
  return {
    root,
    target: path.resolve(realBase, unresolvedTail)
  };
}

export function isInsideWorkspace(workspaceRoot, requestedPath = '.') {
  try {
    const { root, target } = resolveWorkspacePath(workspaceRoot, requestedPath);
    const comparableRoot = normalizeForCompare(root);
    const comparableTarget = normalizeForCompare(target);
    return comparableTarget === comparableRoot || comparableTarget.startsWith(`${comparableRoot}${path.sep}`);
  } catch {
    return false;
  }
}

export function isProtectedWritePath(workspaceRoot, requestedPath = '.') {
  try {
    const { root, target } = resolveWorkspacePath(workspaceRoot, requestedPath);
    const relative = path.relative(root, target);
    return relative.split(path.sep).some((segment) => PROTECTED_SEGMENTS.has(segment.toLowerCase()));
  } catch {
    return true;
  }
}

export default function workspaceGuard(pi) {
  const workspaceRoot = realpathSync(process.cwd());

  pi.on('tool_call', (event) => {
    if (!PATH_TOOLS.has(event.toolName)) return undefined;
    const requestedPath = typeof event.input?.path === 'string' ? event.input.path : '.';

    if (!isInsideWorkspace(workspaceRoot, requestedPath)) {
      return {
        block: true,
        reason: '该路径位于当前工作区之外，WebUI 已阻止此操作。'
      };
    }

    if (WRITE_TOOLS.has(event.toolName) && isProtectedWritePath(workspaceRoot, requestedPath)) {
      return {
        block: true,
        reason: '该目录由 Git、依赖或生成流程管理，WebUI 已阻止直接修改。'
      };
    }

    return undefined;
  });
}
