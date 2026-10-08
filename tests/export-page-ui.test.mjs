import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);
const { prepareCardForPrint } = await import('../src/lib/card-print.ts');
const page = await readFile(new URL('../src/app/export/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/export/export.module.css', import.meta.url), 'utf8');

test('the completed export state follows a successful browser download dispatch', () => {
  const dispatch = page.indexOf('downloadCardBlob(download.blob, snapshot.data, snapshot.format, snapshot.scale)');
  const completion = page.indexOf('setResult(download);', dispatch);
  const resultStart = page.indexOf('{result ? (');
  const resultEnd = page.indexOf('\n        ) : (', resultStart);
  const completedView = page.slice(resultStart, resultEnd);

  assert.ok(dispatch >= 0, 'the rendered Blob is sent through the existing download helper');
  assert.ok(completion > dispatch, 'the result state is committed only after dispatch returns');
  assert.ok(resultStart >= 0 && resultEnd > resultStart, 'the page has a distinct completed view');
  assert.match(completedView, /<h1 className=\{styles\.title\}>\{text\.resultTitle\}<\/h1>/);
  assert.match(completedView, /<p className=\{styles\.fileName\}>\{result\.filename\}<\/p>/);
  assert.match(completedView, /!error && <p className=\{styles\.visuallyHidden\} role="status">\{status \|\| formatExportSuccess\(result, text\)\}<\/p>/);
});

test('result details and re-download use the exact rendered Blob and snapshot', () => {
  assert.match(page, /blob: rendered\.blob,\s*size: rendered\.size,/);
  assert.match(page, /filename: getCardExportFilename\(snapshot\.data\.character\.name, snapshot\.data\.design\.ratio, snapshot\.scale, snapshot\.format\)/);
  assert.match(page, /downloadCardBlob\(download\.blob, download\.snapshot\.data, download\.snapshot\.format, download\.snapshot\.scale\)/);
  assert.match(page, /formatBlobSize\(result\.blob\.size, viewLocale\)/);
  assert.match(page, /dimensions\.width\.toLocaleString\(viewLocale\).*dimensions\.height\.toLocaleString\(viewLocale\)/);
});

