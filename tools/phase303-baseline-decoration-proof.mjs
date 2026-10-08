import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
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
const baselineRoot = path.join(root, "tmp", "phase303-baseline-source");
const rawRoot = path.join(evidenceRoot, "baseline-decoration-proof");
const baselineManifestPath = path.join(evidenceRoot, "production-source-before.json");
const geometryAuditPath = path.join(evidenceRoot, "geometry-audit.json");
const debugPort = Number(process.argv.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? 9329);
const baseUrl = String(process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) ?? "http://127.0.0.1:3333").replace(/\/$/, "");
const viewport = { width: 1440, height: 1120, deviceScaleFactor: 1 };
const targetShortSide = 1080;
const cases = [
  { jobId: "red-mage", abbreviation: "RDM", caseId: "baseline-proof-e2-red-mage-16-9" },
  { jobId: "astrologian", abbreviation: "AST", caseId: "baseline-proof-e2-astrologian-16-9" },
];

const sourceManifest = JSON.parse(await readFile(baselineManifestPath, "utf8"));
const sourceFiles = [
  "src/components/cards/masters/editorial-master.tsx",
  "src/components/cards/masters/editorial-master.module.css",
];
const sourceProof = [];
for (const relative of sourceFiles) {
  const entry = sourceManifest.files.find((file) => file.path === relative);
  if (!entry) throw new Error(`Frozen source manifest is missing ${relative}.`);
  const bytes = await readFile(path.join(baselineRoot, relative));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  sourceProof.push({ path: relative, expectedSha256: entry.sha256, actualSha256: sha256, matchesFrozenSource: sha256 === entry.sha256 });
}
if (sourceProof.some((item) => !item.matchesFrozenSource)) throw new Error("Baseline renderer source does not match production-source-before.json; refusing to classify the crop.");

let buildId = null;
try { buildId = (await readFile(path.join(baselineRoot, ".next", "BUILD_ID"), "utf8")).trim(); } catch {}
const envText = await readFile(path.join(baselineRoot, ".env.local"), "utf8");
const publicFlag = envText.split(/\r?\n/).find((line) => /^\s*NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED\s*=/.test(line))?.split("=").slice(1).join("=").trim();
if (publicFlag !== "true") throw new Error("Baseline QA server does not have the required public official-assets flag enabled.");

const evaluate = async (client, expression) => {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, 30000);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
};

const geometryExpression = (caseId) => `(()=>{
  const card=document.querySelector('article[data-card-render-scope="true"]');
  if(!card)return {caseId:${JSON.stringify(caseId)},error:'production card missing'};
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  const motif=card.querySelector('[data-field="jobAbbreviation"]');
  let clip=null;
  for(let n=motif?.parentElement;n&&card.contains(n);n=n.parentElement){const s=getComputedStyle(n);if(/hidden|clip/.test(s.overflowX+' '+s.overflowY)){clip=n;break}}
  const motifRect=rect(motif),clipRect=rect(clip),clipStyle=clip?getComputedStyle(clip):null;
  const decoration=clip?.closest('[aria-hidden="true"]')||null;
  const clips={
    left:motifRect&&clipRect?Math.max(0,clipRect.x-motifRect.x):null,
    top:motifRect&&clipRect?Math.max(0,clipRect.y-motifRect.y):null,
    right:motifRect&&clipRect?Math.max(0,motifRect.right-clipRect.right):null,
    bottom:motifRect&&clipRect?Math.max(0,motifRect.bottom-clipRect.bottom):null
  };
  const jobName=card.querySelector('[data-field="job"]');
  const icon=card.querySelector('[data-icon-source]');
  const s=motif?getComputedStyle(motif):null;
  return{
    caseId:${JSON.stringify(caseId)},card:{template:card.getAttribute('data-template'),ratio:card.getAttribute('data-ratio'),jobId:card.getAttribute('data-job-id'),rect:rect(card)},
    motif:{present:Boolean(motif),field:motif?.getAttribute('data-field')??null,role:motif?.getAttribute('data-master-typography-role')??null,text:(motif?.innerText||motif?.textContent||'').replace(/\\s+/g,' ').trim(),rect:motifRect,fontSize:s?.fontSize??null,lineHeight:s?.lineHeight??null},
    clippingAncestor:{present:Boolean(clip),tag:clip?.tagName.toLowerCase()??null,className:typeof clip?.className==='string'?clip.className:'',rect:clipRect,overflowX:clipStyle?.overflowX??null,overflowY:clipStyle?.overflowY??null,ariaHidden:clip?.getAttribute('aria-hidden')==='true',decorationAncestorAriaHidden:decoration?.getAttribute('aria-hidden')==='true',clippedEdges:clips,actuallyClips:clips.left>0.75||clips.top>0.75||clips.right>0.75||clips.bottom>0.75},
    visibleJobName:{text:jobName?.innerText?.trim()??null,rect:rect(jobName)},jobIcon:{source:icon?.getAttribute('data-icon-source')??null,rect:rect(icon)},
  };
})()`;

