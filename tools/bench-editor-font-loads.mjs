import { register } from 'node:module';
import { performance } from 'node:perf_hooks';

register('../tests/ts-alias-loader.mjs', import.meta.url);

const { loadProfiledFontFace } = await import('../src/data/fonts/load-fonts.ts');
const iterations = Number(process.argv.find((value) => value.startsWith('--iterations='))?.split('=')[1] ?? 1000);
const face = { family: 'Noto Sans KR' };

function installFontSet() {
  let calls = 0;
  const fontSet = {
    load: async () => {
      calls += 1;
      return [face];
    },
  };
  globalThis.document = { fonts: fontSet };
  return () => calls;
}

const detail = { source: 'preview', face: 'noto-sans-kr', script: 'korean', glyphCount: 4 };
const getDirectCalls = installFontSet();
const beforeStart = performance.now();
for (let index = 0; index < iterations; index += 1) {
  await document.fonts.load('400 16px "Noto Sans KR"', '모험가 기록');
}
const beforeMs = performance.now() - beforeStart;
const directCalls = getDirectCalls();

const getCachedCalls = installFontSet();
const afterStart = performance.now();
for (let index = 0; index < iterations; index += 1) {
  await loadProfiledFontFace('400 16px "Noto Sans KR"', '모험가 기록', detail);
}
const afterMs = performance.now() - afterStart;

console.log(JSON.stringify({
  benchmark: 'repeated-identical-editor-font-face-load',
  iterations,
  beforeDirectFontFaceCalls: directCalls,
  afterUnderlyingFontFaceCalls: getCachedCalls(),
  beforeMs: Number(beforeMs.toFixed(3)),
  afterMs: Number(afterMs.toFixed(3)),
}, null, 2));
