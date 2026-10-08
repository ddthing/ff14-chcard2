import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'docs/qa/phase216-job-icons');
const rendered = path.join(qa, 'rendered');
const jobs = ['red-mage', 'dark-knight', 'white-mage', 'gunbreaker'];
const families = ['cinematic', 'editorial', 'id-card'];
const cases = jobs.flatMap(job => families.map(family => ({ job, family }))).concat(['paladin', 'warrior', 'astrologian', 'dragoon', 'black-mage', 'dancer'].map(job => ({ job, family: 'editorial' })));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const label = (text, width, height = 32) => Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#101319"/><text x="12" y="23" fill="#ded8ce" font-size="15" font-family="sans-serif">${escape(text)}</text></svg>`);
const report = { protocol: 'Production CardPreview / renderCardBlob, 4:5, English, 2x PNG and WebP. Fixed data, all three families, four requested jobs. No composition changes. Preview audits taken on live decoded DOM. Timing includes encoder and local QA save; development observations are not a production benchmark.', cases: [] };
const names = new Set(await readdir(rendered));
const cardTiles = [];
const detailTiles = [];
let cardRow = 0;
let detailRow = 0;
for (const { job, family } of cases) {
  const prefix = `${job}-${family}-2x`;
  const old = JSON.parse(await readFile(path.join(rendered, names.has(`before-${prefix}.webp.json`) ? `before-${prefix}.webp.json` : `before-${prefix}.json`), 'utf8'));
  let pngAudit;
  for (const format of ['png', 'webp']) {
    const stem = `after-${prefix}.${format}`;
    const current = JSON.parse(await readFile(path.join(rendered, `${stem}.json`), 'utf8'));
    const meta = await sharp(path.join(rendered, stem)).metadata();
    const sameGeometry = old.icons.length === current.icons.length && old.icons.every((icon, index) => ['x', 'y', 'width', 'height', 'color'].every(key => icon[key] === current.icons[index][key]));
    if (!sameGeometry || !current.icons.every(icon => icon.decoded) || meta.width !== 2160 || meta.height !== 2700) throw new Error(`Preview/export geometry/readiness gate failed: ${stem}`);
    report.cases.push({ job, family, format, sameGeometry, previewIcons: current.icons, width: meta.width, height: meta.height, bytes: current.bytes, renderMs: current.renderMs, beforeWebpMs: old.renderMs, decoded: true });
    if (format === 'png') pngAudit = current;
  }
  for (const [column, stage] of ['before', 'after'].entries()) {
    const name = `${stage}-${prefix}.png`;
    if (!names.has(name)) throw new Error(`Missing baseline: ${name}`);
    cardTiles.push({ input: label(`${job} / ${family} / ${stage}`, 360), left: column * 360, top: cardRow * 482 });
    cardTiles.push({ input: await sharp(path.join(rendered, name)).resize(360, 450).png().toBuffer(), left: column * 360, top: cardRow * 482 + 32 });
  }
  cardRow++;
  const icon = pngAudit.icons[0];
  if (!icon) throw new Error(`Missing icon: ${job}/${family}`);
  const scale = 2160 / pngAudit.width;
  const edge = 60;
  const left = Math.max(0, Math.floor((icon.x + icon.width / 2) * scale - edge / 2));
  const top = Math.max(0, Math.floor((icon.y + icon.height / 2) * scale - edge / 2));
  const extracts = {};
  for (const stage of ['before', 'after']) extracts[stage] = await sharp(path.join(rendered, `${stage}-${prefix}.png`)).extract({ left, top, width: edge, height: edge }).png().toBuffer();
  for (const [column, pair] of [['before', 2], ['after', 2], ['before', 4], ['after', 4]].entries()) {
    const [stage, zoom] = pair;
    detailTiles.push({ input: label(`${job} / ${family} / ${stage} ${zoom * 100}%`, 280), left: column * 280, top: detailRow * 320 });
    const cropped = await sharp(extracts[stage]).resize(edge * zoom, edge * zoom, { kernel: 'nearest' }).png().toBuffer();
    detailTiles.push({ input: cropped, left: column * 280 + 10, top: detailRow * 320 + 36 });
  }
  detailRow++;
}
await sharp({ create: { width: 720, height: cardRow * 482, channels: 4, background: '#101319' } }).composite(cardTiles).png().toFile(path.join(qa, '07-card-before-after.png'));
await sharp({ create: { width: 1120, height: detailRow * 320, channels: 4, background: '#101319' } }).composite(detailTiles).png().toFile(path.join(qa, '08-export-detail.png'));
const picker = [];
for (const [column, stage] of ['before', 'after'].entries()) {
  picker.push({ input: label(`${stage} / actual Editor Job Picker`, 720), left: column * 720, top: 0 });
  picker.push({ input: await sharp(path.join(qa, `${stage}-picker.jpg`)).resize(720, 480, { fit: 'contain', background: '#101319' }).png().toBuffer(), left: column * 720, top: 32 });
}
await sharp({ create: { width: 1440, height: 512, channels: 4, background: '#101319' } }).composite(picker).png().toFile(path.join(qa, '06-picker-before-after.png'));
report.complete = report.cases.length === cases.length * 2;
await writeFile(path.join(qa, 'preview-export-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ cases: report.cases.length, complete: report.complete, sameGeometry: report.cases.every(row => row.sameGeometry), iconSources: [...new Set(report.cases.flatMap(row => row.previewIcons.map(icon => icon.src)))] }));
