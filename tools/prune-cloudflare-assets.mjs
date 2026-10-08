import { cp, lstat, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'out');
const pagesOutput = path.resolve(root, 'dist');
if (path.dirname(pagesOutput) !== root || pagesOutput === root) {
  throw new Error('Refusing to use a Cloudflare Pages output outside the project root.');
}
const withinOutput = (target) => {
  const relative = path.relative(output, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

// Next loads .env.local for its own process. Mirror only this non-secret,
// NEXT_PUBLIC opt-in when the follow-up packager decides which files to host.
let optIn = process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED;
if (optIn === undefined) {
  const envPath = path.join(root, '.env.local');
  const contents = await readFile(envPath, 'utf8').catch(error => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  optIn = contents.match(/^\s*NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED\s*=\s*(["']?)(true|false)\1\s*(?:#.*)?$/imu)?.[2];
}

const staticIndex = path.join(output, 'index.html');
await stat(staticIndex);
if (optIn === 'true') {
  console.log('Cloudflare Pages export retains the explicitly enabled Job icon assets.');
} else {
  const iconRoots = [
    path.join(output, 'assets', 'ffxiv', 'jobs', 'official'),
    path.join(output, 'assets', 'ffxiv', 'jobs', 'xivapi'),
  ];
  for (const target of iconRoots) {
    if (!withinOutput(target)) throw new Error('Refusing to modify a path outside the static export.');
    try {
      const info = await lstat(target);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Unexpected asset path type: ${target}`);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    await rm(target, { recursive: true });
  }
  console.log('Opt-in Job icon binaries were omitted from the Cloudflare Pages export.');
}

const pagesInfo = await lstat(pagesOutput).catch(error => {
  if (error?.code === 'ENOENT') return null;
  throw error;
});
if (pagesInfo && (!pagesInfo.isDirectory() || pagesInfo.isSymbolicLink())) {
  throw new Error('Refusing to replace an unexpected Cloudflare Pages dist/ path.');
}
if (pagesInfo) await rm(pagesOutput, { recursive: true });
await mkdir(pagesOutput, { recursive: true });
for (const entry of await readdir(output, { withFileTypes: true })) {
  const source = path.join(output, entry.name);
  if (entry.isSymbolicLink()) throw new Error(`Refusing to copy a static export symlink: ${entry.name}`);
  await cp(source, path.join(pagesOutput, entry.name), { recursive: entry.isDirectory() });
}
console.log('Cloudflare Pages dist/ output is ready.');