await mkdir(rawRoot, { recursive: true });
const { client } = await connectPhase303(debugPort);
const results = [];
try {
  await setViewportAndMedia(client, { ...viewport, mobile: false, colorScheme: "dark", reducedMotion: "no-preference" });
  const url = `${baseUrl}/phase303-qa`;
  const navigation = await navigateAndAssert(client, url, viewport);
  await waitForPhase303Api(client);

  for (const item of cases) {
    const foreground = await assertForeground(client, viewport);
    const ready = await applyProductionCase(client, {
      caseId: item.caseId,
      master: "editorial",
      jobId: item.jobId,
      ratio: "16:9",
      locale: "en",
      characterName: "Coner",
    });
    const geometry = await evaluate(client, geometryExpression(item.caseId));
    if (!geometry?.motif?.present || !geometry.clippingAncestor.present) throw new Error(`Expected decorative abbreviation clipping nodes missing for ${item.caseId}.`);

    const cardRect = await evaluate(client, "(()=>{const e=document.querySelector('article[data-card-render-scope=\\\"true\\\"]');e?.scrollIntoView({behavior:'instant',block:'start',inline:'start'});const r=e?.getBoundingClientRect();return r?{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}:null})()");
    if (!cardRect) throw new Error(`Missing baseline production card for ${item.caseId}.`);
    const scale = targetShortSide / Math.min(cardRect.width, cardRect.height);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { ...cardRect, scale },
    }, 60000);
    const bytes = Buffer.from(screenshot.data, "base64");
    const image = await sharp(bytes).metadata();
    const pixelDimensions = { width: image.width, height: image.height };
    const expected = { width: Math.round(cardRect.width * scale), height: Math.round(cardRect.height * scale) };
    if (pixelDimensions.width !== expected.width || pixelDimensions.height !== expected.height) throw new Error(`Baseline preview size mismatch for ${item.caseId}: expected ${expected.width}×${expected.height}, got ${pixelDimensions.width}×${pixelDimensions.height}.`);

    const filename = `${item.caseId}.png`;
    await writeFile(path.join(rawRoot, filename), bytes);
    const cropProof = {
      sourcePath: "src/components/cards/masters/editorial-master.tsx and editorial-master.module.css from frozen pre-Phase303 snapshot",
      sourceManifest: "production-source-before.json",
      sourceHashes: sourceProof,
      baselineBuildId: buildId,
      publicOfficialAssetsFlag: publicFlag,
      serverUrl: url,
      viewport,
      foreground,
      navigation,
      case: ready.case,
      readyMs: ready.readiness.previewReadyMs,
      geometry,
      screenshot: {
        path: `baseline-decoration-proof/${filename}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.length,
        cardRectCss: cardRect,
        screenshotScale: scale,
        targetShortSidePixels: targetShortSide,
        pixelDimensions,
        purpose: "Read-only baseline Preview capture used to compare the pre-existing E2 decorative RDM/AST motif crop; not an export-engine raster.",
      },
      checks: {
        frozenSourceMatches: sourceProof.every((proof) => proof.matchesFrozenSource),
        expectedJobMatches: geometry.card.jobId === item.jobId,
        expectedRatioMatches: geometry.card.ratio === "16:9",
        abbreviationTextRole: geometry.motif.field === "jobAbbreviation" && geometry.motif.role === "job",
        decorativeAncestorIsAriaHidden: geometry.clippingAncestor.decorationAncestorAriaHidden,
        nearestOverflowAncestorIsHidden: ["hidden", "clip"].includes(geometry.clippingAncestor.overflowX) || ["hidden", "clip"].includes(geometry.clippingAncestor.overflowY),
        textLineBoxExceedsDecorativeClip: geometry.clippingAncestor.actuallyClips,
      },
    };
    cropProof.pass = Object.values(cropProof.checks).every(Boolean);
    results.push(cropProof);
    await writeFile(path.join(rawRoot, `${item.caseId}.json`), `${JSON.stringify(cropProof, null, 2)}\n`);
    console.log(JSON.stringify({ caseId: item.caseId, pass: cropProof.pass, lineBox: geometry.motif.rect, clipBox: geometry.clippingAncestor.rect, clippedEdges: geometry.clippingAncestor.clippedEdges }));
  }
} finally {
  client.close();
}

const proofReport = {
  schema: "phase303-baseline-decorative-crop-proof-v1",
  purpose: "Establish whether the two current E2 landscape typography-boundary findings were already present in the frozen pre-Phase303 production renderer and are confined to its aria-hidden decorative large-Job-motif clip, separate from the actual Job Identity block.",
  browser: { cdpPort: debugPort, browser: "task-owned isolated Chrome" },
  baseline: { root: "tmp/phase303-baseline-source", buildId, publicOfficialAssetsFlag: publicFlag, sourceManifest: "production-source-before.json", sourceHashes: sourceProof },
  caseCount: results.length,
  passCount: results.filter((item) => item.pass).length,
  failCount: results.filter((item) => !item.pass).length,
  cases: results,
  recordedAt: new Date().toISOString(),
};
const proofPath = path.join(evidenceRoot, "baseline-decoration-proof.json");
await writeFile(proofPath, `${JSON.stringify(proofReport, null, 2)}\n`);

if (proofReport.failCount === 0) {
  const audit = JSON.parse(await readFile(geometryAuditPath, "utf8"));
  const dispositionEntries = [];
  let allFinalCasesClassifiable = true;
  for (const proof of results) {
    const item = proof.case;
    const finalCaseId = `ratio-e2-${item.jobId}-16-9-en-coner`;
    const finalCase = audit.cases.find((candidate) => candidate.caseId === finalCaseId);
    if (!finalCase) { allFinalCasesClassifiable = false; continue; }
    const checks = finalCase.audit.checks;
    const failedRoles = finalCase.audit.typographyRoles.filter((role) => !role.insideCard || role.overflowClips.length > 0);
    const failedFields = finalCase.audit.fields.filter((field) => !field.insideCard || field.overflowClips.length > 0);
    const soleMotifFinding = failedRoles.length === 1 && failedFields.length === 1
      && failedRoles[0].field === "jobAbbreviation" && failedRoles[0].role === "job"
      && failedFields[0].field === "jobAbbreviation";
    const jobBlockPass = checks.jobIdentityContainedInCard && checks.iconMarkContainedInJobBlock
      && checks.resolverIconContainedInMark && checks.fullJobNameContainedInJobBlock
      && checks.exactlyOneVisibleResolverIcon;
    if (!soleMotifFinding || !jobBlockPass) { allFinalCasesClassifiable = false; continue; }
    finalCase.geometryDisposition = {
      status: "grandfathered-decorative-motif-crop",
      baselineProof: "baseline-decoration-proof.json",
      baselineCaseId: proof.case.caseId,
      reason: "The same E2 large Job-abbreviation motif role was captured in the frozen pre-Phase303 renderer. Its nearest overflow-hidden clip is aria-hidden decoration; the current Job Identity block, mark, icon, and full Job name independently pass containment. The raw role/data-field containment failures remain recorded and are not reclassified as Job Identity failures.",
      rawChecksPreserved: true,
      productionJobIdentityChecksPass: true,
    };
    dispositionEntries.push({ caseId: finalCaseId, baselineCaseId: proof.case.caseId, status: finalCase.geometryDisposition.status });
  }
  if (allFinalCasesClassifiable && dispositionEntries.length === results.length) {
    audit.geometryDispositionSummary = {
      strictGeometryPassCount: audit.passCount,
      strictGeometryFailCount: audit.failCount,
      grandfatheredDecorativeCropCount: dispositionEntries.length,
      actionableJobIdentityFailureCount: 0,
      evidence: "baseline-decoration-proof.json",
      cases: dispositionEntries,
      note: "Strict text-role/card containment reports remain unchanged. Both failures are confined to the pre-existing, aria-hidden E2 decorative acronym motif; the semantic Job Identity block/icon/name passes. This evidence does not grant a general overflow exemption.",
    };
    await writeFile(geometryAuditPath, `${JSON.stringify(audit, null, 2)}\n`);
    proofReport.classificationApplied = true;
    proofReport.geometryAuditUpdated = "geometry-audit.json";
    await writeFile(proofPath, `${JSON.stringify(proofReport, null, 2)}\n`);
  } else {
    proofReport.classificationApplied = false;
    proofReport.classificationReason = "At least one final case had findings outside the exact E2 decorative jobAbbreviation motif or a Job Identity containment failure; no geometry disposition was changed.";
    await writeFile(proofPath, `${JSON.stringify(proofReport, null, 2)}\n`);
  }
}

console.log(JSON.stringify({
  proof: path.relative(root, proofPath),
  cases: proofReport.caseCount,
  pass: proofReport.passCount,
  fail: proofReport.failCount,
  classificationApplied: proofReport.classificationApplied ?? false,
}, null, 2));
if (proofReport.failCount) process.exitCode = 1;
