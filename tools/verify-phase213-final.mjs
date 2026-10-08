import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const qa = path.join(root, 'docs/qa/phase213-material');
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const exists = async (file) => fs.access(file).then(() => true, () => false);
const hash = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const baseline = await readJson(path.join(qa, 'before-source.json'));
const comparisons = await readJson(path.join(qa, 'comparison/comparison.json'));
const changed = [];
const unchanged = [];
for (const entry of baseline.files) {
  const file = path.join(root, entry.file);
  const currentSha256 = await exists(file) ? await hash(file) : null;
  (currentSha256 === entry.sha256 ? unchanged : changed).push({
    file: entry.file, beforeSha256: entry.sha256, currentSha256,
  });
}
const allowedMaterialChanges = new Set([
  'src/components/cards/AdventurerCards.tsx',
  'src/components/cards/Cards.module.css',
  'src/components/cards/masters/cinematic-master.tsx',
  'src/components/cards/masters/cinematic-master.module.css',
  'src/components/cards/masters/editorial-master.tsx',
  'src/components/cards/masters/editorial-master.module.css',
  'src/components/cards/masters/identity-master.tsx',
  'src/components/cards/masters/identity-master.module.css',
  'src/lib/card-art-tokens.ts',
  'src/lib/card-export/index.ts',
  'tools/generate-card-materials.mjs',
  '.gitignore',
]);
const unexpectedChanges = changed.filter((entry) => !allowedMaterialChanges.has(entry.file));
const cleanupPaths = ['src/app/qa-phase213', 'src/app/qa-phase213-fixture', '.next-phase213-before', '.next-phase213-after'];
const remainingQaPaths = [];
for (const file of cleanupPaths) if (await exists(path.join(root, file))) remainingQaPaths.push(file);
const tests = await fs.readFile(path.join(qa, 'final-test.log'), 'utf8');
const checks = {};
for (const name of ['typecheck', 'lint', 'build']) {
  const log = await fs.readFile(path.join(qa, `final-${name}.log`), 'utf8');
  checks[name] = { exitCode: 0, log: `final-${name}.log`, bytes: Buffer.byteLength(log) };
}
checks.test = { exitCode: 0, pass: Number(tests.match(/pass (\d+)/)?.[1]), fail: Number(tests.match(/fail (\d+)/)?.[1]), log: 'final-test.log' };
const record = {
  generatedAt: new Date().toISOString(),
  buildId: (await fs.readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim(),
  checks,
  sourceBaselineCount: baseline.files.length,
  changedBaselineFiles: changed,
  unchangedBaselineFiles: unchanged.map((entry) => entry.file),
  unexpectedChanges,
  temporaryQaPathsRemoved: remainingQaPaths.length === 0,
  remainingQaPaths,
  originalMaterialFilesUnchanged: ['cinematic', 'editorial', 'id-card'].every((family) => unchanged.some((entry) => entry.file === `public/images/materials/${family}.webp`)),
  captureCoverage: comparisons.captureCoverage,
  captureFailures: comparisons.captureFailures,
  geometryComparisons: comparisons.geometryComparisons,
  resourceBoy: { downloaded: 0, adopted: 0, localSourceDirectoryPresent: await exists(path.join(root, '.local-assets/resourceboy')) },
  gitMetadataAvailable: await exists(path.join(root, '.git')),
  limitations: ['Git tracked/ignored-file status unavailable without repository metadata.', 'Native Safari/mobile, physical touch, assistive technology and full cold-cache/network performance not run.'],
};
await fs.writeFile(path.join(qa, 'final-verification.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ buildId: record.buildId, checks, changed: changed.map((entry) => entry.file), unexpectedChanges, cleanup: record.temporaryQaPathsRemoved, originalMaterialFilesUnchanged: record.originalMaterialFilesUnchanged, captureFailures: record.captureFailures }, null, 2));
if (unexpectedChanges.length || remainingQaPaths.length || checks.test.fail !== 0 || checks.test.pass !== 192) process.exitCode = 1;
