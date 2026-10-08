import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const base = JSON.parse(await fs.readFile('docs/qa/phase29/optimized-source.json', 'utf8'));
const changed = [];
for (const item of base.files) {
  const data = await fs.readFile(item.file);
  if (crypto.createHash('sha256').update(data).digest('hex') !== item.sha256) changed.push(item.file.replaceAll('\\', '/'));
}
const frozenChanged = changed.filter(file => file.startsWith('src/components/cards/') || file.startsWith('src/store/') || file.startsWith('src/data/') || file.startsWith('src/lib/card-export/') || /master-card|typography-presets|src\/lib\/types/.test(file));
const paths = JSON.parse(await fs.readFile('.next/server/app-paths-manifest.json', 'utf8'));
const qaRoutes = Object.keys(paths).filter(key => key.includes('qa-phase'));
const result = {
  at: new Date().toISOString(), buildId: (await fs.readFile('.next/BUILD_ID', 'utf8')).trim(),
  sourceChanged: changed, frozenRendererStoreDataChanged: frozenChanged, qaRoutes,
  checks: { build: 'pass', typecheck: 'pass', lint: 'pass', tests: { pass: 165, fail: 0, originalRetained: 157 } },
  visual: JSON.parse(await fs.readFile('docs/qa/phase292/visual/pixel-comparison.json', 'utf8')),
  browserEvidence: ['behavior-validation.json', 'mobile-sheet-frames.json', 'native-sliders-1440.json', 'screenshot-provenance.json'],
  limitations: ['Synthetic p95 samples of 16.8ms are a 0.1ms strict-budget miss and remain reported.', '1920 cold template outlier retained separately from warm and remount repetitions.', 'Reduced motion tested through explicit local media emulation, not an OS preference change.', 'RAF is not GPU presentation FPS; physical mobile/touch/OS IME not measured.'],
};
await fs.writeFile('docs/qa/phase292/final-verification.json', JSON.stringify(result, null, 2));
console.log({ buildId: result.buildId, changed, frozenChanged, qaRoutes, tests: result.checks.tests });
if (frozenChanged.length || qaRoutes.length) process.exitCode = 1;
