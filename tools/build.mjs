import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** This site's release builds explicitly include its reviewed local XIVAPI icons.
 * A deployment environment can still disable them with an explicit false. */
export function runBuild({ env = process.env, args = [], execute = spawnSync } = {}) {
  const buildEnv = {
    ...env,
    NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED:
      env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED ?? 'true',
  };
  const commands = [
    [require.resolve('next/dist/bin/next'), 'build', ...args],
    [path.join(root, 'tools/prune-cloudflare-assets.mjs')],
  ];
  for (const command of commands) {
    const result = execute(process.execPath, command, {
      cwd: root, env: buildEnv, stdio: 'inherit', windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runBuild({ args: process.argv.slice(2) });
}
