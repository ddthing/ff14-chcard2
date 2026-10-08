import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/typography-lock');
await fs.mkdir(out, {recursive:true});
let page = await fs.readFile(path.join(root, 'docs/qa/reference-detail/qa-page.tsx.txt'), 'utf8');
const presetCases=['editorial','modern','condensed','classic','clean'].flatMap(preset=>['latin','ko','ja'].map(script=>({id:`preset-${preset}-${script}`,preset,script,name:script==='ko'?'모서리':script==='ja'?'コナー':'Coner',locale:script==='latin'?'en':script})));
const cases = `const cases={
 latin:{name:'Coner',locale:'en'},ko:{name:'모서리',locale:'ko'},ja:{name:'コナー',locale:'ja'},
 'latin-long':{name:'Alexandria Nightfall',locale:'en'},
 'ko-long':{name:'에오르제아모험가',locale:'ko'},kanji:{name:'光月',locale:'ja'},
 'mixed-ko':{name:'Coner 모서리',locale:'ko'},
 'mixed-han':{name:'Coner 光月',locale:'ja'},
 'mixed-ja':{name:'コナー XIV',locale:'ja'},
 'locale-ko':{name:'Coner',locale:'ko'},'locale-ja':{name:'Coner',locale:'ja'},
 ${presetCases.map(spec=>`'${spec.id}':{name:'${spec.name}',locale:'${spec.locale}',preset:'${spec.preset}'}`).join(',\n ')}
} as const;`;
page = page.replace(/const cases=\{[\s\S]*?\} as const;/, cases)
 .replaceAll('qa-reference-detail', 'qa-typography-lock')
 .replaceAll('Reference detail review', 'Typography lock review')
 .replace(/const extras=.*?;\r?\n/, `const extras=families.flatMap(family=>ratios.flatMap(ratio=>(['latin-long','ko-long','kanji','mixed-ko','mixed-han','mixed-ja'] as Case[]).map(caseId=>({...initial,family,ratio,case:caseId}))));\nconst comparisons=families.flatMap(family=>(['locale-ko','locale-ja'] as Case[]).map(caseId=>({...initial,family,case:caseId})));\n`)
 .replace("const outline:Fixture={...initial,case:'outline'};", '')
 .replace('[...matrix,...extras,outline,...webps]', '[...matrix,...extras,...comparisons,...webps]')
 .replace("kind==='outline'?[outline]", "kind==='outline'?comparisons")
 .replace(/<style>\{`[\s\S]*?`\}<\/style>/, '')
 .replace("className={fixture.case==='outline'?'qaOutline':undefined} ", '');
// Capture visible ink rectangles and every printed role, without adding a QA-only settling wait.
page = page.replace('field:el.dataset.field,priority:', 'ink:rect(range),field:el.dataset.field,priority:');
page = page.replace('const name=node.querySelector<HTMLElement>', `const roleStyles=Array.from(node.querySelectorAll<HTMLElement>('*')).filter(el=>el.childElementCount===0&&el.textContent?.trim()).map(el=>{const style=getComputedStyle(el);return {text:el.textContent?.trim(),role:el.closest('[data-typography-role]')?.getAttribute('data-typography-role')??null,font:style.fontFamily,size:style.fontSize,weight:style.fontWeight,tracking:style.letterSpacing,leading:style.lineHeight};});
  const loadedFaces=Array.from(document.fonts).filter(face=>face.status==='loaded').map(face=>({family:face.family,weight:face.weight}));
  const name=node.querySelector<HTMLElement>`);
page = page.replace('fields,optical,assetOpticalSnapshots', 'fields,roleStyles,loadedFaces,optical,assetOpticalSnapshots');
page = page.replace("role:el.closest('[data-typography-role]')", "masterRole:el.closest('[data-master-typography-role]')?.getAttribute('data-master-typography-role')??null,role:el.closest('[data-typography-role]')");
page = page.replace('const rect=(el:Element)', 'const rect=(el:Element|Range)');
page = page.replace('function cardFor(f:Fixture){const card=getConerSample(f.family,f.ratio);return {...card,character:{...card.character,name:cases[f.case].name}};}',"function cardFor(f:Fixture){const card=getConerSample(f.family,f.ratio),spec=cases[f.case];return {...card,character:{...card.character,name:spec.name},design:{...card.design,typographyPreset:'preset' in spec?spec.preset:card.design.typographyPreset}};}");
page = page.replace('const webps=',`const presetChecks=families.flatMap(family=>([${presetCases.map(spec=>`'${spec.id}'`).join(',')}] as Case[]).map(caseId=>({...initial,family,case:caseId})));\nconst webps=`)
 .replace("|'final')", "|'final'|'presets')")
 .replace("kind==='masters'?", "kind==='presets'?presetChecks:kind==='masters'?")
 .replace("'current','final']", "'current','final','presets']");
// Archived harnesses are the reproducible source; active routes are temporary and never shipped.
const collector = `import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function POST(request:Request){
 if(process.env.NODE_ENV!=='development')return new Response('Development only',{status:404});
 const name=new URL(request.url).searchParams.get('name')??'';
 if(!/^(cinematic|editorial|id-card)-(latin|ko|ja|latin-long|ko-long|kanji|mixed-ko|mixed-han|mixed-ja|locale-ko|locale-ja|preset-(editorial|modern|condensed|classic|clean)-(latin|ko|ja))-(1x1|4x5|3x4|9x16|16x9)-2x(?:-webp)?\\.(png|webp|json)$/.test(name))return new Response('Invalid name',{status:400});
 const bytes=Buffer.from(await request.arrayBuffer());if(!bytes.length||bytes.length>32000000)return new Response('Invalid size',{status:400});
 const folder=path.resolve('docs/qa/typography-lock/exports');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,name),bytes);return Response.json({name,bytes:bytes.length});
}`;
for (const [relative, content] of [['src/app/qa-typography-lock/page.tsx',page],['src/app/qa-typography-lock/collect/route.ts',collector],['docs/qa/typography-lock/qa-page.tsx.txt',page],['docs/qa/typography-lock/qa-collector.ts.txt',collector]]) {
 await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});await fs.writeFile(path.join(root,relative),content);
}
const protectedFiles = JSON.parse(await fs.readFile(path.join(root,'docs/qa/coner-art-direction/protected-files.json'),'utf8'));
// CardPreview is now responsible for script-complete font requests.
const hashes=[];
for(const entry of protectedFiles.filter(entry=>!['src/components/editor/card-preview.tsx','src/data/fonts/load-fonts.ts'].includes(entry.file.replaceAll('\\','/')))) hashes.push({file:entry.file,sha256:createHash('sha256').update(await fs.readFile(path.join(root,entry.file))).digest('hex')});
try { await fs.access(path.join(out,'protected-files.json')); }
catch { await fs.writeFile(path.join(out,'protected-files.json'),JSON.stringify(hashes,null,2)); }
console.log('Prepared 144 final exports plus 45 preset/script checks.');
