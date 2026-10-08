import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const qaRoot = path.join(root, 'docs', 'qa', 'phase303-job-lock');
const manifestNames = ['qa-cases-core.json', 'qa-cases-ratios.json', 'qa-cases-locales.json', 'qa-cases-longnames.json', 'qa-cases-exports.json'];
const boardNames = ['01-c2-final.png','02-e2-final.png','03-i3-final.png','04-rdm-all.png','05-drg-all.png','06-gnb-all.png','07-whm-all.png','08-blm-all.png','09-source-classes.png','10-ratios.png','11-export-scales.png','12-ko-en-ja.png','13-before-after.png','14-final-master-board.png','15-source-detail.png'];
const familyLabels = {cinematic:'C2 · Cinematic',editorial:'E2 · Editorial','id-card':'I3 · Identity'};

function safePath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing capture path.');
  const relative = value.replaceAll('\\','/');
  const full = path.isAbsolute(value) ? path.resolve(value) :
    relative.startsWith('docs/qa/phase303-job-lock/') ? path.resolve(root,relative) : path.resolve(qaRoot,relative);
  const from = path.relative(qaRoot,full);
  if (from.startsWith('..') || path.isAbsolute(from)) throw new Error('Capture path escaped evidence directory: '+value);
  return full;
}
function asCase(row) { return row?.case && typeof row.case==='object' ? row.case : row; }
function safeJson(value) { return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026'); }
function safeId(value) { if(typeof value!=='string'||! /^[a-z0-9][a-z0-9_-]*$/iu.test(value)) throw new Error('Unsafe case id '+String(value)); return value; }
function displayText(value) { if(typeof value==='string'||typeof value==='number') return String(value); if(value&&typeof value==='object') return String(value.visibleText??value.text??value.name??''); return ''; }

export async function loadPhase303Cases() {
  const all = new Map();
  for (const manifestName of manifestNames) {
    const manifestPath=path.join(qaRoot,manifestName);
    let manifest;
    try { manifest=JSON.parse(await readFile(manifestPath,'utf8')); }
    catch { throw new Error('Phase303 capture set is not ready; missing '+manifestName); }
    if(!Array.isArray(manifest.cases)) throw new Error(manifestName+' must have a cases array.');
    for(const row of manifest.cases) {
      const meta=asCase(row);
      const id=safeId(meta.id??meta.caseId??row.caseId??row.id);
      const rawPath=path.join(qaRoot,'raw',id+'.json');
      let report;
      try { report=JSON.parse(await readFile(rawPath,'utf8')); }
      catch { throw new Error('Missing raw case '+id+'.'); }
      if(report.schema!=='phase303-production-card-case-v1') throw new Error('Unexpected schema for '+id+': '+String(report.schema));
      if(all.has(id)) { all.get(id).manifests.push(manifestName); continue; }
      const c=report.case??meta;
      const family=String(c.family??c.master??c.template??meta.family??meta.master??'');
      const jobRaw=c.jobId??c.job??meta.jobId??meta.job??'';
      const job=String(typeof jobRaw==='object'?(jobRaw.id??jobRaw.jobId??''):jobRaw);
      const locale=String(c.locale??meta.locale??'');
      const ratio=String(c.ratio??c.cardRatio??meta.ratio??'').replaceAll('x',':').replaceAll('/',':');
      const name=String(c.name??c.characterName??meta.name??meta.characterName??'');
      if(!family||!job||!locale||!ratio||!name) throw new Error('Incomplete case identity for '+id);
      const preview=report.preview??{};
      const previewPath=safePath(preview.path??('raw/'+id+'-preview-1x.png'));
      const exports=(report.exports??[]).map(item=>{
        const format=String(item.format??'').toLowerCase();
        const scale=Number(item.requestedScale??item.scale??item.exportScale);
        const ext=format==='webp'?'webp':'png';
        const file=safePath(item.path??('raw/'+id+'-'+format+'-'+scale+'x.'+ext));
        const dims=item.blobDims??item.actualPixelDimensions??item.actualCapsizes??item.dimensions??null;
        return {
          ...item,file,format,scale,requestedScale:scale,
          url:path.relative(qaRoot,file).split(path.sep).join('/'),
          path:file,dims,blobDims:dims,actualCapsizes:dims,
          hash:item.hash??item.sha256??'',sha256:item.sha256??item.hash??'',
          bytes:item.bytes??item.byteLength??null,
          capped:item.capped??dims?.capped??null,
          readiness:item.readiness??null,
        };
      });
      const pc=report.productionCard??{};
      const rawMarks=pc.marks??pc.iconResolver?.sources??[];
      const marks=Array.isArray(rawMarks)?rawMarks:Object.values(rawMarks);
      const firstMark=marks.find(mark=>mark?.visible!==false)??marks[0];
      const source=pc.source??pc.sourceKind??pc.resolverSource??firstMark?.source??'';
      const checks=report.checks??{},checkValues=checks.checks&&typeof checks.checks==='object'?Object.values(checks.checks):[];
      const failedChecks=checks.checks&&typeof checks.checks==='object'?Object.entries(checks.checks).filter(([,value])=>value===false).map(([name])=>name):[];
      const checkSummary=typeof checks.pass==='boolean'?(checks.pass?'pass recorded':'fail recorded')+(checkValues.length?' · '+(checkValues.length-failedChecks.length)+'/'+checkValues.length+' checks true':'')+(failedChecks.length?' · '+failedChecks.join(', '):''):'not recorded';
      const layout=String(c.layoutVariant??c.layout??meta.layoutVariant??meta.layout??'');
      const normalizedCase={...c,id,family,jobId:job,job,ratio,locale,name,characterName:name,layoutVariant:layout};
      all.set(id,{
        id,case:normalizedCase,report,
        family,familyLabel:familyLabels[family]??family,job,jobId:job,jobLabel:displayText(pc.localizedJobName)||displayText(report.expected?.localizedJobName)||displayText(pc.jobName)||job,
        abbreviation:displayText(pc.abbreviation)||displayText(report.expected?.canonicalAbbreviation)||displayText(pc.jobAbbreviation),checkSummary,
        locale,ratio,name,layout,layoutVariant:layout,source:typeof source==='string'?source:(source.kind??source.sourceKind??source.actualSource??'not reported'),
        previewFile:previewPath,exportFiles:exports,
        previewUrl:path.relative(qaRoot,previewPath).split(path.sep).join('/'),
        previewPixels:preview.pixels??preview.pixelDimensions??preview.dimensions??null,
        previewHash:preview.hash??preview.sha256??'',
        reportUrl:'raw/'+id+'.json',exports,manifest:manifestName,manifests:[manifestName],
      });
    }
  }
  return [...all.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

export async function writePhase303Viewer(cases) {
  const boardRows=boardNames.map(name=>({name,url:name,title:name.replace(/^\d+-/u,'').replace(/\.png$/iu,'').replaceAll('-',' ')}));
  const viewerCases=cases.map(c=>({
    id:c.id,family:c.family,familyLabel:c.familyLabel,job:c.job,jobLabel:c.jobLabel,abbreviation:c.abbreviation,
    locale:c.locale,ratio:c.ratio,name:c.name,layoutVariant:c.layoutVariant,source:c.source,checkSummary:c.checkSummary,
    previewUrl:c.previewUrl,previewPixels:c.previewPixels,previewHash:c.previewHash,reportUrl:c.reportUrl,
    exports:c.exportFiles.map(item=>({
      format:item.format,requestedScale:item.requestedScale,actualScale:item.actualScale,logicalDimensions:item.logicalDimensions,url:item.url,
      blobDims:item.blobDims,actualCapsizes:item.actualCapsizes,hash:item.hash,capped:item.capped,readiness:item.readiness,
    })),
  }));
  const data={cases:viewerCases,boards:boardRows};
  const html=[
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Phase 3.0.3 Job Identity · Production capture viewer</title>',
    '<style>',
    ':root{color-scheme:dark;--bg:#101310;--panel:#191f1a;--line:#343c35;--ink:#f2eee6;--muted:#aeb8ae;--accent:#c6a77b;--serif:Georgia,"Times New Roman",serif}',
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:#e4c18e}',
    'button,select{font:inherit;color:var(--ink);background:#252d27;border:1px solid var(--line);border-radius:8px;padding:.55rem .7rem}',
    '.shell{max-width:1600px;margin:auto;padding:20px;display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px}.sidebar{align-self:start;position:sticky;top:16px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}',
    '.sidebar h1{font:500 22px/1.2 var(--serif);margin:0 0 8px}.sidebar p{color:var(--muted);font-size:13px;margin:0 0 16px}.filters{display:grid;gap:10px}.control{display:grid;gap:5px}.control label{font-size:12px;color:var(--muted)}.control select{width:100%;min-width:0}',
    '.status{color:var(--muted);font-size:12px;min-height:2.8em;margin-top:12px}.viewer{min-width:0}.caseHead{display:flex;justify-content:space-between;align-items:start;gap:12px;margin:0 0 12px}.caseHead h2{font:500 25px/1.2 var(--serif);margin:0}.caseHead p{margin:4px 0 0;color:var(--muted);font-size:13px}',
    '.stage{min-height:65vh;display:flex;align-items:center;justify-content:center;padding:12px;background:#181d19;border:1px solid var(--line);border-radius:14px}.stage a{display:block;max-width:100%;max-height:78vh}.stage img{display:block;width:auto;height:auto;max-width:min(100%,1080px);max-height:78vh;object-fit:contain;background:#141714}',
    '.details{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.detail{padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:9px;min-width:0}.detail b{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.detail span{display:block;overflow-wrap:anywhere;margin-top:3px}',
    '.links{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.links a{padding:6px 9px;border:1px solid var(--line);border-radius:8px;text-decoration:none;font-size:12px}.boardGallery{margin-top:26px}.boardGallery h3{font:500 20px/1.2 var(--serif)}.boards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.board{display:block;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden}.board img{width:100%;height:120px;object-fit:contain;background:#131613;display:block}.board span{display:block;padding:7px 9px;font-size:12px}',
    '@media(max-width:720px){.shell{display:flex;flex-direction:column;padding:10px;gap:12px}.sidebar{position:static;padding:12px}.sidebar h1{font-size:19px}.sidebar p{margin-bottom:10px}.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.caseControl{grid-column:1/-1}.status{min-height:0;margin-top:8px}.caseHead{display:block}.caseHead h2{font-size:21px}.stage{min-height:0;padding:6px}.stage a{max-height:none;width:100%}.stage img{width:100%;height:auto;max-height:none}.details{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.detail{padding:8px}.boardGallery{margin-top:18px}}',
    '@media(max-width:420px){.shell{padding:8px}.sidebar{padding:10px}.caseHead h2{font-size:19px}.details{font-size:13px}.boardGallery h3{font-size:18px}}',
    '</style></head><body><div class="shell"><aside class="sidebar"><h1>Job Identity</h1>',
    '<p>Phase 3.0.3 actual production-renderer captures. Select one card for a full, readable view; each image opens the original capture.</p>',
    '<div class="filters"><div class="control"><label for="family">Family</label><select id="family"></select></div><div class="control"><label for="job">Job</label><select id="job"></select></div>',
    '<div class="control"><label for="locale">Locale</label><select id="locale"></select></div><div class="control"><label for="ratio">Ratio</label><select id="ratio"></select></div>',
    '<div class="control caseControl"><label for="case">Card capture</label><select id="case"></select></div><div class="control caseControl"><label for="asset">Image asset</label><select id="asset"></select></div></div>',
    '<div id="status" class="status"></div></aside><main class="viewer"><div class="caseHead"><div><h2 id="title"></h2><p id="subtitle"></p></div><a id="rawLink" target="_blank" rel="noreferrer">Raw report ↗</a></div>',
    '<div class="stage"><a id="imageLink" target="_blank" rel="noreferrer"><img id="image" alt=""></a></div><section id="details" class="details"></section><div id="assetLinks" class="links"></div>',
    '<section class="boardGallery"><h3>Boards</h3><div id="boards" class="boards"></div></section></main></div>',
    '<script id="phase303Data" type="application/json">'+safeJson(data)+'</script>',
    '<script>(function(){',
    'const DATA=JSON.parse(document.getElementById("phase303Data").textContent),CASES=DATA.cases,FAMILY={cinematic:"C2 · Cinematic",editorial:"E2 · Editorial","id-card":"I3 · Identity"};',
    'const family=document.getElementById("family"),job=document.getElementById("job"),locale=document.getElementById("locale"),ratio=document.getElementById("ratio"),caseSelect=document.getElementById("case"),assetSelect=document.getElementById("asset");',
    'function options(select,values,current,label){select.replaceChildren();const all=document.createElement("option");all.value="";all.textContent="All";select.append(all);values.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=label?label(v):v;select.append(o)});if(values.includes(current))select.value=current}',
    'function unique(list,key){return Array.from(new Set(list.map(x=>x[key]).filter(Boolean))).sort()}',
    'function filtered(){return CASES.filter(c=>(!family.value||c.family===family.value)&&(!job.value||c.job===job.value)&&(!locale.value||c.locale===locale.value)&&(!ratio.value||c.ratio===ratio.value))}',
    'function current(){return CASES.find(c=>c.id===caseSelect.value)}',
    'function refill(){const rows=filtered(),old=caseSelect.value;caseSelect.replaceChildren();rows.forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=(FAMILY[c.family]||c.family)+" · "+c.jobLabel+" · "+c.locale.toUpperCase()+" · "+c.ratio+" · "+c.name;caseSelect.append(o)});if(rows.some(c=>c.id===old))caseSelect.value=old;if(!caseSelect.value&&rows.length)caseSelect.value=rows[0].id;render()}',
    'function render(){const c=current(),status=document.getElementById("status");if(!c){document.getElementById("title").textContent="No matching capture";document.getElementById("subtitle").textContent="";document.getElementById("image").removeAttribute("src");status.textContent="No captures match these filters.";assetSelect.replaceChildren();return}',
    'const assets=[{key:"preview",label:"Preview · "+(c.previewPixels?.width??"?")+"×"+(c.previewPixels?.height??"?"),url:c.previewUrl,format:"preview",scale:null,actualScale:null,capped:null,dims:c.previewPixels,hash:c.previewHash}].concat(c.exports.map((e,i)=>({key:"export-"+i,label:e.format.toUpperCase()+" · "+(e.requestedScale??"?")+"× · "+(e.blobDims?.width??e.actualCapsizes?.width??"?")+"×"+(e.blobDims?.height??e.actualCapsizes?.height??"?"),url:e.url,format:e.format,scale:e.requestedScale,actualScale:e.actualScale,capped:e.capped,dims:e.blobDims??e.actualCapsizes,hash:e.hash,readiness:e.readiness})));',
    'const prior=assetSelect.value;assetSelect.replaceChildren();assets.forEach(a=>{const o=document.createElement("option");o.value=a.key;o.textContent=a.label;assetSelect.append(o)});if(assets.some(a=>a.key===prior))assetSelect.value=prior;if(!assetSelect.value)assetSelect.value="preview";const selected=assets.find(a=>a.key===assetSelect.value)||assets[0];',
    'document.getElementById("title").textContent=(FAMILY[c.family]||c.family)+" · "+c.jobLabel+(c.abbreviation?" ("+c.abbreviation+")":"");document.getElementById("subtitle").textContent=c.name+" · "+c.locale.toUpperCase()+" · "+c.ratio+" · layout "+(c.layoutVariant||"—")+" · source "+(c.source||"not recorded");',
    'const image=document.getElementById("image");image.src=selected.url;image.alt=(FAMILY[c.family]||c.family)+" "+c.jobLabel+" card "+c.locale+" "+c.ratio+" "+selected.label;document.getElementById("imageLink").href=selected.url;document.getElementById("rawLink").href=c.reportUrl;',
    'const engineScale=selected.actualScale==null?"not applicable":String(selected.actualScale)+"×",cap=selected.capped==null?"not applicable":selected.capped?"yes":"no";const fields=[["Family",FAMILY[c.family]||c.family],["Job",c.jobLabel+(c.abbreviation?" · "+c.abbreviation:"")],["Locale / ratio",c.locale.toUpperCase()+" · "+c.ratio],["Source",c.source||"not reported"],["Asset",selected.format.toUpperCase()+" · "+(selected.scale??"preview")],["Engine scale",engineScale],["Capped",cap],["Pixels",(selected.dims?.width??"?")+"×"+(selected.dims?.height??"?")],["Recorded checks",c.checkSummary||"not recorded"],["SHA-256",selected.hash||"not reported"]];const host=document.getElementById("details");host.replaceChildren();fields.forEach(pair=>{const d=document.createElement("div");d.className="detail";const b=document.createElement("b");b.textContent=pair[0];const s=document.createElement("span");s.textContent=String(pair[1]);d.append(b,s);host.append(d)});',
    'const links=document.getElementById("assetLinks");links.replaceChildren();assets.forEach(a=>{const link=document.createElement("a");link.href=a.url;link.target="_blank";link.rel="noreferrer";link.textContent=a.label;links.append(link)});status.textContent=filtered().length+" matching captured cards · one full image shown";}',
    'family.onchange=()=>refill();job.onchange=locale.onchange=ratio.onchange=refill;caseSelect.onchange=render;assetSelect.onchange=render;',
    'options(family,unique(CASES,"family"),"",v=>FAMILY[v]||v);options(job,unique(CASES,"job"),"");options(locale,unique(CASES,"locale"),"");options(ratio,unique(CASES,"ratio"),"");refill();',
    'const host=document.getElementById("boards");DATA.boards.forEach(b=>{const a=document.createElement("a");a.className="board";a.href=b.url;const img=document.createElement("img");img.src=b.url;img.alt=b.title+" board";img.loading="lazy";const s=document.createElement("span");s.textContent=b.title;a.append(img,s);host.append(a)});',
    '})();</script></body></html>',
  ].join('\n');

  await writeFile(path.join(qaRoot, 'comparison.html'), html, 'utf8');
  return { file: 'comparison.html', caseCount: viewerCases.length, boardCount: boardRows.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cases=await loadPhase303Cases();
  console.log(JSON.stringify(await writePhase303Viewer(cases),null,2));
}
