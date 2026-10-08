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
  rawRoot,
  safeFileName,
  setViewportAndMedia,
  waitForPhase303Api,
} from "./phase303-qa-cdp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestNames = ["qa-cases-core.json", "qa-cases-ratios.json", "qa-cases-locales.json", "qa-cases-longnames.json"];
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const debugPort = Number(args.get("port") ?? 9329);
const baseUrl = String(args.get("base-url") ?? "http://127.0.0.1:3334").replace(/\/$/, "");
const targetShortSide = Number(args.get("short-side") ?? 1080);
const force = args.has("force");
const uniqueCases = new Map();

for (const manifestName of manifestNames) {
  const manifest = JSON.parse(await readFile(path.join(evidenceRoot, manifestName), "utf8"));
  for (const item of manifest.cases) {
    if (item.capture === false) continue;
    uniqueCases.set(item.caseId, { item, manifest });
  }
}

const caseRows = [...uniqueCases.values()];
if (!caseRows.length) throw new Error("No preview-refresh cases were found.");
const viewport = caseRows[0].manifest.viewport ?? { width: 1440, height: 1120, deviceScaleFactor: 1 };
if (caseRows.some(({ manifest }) => JSON.stringify(manifest.viewport) !== JSON.stringify(caseRows[0].manifest.viewport))) {
  throw new Error("Preview-refresh manifests use different viewports; split them before running.");
}
const route = caseRows[0].manifest.route ?? "/phase303-qa";
const targetUrl = `${baseUrl}${route}`;
const { client } = await connectPhase303(debugPort);
const refreshed = [];

try {
  await setViewportAndMedia(client, {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    mobile: false,
    colorScheme: caseRows[0].manifest.colorScheme ?? "dark",
    reducedMotion: "no-preference",
  });
  const navigation = await navigateAndAssert(client, targetUrl, viewport);
  await waitForPhase303Api(client);

  for (const { item } of caseRows) {
    const reportPath = path.join(rawRoot, `${safeFileName(item.caseId)}.json`);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (report.caseId !== item.caseId || report.schema !== "phase303-production-card-case-v1") {
      throw new Error(`Raw report does not match preview-refresh case ${item.caseId}.`);
    }
    const foreground = await assertForeground(client, viewport);
    const ready = await applyProductionCase(client, {
      caseId: item.caseId,
      master: item.master,
      jobId: item.jobId,
      ratio: item.ratio,
      locale: item.locale,
      characterName: item.characterName,
    });
    const rect = await (async () => {
      const response = await client.send("Runtime.evaluate", {
        expression: "(()=>{const el=document.querySelector('article[data-card-render-scope=\\\"true\\\"]');if(!el)return null;el.scrollIntoView({behavior:'instant',block:'start',inline:'start'});const r=el.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()",
        returnByValue: true,
      });
      return response.result?.value ?? null;
    })();
    if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error(`Missing production CardPreview for ${item.caseId}.`);
    const scale = targetShortSide / Math.min(rect.width, rect.height);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
    }, 60000);
    const bytes = Buffer.from(screenshot.data, "base64");
    const metadata = await sharp(bytes).metadata();
    const expectedPixels = { width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
    if (metadata.width !== expectedPixels.width || metadata.height !== expectedPixels.height) {
      throw new Error(`High-resolution preview dimensions mismatch for ${item.caseId}: expected ${expectedPixels.width}×${expectedPixels.height}, got ${metadata.width}×${metadata.height}.`);
    }

    const filename = `${safeFileName(item.caseId)}-preview-1080.png`;
    const outputPath = path.join(rawRoot, filename);
    if (!force) {
      try {
        await readFile(outputPath);
        throw new Error(`Preview already exists; pass --force to replace: ${path.relative(root, outputPath)}`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    await mkdir(rawRoot, { recursive: true });
    await writeFile(outputPath, bytes);

    report.previewOriginal ??= report.preview;
    report.preview = {
      path: `raw/${filename}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      cardRectCss: rect,
      screenshotScale: scale,
      pixelDimensions: { width: metadata.width, height: metadata.height },
      targetShortSidePixels: targetShortSide,
      capturePurpose: "large-board source: high-resolution Page.captureScreenshot of the actual production CardPreview DOM, not an export-engine PNG",
      readiness: {
        apiPreviewReadyMs: ready.readiness.previewReadyMs,
        visible: ready.card.visible,
        loadedImages: ready.readiness.loadedImageCount,
      },
      foreground,
    };
    report.previewRefresh = {
      source: "actual production CardPreview; no card DOM reparenting or style overrides",
      navigation,
      refreshedAt: new Date().toISOString(),
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    refreshed.push({
      caseId: item.caseId,
      path: `raw/${filename}`,
      sha256: report.preview.sha256,
      pixels: report.preview.pixelDimensions,
      scale,
    });
    console.log(JSON.stringify({ caseId: item.caseId, pixels: report.preview.pixelDimensions, scale }));
  }

  const summary = {
    schema: "phase303-preview-refresh-summary-v1",
    targetShortSidePixels: targetShortSide,
    viewport,
    url: targetUrl,
    refreshedCount: refreshed.length,
    cases: refreshed,
    recordedAt: new Date().toISOString(),
  };
  const summaryPath = path.join(evidenceRoot, "preview-refresh-summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ summary: path.relative(root, summaryPath), refreshedCount: refreshed.length }, null, 2));
} finally {
  client.close();
}
