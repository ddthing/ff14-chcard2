import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('docs/qa/phase212');
const captures = [
  ['01-focus-states.jpg', '01-focus-states.png'],
  ['02-text-size-source-200-after.jpg', '02-text-size-source-200.png'],
  ['03-mobile-targets-after.jpg', '03-mobile-targets.png'],
  ['04-error-state-after.jpg', '04-error-state.png'],
  ['05-reduced-motion.jpg', '05-reduced-motion.png'],
  ['06-export-accessibility.jpg', '06-export-accessibility.png'],
  ['final-editor.jpg', 'final-editor.png'],
];
const rows = [];
for (const [source, output] of captures) {
  const input = path.join(root, source);
  const metadata = await sharp(input).metadata();
  await sharp(input).png().toFile(path.join(root, output));
  rows.push({ source, output, sourceFormat: metadata.format, width: metadata.width, height: metadata.height, operation: 'Format conversion only; source JPEG compression is retained. No pixel annotations or resizing.' });
}
await fs.writeFile(path.join(root, 'capture-conversion.json'), JSON.stringify(rows, null, 2));
console.log(`${rows.length} screenshots converted; 02 is source text-size emulation, not browser zoom.`);
