import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/reference-detail');
const exportsDir = path.join(out, 'exports');
const beforeDir = path.join(root, 'docs/qa/expressive-precision/exports');
const families = ['cinematic', 'editorial', 'id-card'];
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const label = (text, width, height = 50) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="20" y="30" fill="#d5b77d" font-family="sans-serif" font-size="18">${escape(text)}</text></svg>`);

async function board(file, cells, width, height, heading) {
  await sharp({create: {width, height, channels: 3, background: '#171a1d'}})
    .composite([{input: label(heading, width), left: 0, top: 0}, ...cells]).png().toFile(path.join(out, file));
}

await fs.mkdir(out, {recursive: true});
const triptych = [];
const comparison = [];
for (let i = 0; i < families.length; i++) {
  const family = families[i];
  const stem = `${family}-latin-4x5-2x.png`;
  const after = await sharp(path.join(exportsDir, stem)).resize(600, 750).png().toBuffer();
  triptych.push({input: label(family.toUpperCase(), 600), left: 20 + i * 620, top: 55});
  triptych.push({input: after, left: 20 + i * 620, top: 105});
  const before = await sharp(path.join(beforeDir, stem)).resize(400, 500).png().toBuffer();
  const smaller = await sharp(path.join(exportsDir, stem)).resize(400, 500).png().toBuffer();
  comparison.push({input: label(`${family.toUpperCase()} · BEFORE`, 400), left: 20 + i * 840, top: 55});
  comparison.push({input: label('AFTER', 400), left: 440 + i * 840, top: 55});
  comparison.push({input: before, left: 20 + i * 840, top: 105});
  comparison.push({input: smaller, left: 440 + i * 840, top: 105});
}
await board('master-triptych.png', triptych, 1880, 875, 'REFERENCE DETAIL · ACTUAL SHARED RENDERER PNG 2x');
await board('before-after.png', comparison, 2540, 625, 'SAME SCREENSHOT / SAME PHYSICAL SCALE · PRINT DETAIL PASS');

const referenceFiles = [
  'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_49-1.png',
  'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_50-2.png',
  'C:/Users/zzzec/Downloads/ChatGPT 이미지 2026년 10월 3일 오후 10_58_51-3.png',
];
const references = [];
for (let i = 0; i < families.length; i++) {
  for (const [offset, source, title] of [
    [0, referenceFiles[i], `${families[i].toUpperCase()} · REFERENCE`],
    [420, path.join(exportsDir, `${families[i]}-latin-4x5-2x.png`), 'IMPLEMENTED / ORIGINAL SCREENSHOT'],
  ]) {
    references.push({input: label(title, 400), left: 20 + i * 840 + offset, top: 55});
    references.push({input: await sharp(source).resize(400, 500, {fit: 'contain', background: '#171a1d'}).png().toBuffer(), left: 20 + i * 840 + offset, top: 105});
  }
}
await board('reference-comparison.png', references, 2540, 625, 'REFERENCE LANGUAGE → CODE-NATIVE PRINT CRAFT · NO SCREENSHOT REGENERATION');

const files = (await fs.readdir(exportsDir)).filter(file => file.endsWith('.json'));
const results = await Promise.all(files.map(async file => ({file, ...JSON.parse(await fs.readFile(path.join(exportsDir, file), 'utf8'))})));
const failures = results.flatMap(result => {
  const issues = [];
  if (result.credit !== '© SQUARE ENIX') issues.push('credit');
  if (result.fonts !== 'loaded' || result.images.some(img => !img.loaded)) issues.push('asset readiness');
  if (result.optical?.opticalReady !== 'true') issues.push('optical name readiness');
  if (result.shadows.some(item => item.shadow !== 'none')) issues.push('text shadow');
  if (result.fields.some(item => item.field === 'name' && (!item.inside || !item.inkInside))) issues.push('name bounds');
  return issues.map(issue => `${result.file}: ${issue}`);
});
const protectedFiles = JSON.parse(await fs.readFile(path.join(root, 'docs/qa/coner-art-direction/protected-files.json'), 'utf8'));
const {createHash} = await import('node:crypto');
for (const entry of protectedFiles) {
  const hash = createHash('sha256').update(await fs.readFile(path.join(root, entry.file))).digest('hex');
  if (hash !== entry.sha256) failures.push(`Protected file changed: ${entry.file}`);
}
await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({exports: results.length, protectedFiles: protectedFiles.length, failures}, null, 2));
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Verified ${results.length} exports and ${protectedFiles.length} protected files; three review boards written.`);
