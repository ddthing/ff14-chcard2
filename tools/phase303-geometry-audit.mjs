import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProductionCase,
  assertForeground,
  connectPhase303,
  evidenceRoot,
  navigateAndAssert,
  setViewportAndMedia,
  waitForPhase303Api,
} from "./phase303-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifests = ["qa-cases-core.json", "qa-cases-ratios.json", "qa-cases-locales.json", "qa-cases-longnames.json"];
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const debugPort = Number(args.get("port") ?? 9329);
const baseUrl = String(args.get("base-url") ?? "http://127.0.0.1:3334").replace(/\/$/, "");
const uniqueCases = new Map();

for (const manifestName of manifests) {
  const manifest = JSON.parse(await readFile(path.join(evidenceRoot, manifestName), "utf8"));
  for (const item of manifest.cases) {
    if (item.capture === false) continue;
    uniqueCases.set(item.caseId, { item, manifestName, manifest });
  }
}

const rows = [...uniqueCases.values()];
if (!rows.length) throw new Error("No production cases found for geometry audit.");
const viewport = rows[0].manifest.viewport ?? { width: 1440, height: 1120, deviceScaleFactor: 1 };
const route = rows[0].manifest.route ?? "/phase303-qa";
const targetUrl = `${baseUrl}${route}`;
const { client } = await connectPhase303(debugPort);
const results = [];

const geometryExpression = (caseId) => `(()=>{
  const card=document.querySelector('article[data-card-render-scope="true"]');
  if(!card)return {caseId:${JSON.stringify(caseId)},error:'production card missing'};
  const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  const cardRect=box(card),tol=0.75;
  const within=(outer,inner)=>Boolean(outer&&inner&&inner.x>=outer.x-tol&&inner.y>=outer.y-tol&&inner.right<=outer.right+tol&&inner.bottom<=outer.bottom+tol);
  const visible=e=>{const r=e.getBoundingClientRect();let opacity=1;for(let n=e;n&&card.contains(n);n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity||1);const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&opacity>0.001&&r.width>0&&r.height>0};
  const overflowClips=(e,rect)=>{const found=[];for(let n=e.parentElement;n&&card.contains(n);n=n.parentElement){const s=getComputedStyle(n);if(!/(hidden|clip|auto|scroll)/.test(s.overflowX+' '+s.overflowY))continue;const a=box(n);if(!within(a,rect))found.push({tag:n.tagName.toLowerCase(),className:typeof n.className==='string'?n.className:'',overflowX:s.overflowX,overflowY:s.overflowY,rect:a})}return found};
  const serialize=(e)=>{const rect=box(e),s=getComputedStyle(e),text=(e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,100);return{tag:e.tagName.toLowerCase(),field:e.getAttribute('data-field'),role:e.getAttribute('data-master-typography-role'),text,rect,visible:visible(e),insideCard:within(cardRect,rect),fontSize:s.fontSize,fontFamily:s.fontFamily,overflowClips:overflowClips(e,rect)}};
  const identityNodes=[...card.querySelectorAll('[data-job-identity]')];
  const identity=identityNodes[0]||null;
  const identityMark=identity?.querySelector('[data-job-identity-mark]')||card.querySelector('[data-job-identity-mark]');
  const iconNodes=[...card.querySelectorAll('[data-icon-source]')];
  const visibleIcons=iconNodes.filter(visible);
  const icon=visibleIcons[0]||iconNodes[0]||null;
  const jobName=card.querySelector('[data-field="job"]');
  const abbreviation=card.querySelector('[data-field="jobAbbreviation"]');
  const roles=[...card.querySelectorAll('[data-master-typography-role]')].filter(visible).map(serialize);
  const fields=[...card.querySelectorAll('[data-field]')].filter(visible).map(serialize);
  const identityRect=box(identity),markRect=box(identityMark),iconRect=box(icon),jobNameRect=box(jobName),abbreviationRect=box(abbreviation);
  const checks={
    oneJobIdentityBlock:identityNodes.length===1,
    jobIdentityVisible:Boolean(identity&&visible(identity)),
    jobIdentityContainedInCard:within(cardRect,identityRect),
    iconMarkPresent:Boolean(identityMark),
    iconMarkVisible:Boolean(identityMark&&visible(identityMark)),
    iconMarkContainedInJobBlock:within(identityRect,markRect),
    exactlyOneVisibleResolverIcon:visibleIcons.length===1,
    resolverIconVisible:Boolean(icon&&visible(icon)),
    resolverIconContainedInMark:within(markRect,iconRect),
    fullJobNamePresent:Boolean(jobName),
    fullJobNameContainedInJobBlock:identity?.contains(jobName)===true,
    visibleTypographyRolesContainedInCard:roles.every(item=>item.insideCard),
    visibleDataFieldsContainedInCard:fields.every(item=>item.insideCard),
    noVisibleRoleTextClippedByOverflowAncestor:roles.every(item=>item.overflowClips.length===0),
  };
  return{
    caseId:${JSON.stringify(caseId)},master:card.getAttribute('data-template'),ratio:card.getAttribute('data-ratio'),jobId:card.getAttribute('data-job-id'),cardRect,
    jobIdentity:{count:identityNodes.length,rect:identityRect,markRect,markSource:identityMark?.querySelector('[data-icon-source]')?.getAttribute('data-icon-source')??null,markContainsIcon:Boolean(identityMark&&icon&&identityMark.contains(icon)),resolverIconCount:iconNodes.length,iconSource:icon?.getAttribute('data-icon-source')??null,iconRect,jobNameRect,abbreviationRect},
    typographyRoleCount:roles.length,fieldCount:fields.length,typographyRoles:roles,fields,checks,pass:Object.values(checks).every(Boolean)
  };
})()`;

