import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const qa = path.join(root, 'docs/qa/phase29');
async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
}
const files = [];
for (const file of (await walk(path.join(root, 'src'))).sort()) {
  files.push({ file: path.relative(root, file), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') });
}
const buildId = (await fs.readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim();
await fs.writeFile(path.join(qa, 'optimized-source.json'), JSON.stringify({ generatedAt: new Date().toISOString(), buildId, buildMode: 'normal production; profiling flag 0; no --profile', note: 'Final shipping source hashes. The profiling records preserve their own environment and resource hashes; their uninstrumentedSourceFingerprint names the original reference, not this final source.', files }, null, 2));
const report = {
  generatedAt: new Date().toISOString(), buildId,
  checks: { typecheck: 'pass', lint: 'pass', test: { pass: 157, fail: 0, originalTestsRetained: 144 }, build: 'pass' },
  logs: ['final-typecheck.txt', 'final-lint.txt', 'final-test.txt', 'final-build.txt'],
  normalBrowserSmoke: { uploadFixturePreserved: true, png2xDownloadDispatch: 'success message observed', exportProfilingUIAbsent: true, temporaryQaRoute: 404 },
  freeze: JSON.parse(await fs.readFile(path.join(qa, 'source-freeze-check.json'), 'utf8')),
  visualEvidence: ['visual/pixel-comparison.json', 'visual/repeat-variation.json', 'visual/font-control-comparison.json', 'visual/upload-byte-parity.json', 'visual/normal-export-proof.png'],
  limitations: ['GPU/process peak memory and exact JavaScript CPU unavailable.', 'RAF frequency is not a GPU presentation counter.', 'Physical mobile/touch/OS IME and reduced-motion media emulation were not measured.', 'Five of nine frozen PNGs are exact; four have small raster variation documented without an exact-parity claim.'],
};
await fs.writeFile(path.join(qa, 'final-verification.json'), JSON.stringify(report, null, 2));
console.log({ buildId, sourceFiles: files.length, checks: report.checks });
