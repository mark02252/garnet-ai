import { existsSync } from 'node:fs';
import path from 'node:path';

const FALLBACK_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin'];

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function buildAugmentedPath(extraDirs: string[] = []) {
  const home = process.env.HOME || '';
  const currentPath = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const userDirs = home
    ? [path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, 'bin')]
    : [];

  return unique([...extraDirs, ...userDirs, ...FALLBACK_BIN_DIRS, ...currentPath]).join(path.delimiter);
}

export function resolveOpenClawBin(rawBin?: string) {
  const bin = (rawBin || process.env.OPENCLAW_BIN || 'openclaw').trim() || 'openclaw';
  if (bin.includes(path.sep)) return bin;

  const augmentedPath = buildAugmentedPath();
  for (const dir of augmentedPath.split(path.delimiter)) {
    const candidate = path.join(dir, bin);
    if (existsSync(candidate)) return candidate;
  }

  return bin;
}

export function withOpenClawEnv<T extends Record<string, unknown>>(options?: T): T & { env: NodeJS.ProcessEnv } {
  return {
    ...(options || ({} as T)),
    env: {
      ...process.env,
      PATH: buildAugmentedPath()
    }
  };
}