try {
  await setViewportAndMedia(client, {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    mobile: false,
    colorScheme: rows[0].manifest.colorScheme ?? "dark",
    reducedMotion: "no-preference",
  });
  const navigation = await navigateAndAssert(client, targetUrl, viewport);
  await waitForPhase303Api(client);

  for (const { item, manifestName } of rows) {
    const foreground = await assertForeground(client, viewport);
    const ready = await applyProductionCase(client, {
      caseId: item.caseId,
      master: item.master,
      jobId: item.jobId,
      ratio: item.ratio,
      locale: item.locale,
      characterName: item.characterName,
    });
    const response = await client.send("Runtime.evaluate", {
      expression: geometryExpression(item.caseId),
      returnByValue: true,
    });
    const audit = response.result?.value;
    if (!audit) throw new Error(`No geometry result for ${item.caseId}.`);
    results.push({
      caseId: item.caseId,
      manifest: manifestName,
      case: item,
      readyMs: ready.readiness.previewReadyMs,
      foreground,
      audit,
    });
    console.log(JSON.stringify({ caseId: item.caseId, pass: audit.pass, checks: audit.checks }));
  }

  const failures = results.filter((result) => !result.audit.pass).map((result) => ({ caseId: result.caseId, failedChecks: Object.entries(result.audit.checks).filter(([, pass]) => !pass).map(([name]) => name) }));
  const report = {
    schema: "phase303-production-geometry-audit-v1",
    protocol: "After preview/export performance measurements; production QA route only changes canonical data props and reads actual CardPreview DOM geometry. No DOM reparenting or card style overrides.",
    url: targetUrl,
    viewport,
    navigation,
    caseCount: results.length,
    passCount: results.length - failures.length,
    failCount: failures.length,
    failures,
    cases: results,
    recordedAt: new Date().toISOString(),
  };
  await mkdir(evidenceRoot, { recursive: true });
  const reportPath = path.join(evidenceRoot, "geometry-audit.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: path.relative(root, reportPath), cases: results.length, passed: report.passCount, failed: failures.length }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  client.close();
}
