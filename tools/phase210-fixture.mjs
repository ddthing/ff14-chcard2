import fs from 'node:fs/promises';
import sharp from 'sharp';
await fs.mkdir('public/qa-phase210-fixtures', { recursive: true });
await sharp({ create: { width:120,height:80,channels:3,background:'#e63946' } })
 .composite([{input:Buffer.from('<svg width="120" height="80"><rect x="60" width="60" height="40" fill="#00ff00"/><rect y="40" width="60" height="40" fill="#0000ff"/><rect x="60" y="40" width="60" height="40" fill="#ffff00"/></svg>')}])
 .withMetadata({orientation:6}).jpeg().toFile('public/qa-phase210-fixtures/orientation-6.jpg');
await fs.copyFile('public/qa-phase210-fixtures/orientation-6.jpg','docs/qa/phase210/orientation-6.jpg');
