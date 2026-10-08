import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = 'src/lib/ffxiv-assets/fan-kit-source-manifest.json';
const SOURCE_PREFIX = 'vendor/ffxiv-fankit/class-job-icons/';
const PUBLIC_PREFIX = '/assets/ffxiv/jobs/official/';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safePath(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escaped the repository: ${relativePath}`);
  }
  return absolute;
}

async function main() {
  if (!process.argv.includes('--check')) {
    throw new Error('This importer is retired. Only --check is supported; generated job masks are no longer created.');
  }

  const manifest = JSON.parse(await readFile(safePath(MANIFEST_PATH), 'utf8'));
  const entries = Object.entries(manifest.entries ?? {});
  if (entries.length !== 33) throw new Error(`Expected 33 preserved source records; found ${entries.length}.`);

  for (const [jobId, entry] of entries) {
    if (!/^[a-z0-9-]+$/.test(jobId)) throw new Error(`Unsafe job id: ${jobId}`);
    if (!entry.sourcePath?.startsWith(SOURCE_PREFIX) || entry.sourcePath.includes('..')) {
      throw new Error(`Unreviewed source path for ${jobId}: ${entry.sourcePath}`);
    }
    if (entry.src !== `${PUBLIC_PREFIX}${jobId}.png`) throw new Error(`Unexpected copy path for ${jobId}: ${entry.src}`);
    if (entry.width !== 76 || entry.height !== 76) throw new Error(`Unexpected source dimensions for ${jobId}.`);

    const [source, copy] = await Promise.all([
      readFile(safePath(entry.sourcePath)),
      readFile(safePath(path.join('public', entry.src.slice(1)))),
    ]);
    if (!source.equals(copy)) throw new Error(`Preserved original copy differs from vendor source: ${jobId}`);
    if (sha256(source) !== entry.sourceSha256) throw new Error(`Source SHA-256 mismatch for ${jobId}`);
    if ('maskSrc' in entry || 'maskSha256' in entry) throw new Error(`Legacy mask metadata remains for ${jobId}`);
  }

  for (const retiredPath of [
    'public/assets/ffxiv/jobs/official/masks',
    'public/assets/ffxiv/jobs/derived',
  ]) {
    try {
      await stat(safePath(retiredPath));
      throw new Error(`Retired job-icon path is still present: ${retiredPath}`);
    } catch (error) {
      if (error.message.startsWith('Retired job-icon path is still present:')) throw error;
      if (error.code !== 'ENOENT') throw error;
    }
  }

  console.log(`Verified ${entries.length} preserved vendor source/copy pairs; no job masks or derived assets are active.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
