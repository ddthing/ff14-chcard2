import sharp from 'sharp';
const layers=[];
for (const [row, family] of ['cinematic','editorial','id-card'].entries()) {
 for (const [col, dir] of ['docs/qa/typography-lock/exports','docs/qa/phase210/chrome-visual','docs/qa/phase210/visual'].entries()) {
  const name=(col ? 'qa-lab-' : '')+family+'-latin-4x5-2x.png';
  layers.push({input:await sharp(dir+'/'+name).resize(360,450).png().toBuffer(),left:col*360,top:row*450+30});
 }
}
layers.push({input:Buffer.from('<svg width="1080" height="30"><style>text{font:16px sans-serif;fill:white}</style><text x="10" y="22">Freeze reference</text><text x="370" y="22">Windows Chrome 154</text><text x="730" y="22">In-app Chromium</text></svg>'),left:0,top:0});
await sharp({create:{width:1080,height:1380,channels:3,background:'#13191f'}}).composite(layers).png().toFile('docs/qa/phase210/visual-browser-comparison.png');
