import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/app-theme.css', import.meta.url), 'utf8');
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const rows = [];
for (const theme of ['dark', 'light']) {
  const block = source.split(`html[data-app-theme='${theme}'] {`)[1].split('}')[0];
  const tokens = Object.fromEntries([...block.matchAll(/(--app-[\w-]+):\s*(#[a-f0-9]{6});/gi)].map((match) => [match[1], match[2]]));
  for (const foreground of ['text', 'text-muted', 'text-subtle', 'focus']) {
    for (const background of ['surface', 'control', 'workspace', 'header']) {
      const fg = tokens[`--app-${foreground}`];
      const bg = tokens[`--app-${background}`];
      const a = luminance(fg), b = luminance(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const threshold = foreground === 'focus' ? 3 : 4.5;
      rows.push({ theme, foreground, background, fg, bg, ratio: Number(ratio.toFixed(3)), threshold, pass: ratio >= threshold });
    }
  }
}
const report = { protocol: 'WCAG relative luminance of declared opaque UI text/focus tokens on primary surfaces; token-pair measurement, not complete rendered accessibility certification.', rows };
await writeFile(new URL('../docs/qa/phase215/contrast.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pairs: rows.length, minimumText: Math.min(...rows.filter((row) => row.foreground !== 'focus').map((row) => row.ratio)), minimumFocus: Math.min(...rows.filter((row) => row.foreground === 'focus').map((row) => row.ratio)), failures: rows.filter((row) => !row.pass) }, null, 2));
