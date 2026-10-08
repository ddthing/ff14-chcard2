import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/qa/phase211');
const mappings = [
 ['docs/qa/phase210/qa-source/src__app__qa-phase210-visual__page.tsx.txt','src/app/qa-phase211-visual/page.tsx'],
 ['docs/qa/phase210/qa-source/src__app__qa-phase210-visual__lab-client.tsx.txt','src/app/qa-phase211-visual/lab-client.tsx'],
 ['docs/qa/phase210/qa-source/src__app__qa-phase210-visual__collect__route.ts.txt','src/app/qa-phase211-visual/collect/route.ts'],
 ['docs/qa/phase210/qa-source/src__app__qa-phase210__motion-emulation.ts.txt','src/app/qa-phase211/motion-emulation.ts'],
 ['docs/qa/phase211/qa-source/src__app__qa-phase211__fixture.tsx.txt','src/app/qa-phase211/fixture.tsx'],
];
await fs.mkdir(out,{recursive:true});
if(process.argv.includes('--remove')){
 for(const [,target] of mappings) await fs.rm(path.join(root,target),{force:true});
 await fs.rm(path.join(root,'src/app/qa-phase211/fixture.tsx'),{force:true});
 for(const [target,backup] of [['next.config.ts','next-config-original.txt'],['tsconfig.json','tsconfig-original.txt'],['src/app/editor/page.tsx','editor-page-original.txt']]) await fs.writeFile(path.join(root,target),await fs.readFile(path.join(out,backup)));
}else{
 for(const [target,backup] of [['next.config.ts','next-config-original.txt'],['tsconfig.json','tsconfig-original.txt'],['src/app/editor/page.tsx','editor-page-original.txt']]) await fs.writeFile(path.join(out,backup),await fs.readFile(path.join(root,target)));
 for(const [source,target] of mappings){
  const content=(await fs.readFile(path.join(root,source),'utf8')).replaceAll('phase210','phase211').replaceAll('Phase 2.10','Phase 2.11');
  await fs.mkdir(path.dirname(path.join(root,target)),{recursive:true});
  await fs.writeFile(path.join(root,target),content,{flag:'wx'});
 }
 const config=await fs.readFile(path.join(root,'next.config.ts'),'utf8');
 await fs.writeFile(path.join(root,'next.config.ts'),config.replace('  poweredByHeader: false,',"  poweredByHeader: false,\n  distDir: process.env.FF14_PHASE211_QA === '1' ? '.next-phase211' : '.next',"));
 await fs.writeFile(path.join(root,'src/app/editor/page.tsx'),"import { EditorWorkspace } from '@/components/editor/editor-workspace';\nimport { UxQaFixture } from '../qa-phase211/fixture';\nexport default function EditorPage(){ return <><UxQaFixture/><EditorWorkspace/></>; }\n");
}
