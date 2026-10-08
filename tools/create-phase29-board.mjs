import sharp from 'sharp';
const families = ['cinematic', 'editorial', 'id-card'];
const layers = [];
for (let i = 0; i < families.length; i++) {
  const input = await sharp(`docs/qa/phase29/visual/qa-lab-${families[i]}-ko-4x5-2x.png`).resize(360, 450).png().toBuffer();
  layers.push({ input, left: 20 + i * 380, top: 55 });
}
const background = Buffer.from('<svg width="1160" height="530"><rect width="1160" height="530" fill="#111616"/><text x="20" y="30" fill="#d8dfdc" font-family="sans-serif" font-size="18">Phase 2.9 — frozen C2 / E2 / I3 exports</text></svg>');
await sharp(background).composite(layers).png().toFile('docs/qa/phase29/visual/freeze-board.png');
console.log('Saved freeze-board.png');
