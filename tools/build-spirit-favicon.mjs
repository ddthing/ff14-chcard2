import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Package the approved wink drawing without changing its composition or expression.
const root = process.cwd();
const sourcePath = path.join(root, 'docs/design/brand/spirit-wink-original.png');
const source = await readFile(sourcePath);
const metadata = await sharp(source).metadata();
if (!metadata.width || metadata.width !== metadata.height) {
  throw new Error('The approved favicon source must be a square image.');
}

const app = path.join(root, 'src/app');
await mkdir(app, { recursive: true });
const render = (size) => sharp(source)
  .resize(size, size, { fit: 'inside', kernel: 'lanczos3' })
  // Next's ICO decoder requires RGBA PNG frames; the added alpha is fully opaque.
  .ensureAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();

// ICO is a directory of PNG frames. Browsers select the appropriate native size.
const sizes = [16, 32, 48, 64];
const frames = await Promise.all(sizes.map(render));
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
for (let index = 0; index < frames.length; index += 1) {
  const entry = 6 + index * 16;
  directory.writeUInt8(sizes[index], entry);
  directory.writeUInt8(sizes[index], entry + 1);
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}
await writeFile(path.join(app, 'favicon.ico'), Buffer.concat([directory, ...frames]));
await writeFile(path.join(app, 'icon.png'), await render(512));
await writeFile(path.join(app, 'apple-icon.png'), await render(180));
console.log(JSON.stringify({
  source: 'docs/design/brand/spirit-wink-original.png',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  sourceSize: `${metadata.width}x${metadata.height}`,
  faviconFrames: sizes,
  icon: '512x512',
  appleIcon: '180x180',
}));
