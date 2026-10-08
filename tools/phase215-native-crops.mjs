import { createHash } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const qa = path.join(root, 'docs/qa/phase215');
const states = JSON.parse(await readFile(path.join(qa, 'native-after/capture-states.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = [];
for (const state of states) {
  if (!/^(desktop(?:1440|1920)|mobile390|templates|export)-(dark|light)$/.test(state.name)) throw new Error('Unexpected capture name.');
  const rawPath = path.join(qa, 'native-after', `${state.name}.jpg`);
  const raw = await readFile(rawPath);
  const before = await sharp(await readFile(path.join(qa, 'before', `${state.name}.jpg`))).metadata();
  const metadata = await sharp(raw).metadata();
  if (metadata.width < before.width || metadata.height < before.height) throw new Error(`Native source smaller than viewport: ${state.name}`);
  const crop = { left: 0, top: 0, width: before.width, height: before.height };
  const output = await sharp(raw).extract(crop).png().toBuffer();
  await writeFile(path.join(qa, 'after', `${state.name}.png`), output);
  const oldPath = path.join(qa, 'after', `${state.name}.jpg`);
  const old = await readFile(oldPath);
  const backup = await readFile(path.join(qa, 'after/superseded-texture', `${state.name}.jpg`));
  if (hash(old) !== hash(backup)) throw new Error('Superseded texture backup mismatch.');
  if (!oldPath.startsWith(`${qa}${path.sep}`)) throw new Error('Path outside QA workspace.');
  await unlink(oldPath);
  records.push({ ...state, rawPath: path.relative(root, rawPath), rawSha256: hash(raw), rawDimensions: [metadata.width, metadata.height], crop, output: `after/${state.name}.png`, sha256: hash(output), noResize: true });
}
await writeFile(path.join(qa, 'after/capture-states.json'), `${JSON.stringify(records, null, 2)}\n`);
console.log(`Saved ${records.length} lossless viewport PNG crops from retained native full-page JPEG screenshots; no scaling.`);