test('the completed preview uses the exported Blob, reserves its actual ratio, and releases its object URL', () => {
  const previewStart = page.indexOf('function ResultBitmapPreview(');
  const exportPageStart = page.indexOf('export default function ExportPage()');
  const previewComponent = page.slice(previewStart, exportPageStart);
  const resultImageStart = page.indexOf('<ResultBitmapPreview');
  const resultImageEnd = page.indexOf('\n              ) : (', resultImageStart);
  const resultImageUse = page.slice(resultImageStart, resultImageEnd);
  const livePreviewStart = page.indexOf('<MemoizedCardPreview', resultImageEnd);
  const livePreviewEnd = page.indexOf('\n                </div>', livePreviewStart);
  const livePreview = page.slice(livePreviewStart, livePreviewEnd);

  assert.ok(previewStart >= 0 && exportPageStart > previewStart, 'the result bitmap component is defined before the page');
  assert.match(previewComponent, /URL\.createObjectURL\(blob\)/);
  assert.match(previewComponent, /return \(\) => \{\s*isCurrent = false;\s*if \(source\) URL\.revokeObjectURL\(source\);\s*\}/);
  assert.match(previewComponent, /style=\{\{ aspectRatio: `\$\{width\} \/ \$\{height\}` \}\}/);
  assert.match(previewComponent, /src=\{currentBitmap\.source\}[\s\S]*alt=\{alt\}[\s\S]*width=\{width\}[\s\S]*height=\{height\}[\s\S]*unoptimized/);
  assert.match(previewComponent, /onLoad=\{\(\) => updateBitmapStatus\(currentBitmap\.source, 'ready'\)\}/);
  assert.match(previewComponent, /onError=\{\(\) => updateBitmapStatus\(currentBitmap\.source, 'error'\)\}/);
  assert.match(resultImageUse, /blob=\{result\.blob\}[\s\S]*width=\{dimensions\.width\}[\s\S]*height=\{dimensions\.height\}[\s\S]*alt=\{previewSummary\}/);
  assert.match(livePreview, /data=\{viewRenderData\}[\s\S]*className=\{`\$\{styles\.mainCard\}/);
  assert.match(styles, /\.resultBitmap \{[\s\S]*object-fit: contain;/);
});

test('ratio, format, and resolution choices remain accessible and connected to export state', () => {
  assert.match(page, /updateDesign\('ratio', ratio\)/);
  assert.match(page, /name="export-ratio"[\s\S]*onChange=\{\(\) => updateRatio\(value\)\}/);
  assert.match(page, /name="export-format"[\s\S]*checked=\{viewFormat === value\}/);
  assert.match(page, /name="export-scale"[\s\S]*checked=\{viewScale === value\}/);
  assert.match(page, /CARD_EXPORT_SCALES\.map/);
  assert.match(page, /\['1:1', '4:5', '3:4', '9:16', '16:9'\]/);
});

test('export progress comes from the renderer and duplicate requests are blocked', () => {
  assert.match(page, /if \(activeExportRef\.current\) return/);
  assert.match(page, /setProgress\(nextProgress\)/);
  assert.match(page, /disabled=\{exporting \|\| printPreparing\} aria-busy=\{exporting \|\| printPreparing\}/);
  assert.doesNotMatch(page, /progress: 0\.04|setTimeout\([^)]*1000/);
});

test('cancellation aborts the active export and reports a cancelled state', () => {
  assert.match(page, /activeExport\.controller\.abort\(\)/);
  assert.match(page, /setStatus\(text\.cancelled\)/);
  assert.match(page, /exporting && <button className=\{styles\.cancelButton\}[^>]*onClick=\{cancelExport\}/);
});

test('print waits for fonts and card assets in order before opening the browser dialog', async () => {
  const events = [];
  let finishFonts;
  let finishAssets;
  const fontsReady = new Promise((resolve) => { finishFonts = resolve; });
  const assetsReady = new Promise((resolve) => { finishAssets = resolve; });
  const node = {};
  const controller = new AbortController();
  const printing = prepareCardForPrint({
    node,
    signal: controller.signal,
    loadFonts: async () => {
      events.push('fonts-start');
      await fontsReady;
      events.push('fonts-ready');
    },
    waitForAssets: async (assetNode, signal) => {
      assert.equal(assetNode, node);
      assert.equal(signal, controller.signal);
      events.push('assets-start');
      await assetsReady;
      events.push('assets-ready');
    },
    print: () => events.push('print'),
  });

  assert.deepEqual(events, ['fonts-start']);
  finishFonts();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['fonts-start', 'fonts-ready', 'assets-start']);
  finishAssets();
  await printing;
  assert.deepEqual(events, ['fonts-start', 'fonts-ready', 'assets-start', 'assets-ready', 'print']);
});

test('aborting print preparation between fonts and images never dispatches print', async () => {
  const events = [];
  const controller = new AbortController();

  await assert.rejects(prepareCardForPrint({
    node: {},
    signal: controller.signal,
    loadFonts: async () => {
      events.push('fonts-ready');
      controller.abort();
    },
    waitForAssets: async () => events.push('assets-start'),
    print: () => events.push('print'),
  }), { name: 'AbortError' });

  assert.deepEqual(events, ['fonts-ready']);
});

test('the print route waits on its prepared card and cleans up its abortable operation', () => {
  const printStart = page.indexOf('const requestPrint = useCallback(async () => {');
  const prepare = page.indexOf('await prepareCardForPrint({', printStart);
  const dialog = page.indexOf('window.print();', prepare);

  assert.ok(printStart >= 0 && prepare > printStart, 'print is prepared in an async user action');
  assert.ok(dialog > prepare, 'the browser dialog opens only after card preparation resolves');
  assert.match(page, /loadFonts: \(\) => loadCardPreviewFonts\(snapshot\.data, snapshot\.locale, \{ signal, source: 'export' \}\)/);
  assert.match(page, /waitForAssets: \(assetNode, assetSignal\) => \{\s*assetNode\.querySelectorAll<HTMLImageElement>\('img'\)[\s\S]*?return waitForCardAssets\(assetNode, \{ signal: assetSignal \}\);\s*\}/);
  assert.match(page, /asset\.loading = 'eager'/);
  assert.match(page, /activePrintRef\.current\?\.controller\.abort\(\)/);
  assert.match(page, /window\.addEventListener\('afterprint', clearPrintCard\)/);
  assert.match(page, /disabled=\{printPreparing\}/);
  assert.match(page, /'--export-card-height': `\$\{printLogicalDimensions\.height\}px`/);
});

test('the existing print route and result recovery actions stay available', () => {
  assert.match(page, /onClick=\{requestPrint\}/);
  assert.match(page, /window\.print\(\);/);
  assert.match(page, /href="\/editor"/);
  assert.match(page, /href="\/create"/);
  assert.match(page, /errorAction === 'resolution'[\s\S]*handleDownload\(\{ scale: lowerScale \}\)/);
  assert.match(page, /errorAction === 'format'[\s\S]*handleDownload\(\{ format: 'png' \}\)/);
  assert.match(page, /className=\{`\$\{styles\.printOnly\} \$\{styles\.printPreparation\}`\}/);
  assert.match(styles, /\.printOnly \{[\s\S]*display: grid;[\s\S]*width: var\(--export-card-width\)/);
  assert.match(styles, /height: var\(--export-card-height\)/);
  assert.match(styles, /\.printPreparation \{ visibility: hidden; opacity: 0; pointer-events: none; \}/);
  assert.match(styles, /@media print \{[\s\S]*\.printPreparation \{ visibility: visible; opacity: 1; pointer-events: auto; \}/);
  assert.match(styles, /@media print \{[\s\S]*\.printPreparation \.printCard \{ height: auto; \}/);
  assert.match(styles, /\.printOnly \.printRatio_4_5 \{ width: min\(8in, 95vw, 7\.84in\); \}/);
});

