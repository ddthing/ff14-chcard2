import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import { readFile } from 'node:fs/promises';
const root = new URL('../docs/qa/award-final/exports/', import.meta.url);
const evidenceTest = evidenceTests(test, 'award-final');

evidenceTest('final Master 2x evidence keeps readable microtype and rejects large derived PNGs', async () => {
  for (const family of ['cinematic','editorial','id-card']) {
    for (const ratio of ['1x1','4x5','3x4','9x16','16x9']) {
      const data = JSON.parse(await readFile(new URL(`${family}-en-${ratio}-2x.json`, root), 'utf8'));
      assert.equal(data.format, 'png');
      assert.equal(data.fonts, 'loaded');
      assert.ok(data.textRuns.length > 0);
      for (const run of data.textRuns) assert.ok(run.outputFontPx >= 18, `${family}/${ratio}: ${run.text} at ${run.outputFontPx}px`);
      for (const image of data.images) {
        assert.equal(image.loaded, true);
        assert.ok(!image.src.includes('/derived/'), image.src);
      }
      for (const field of data.fields.filter(f=>f.priority==='primary')) assert.equal(field.inside,true,`${family}/${ratio}: ${field.field}`);
    }
  }
});
