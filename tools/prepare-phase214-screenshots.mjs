import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'docs/qa/phase214');
const screenshots = [
  { output: '02-dark-editor.png', candidates: ['02-dark-editor.jpg', 'dark-editor.jpg'] },
  { output: '03-light-editor.png', candidates: ['03-light-editor.jpg', 'light-editor.jpg'] },
  { output: '04-system-dark.png', candidates: ['04-system-dark.jpg', 'system-dark.jpg'] },
  { output: '05-system-light.png', candidates: ['05-system-light.jpg', 'system-light.jpg'] },
  { output: '06-light-templates.png', candidates: ['06-light-templates.jpg', 'light-templates.jpg'] },
  { output: '07-light-export.png', candidates: ['07-light-export.jpg', 'light-export.jpg'] },
  { output: '08-mobile-dark.png', candidates: ['08-mobile-dark.jpg', 'mobile-dark.jpg'] },
  { output: '09-mobile-light.png', candidates: ['09-mobile-light.jpg', 'mobile-light.jpg'] },
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function findCapture(candidates) {
  for (const name of candidates) {
    const fullPath = path.join(qaRoot, name);
    try { await fs.access(fullPath); return { name, fullPath }; } catch { /* try next known screenshot name */ }
  }
  throw new Error(`Missing screenshot source: ${candidates.join(' or ')}`);
}

const provenance = [];
for (const mapping of screenshots) {
  const source = await findCapture(mapping.candidates);
  const sourceBytes = await fs.readFile(source.fullPath);
  const metadata = await sharp(source.fullPath).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions for ${source.name}.`);
  const outputPath = path.join(qaRoot, mapping.output);
  await sharp(source.fullPath).png({ compressionLevel: 9 }).toFile(outputPath);
  const outputBytes = await fs.readFile(outputPath);
  const outputMetadata = await sharp(outputPath).metadata();
  if (outputMetadata.width !== metadata.width || outputMetadata.height !== metadata.height) {
    throw new Error(`PNG conversion changed dimensions for ${mapping.output}.`);
  }
  provenance.push({
    output: mapping.output,
    source: source.name,
    sourceFormat: metadata.format,
    sourceBytes: sourceBytes.length,
    sourceSha256: sha256(sourceBytes),
    width: metadata.width,
    height: metadata.height,
    outputBytes: outputBytes.length,
    outputSha256: sha256(outputBytes),
    conversion: 'Decoded source pixels were encoded as PNG at the same dimensions. JPEG sources remain lossy; PNG conversion does not restore original capture pixels.',
  });
}

const beforeName = 'header-before.jpg';
const afterName = 'header-after.jpg';
const beforePath = path.join(qaRoot, beforeName);
const afterPath = path.join(qaRoot, afterName);
const [beforeMeta, afterMeta] = await Promise.all([sharp(beforePath).metadata(), sharp(afterPath).metadata()]);
if (!beforeMeta.width || !beforeMeta.height || !afterMeta.width || !afterMeta.height) throw new Error('Header screenshot dimensions are unavailable.');
if (beforeMeta.width !== afterMeta.width) throw new Error('Before/after header screenshots use different viewport widths.');
const beforeEvidence = JSON.parse(await fs.readFile(path.join(qaRoot, 'header-before.json'), 'utf8'));
const afterEvidence = JSON.parse(await fs.readFile(path.join(qaRoot, 'keyboard-header.json'), 'utf8'));
const beforeHeaderHeight = Array.isArray(beforeEvidence.headers)
  ? beforeEvidence.headers.reduce((sum, header) => sum + Number(header.height ?? 0), 0)
  : Number(beforeEvidence.beforeHeaderHeightPx);
const afterHeaderHeight = Number(afterEvidence.escape?.headers?.[0]?.height ?? afterEvidence.headers?.[0]?.height);
if (!beforeHeaderHeight || !afterHeaderHeight) throw new Error('Measured header heights are missing from the browser evidence JSON.');
for (const [name, metadata, height] of [[beforeName, beforeMeta, beforeHeaderHeight], [afterName, afterMeta, afterHeaderHeight]]) {
  if (height > metadata.height) throw new Error(`${name} header crop exceeds the source screenshot.`);
}
const width = beforeMeta.width;
const height = Math.max(beforeHeaderHeight, afterHeaderHeight);
const beforeCrop = await sharp(beforePath).extract({ left: 0, top: 0, width, height: beforeHeaderHeight }).png().toBuffer();
const afterCrop = await sharp(afterPath).extract({ left: 0, top: 0, width, height: afterHeaderHeight }).png().toBuffer();
const headerOutputPath = path.join(qaRoot, '01-header-before-after.png');
await sharp({ create: { width: width * 2, height, channels: 4, background: '#e9e7e1' } })
  .composite([
    { input: beforeCrop, left: 0, top: 0 },
    { input: afterCrop, left: width, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(headerOutputPath);
const headerOutputBytes = await fs.readFile(headerOutputPath);
const headerOutputMeta = await sharp(headerOutputPath).metadata();
provenance.unshift({
  output: '01-header-before-after.png',
  sources: [
    { name: beforeName, sha256: sha256(await fs.readFile(beforePath)), width: beforeMeta.width, height: beforeMeta.height, cropHeight: beforeHeaderHeight },
    { name: afterName, sha256: sha256(await fs.readFile(afterPath)), width: afterMeta.width, height: afterMeta.height, cropHeight: afterHeaderHeight },
  ],
  width: headerOutputMeta.width,
  height: headerOutputMeta.height,
  outputBytes: headerOutputBytes.length,
  outputSha256: sha256(headerOutputBytes),
  conversion: `The original top-of-viewport header crops are placed side by side without resizing or adding labels. Crop heights come from browser geometry evidence (${beforeHeaderHeight} px before, ${afterHeaderHeight} px after).`,
});

const reportPath = path.join(qaRoot, 'SCREENSHOT_PROVENANCE.json');
await fs.writeFile(reportPath, `${JSON.stringify({
  schema: 'phase214-screenshot-provenance-v1',
  generatedAt: new Date().toISOString(),
  inputFormatNote: 'The CUA screenshot source files are JPEG. The required PNG deliverables are PNG encodings of those decoded, already-lossy pixels; they are not source-pixel-bit-identical captures.',
  captures: provenance,
}, null, 2)}\n`);
console.log(JSON.stringify({ outputs: provenance.map(({ output, width: outputWidth, height: outputHeight }) => ({ output, width: outputWidth, height: outputHeight })), report: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
