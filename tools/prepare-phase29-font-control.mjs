import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'src/lib/card-export/font-css.ts');
const archive = path.join(root, 'docs/qa/phase29/visual/font-css-before-control.ts.txt');
const guard = "  // Temporary local visual A/B control; removed before the shipping build.\n  if (process.env.NEXT_PUBLIC_PHASE29_FONT_CONTROL === '1') return null;\n";
const needle = '): Promise<PreparedCardFontCss | null> {\n';
const current = (await fs.readFile(target, 'utf8')).replaceAll('\r\n', '\n');
if (process.argv.includes('--remove')) {
  const original = await fs.readFile(archive, 'utf8');
  if (current !== original.replace(needle, needle + guard)) throw new Error('Font source changed during the temporary control; refusing to overwrite it.');
  await fs.writeFile(target, original);
  console.log('Restored the exact optimized font helper.');
} else {
  if (!current.includes(needle) || current.includes('NEXT_PUBLIC_PHASE29_FONT_CONTROL')) throw new Error('Expected optimized font helper not found.');
  await fs.writeFile(archive, current);
  await fs.writeFile(target, current.replace(needle, needle + guard));
  console.log('Prepared temporary font fallback control; build only after performance measurements finish.');
}
