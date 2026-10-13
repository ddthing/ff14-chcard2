import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FONT_REGISTRY } from '../src/data/fonts/registry.ts';

const audit = JSON.parse(readFileSync(new URL('../licenses/fonts/REQUESTED_FONT_AUDIT_2026-10-13.json', import.meta.url), 'utf8'));
const addedIds = new Set(['pretendard', 'pretendard-jp', 'maruminya-hangul', 'mona-12', 'limgul-12', 'suhgung-12', 'tangba-12', 'umdot-12', 'chai-hwaljjak', 'chai-rising', 'ownglyph-yeongrong', 'ownglyph-park-dahyeon', 'ok-dandan', 'seoul-hangang', 'seoul-namsan', 'seoul-alrim']);
const entries = Object.values(FONT_REGISTRY).filter((entry) => addedIds.has(entry.id));

test('reviewed font assets match the inspected source hashes and shipped license notices', () => {
  assert.equal(entries.length, addedIds.size);
  const assets = new Map(entries.flatMap((entry) => entry.localAssets.map((asset) => [asset.filePath, { asset, entry }])));
  assert.equal(assets.size, audit.assets.length);
  for (const inspected of audit.assets) {
    const { asset, entry } = assets.get(inspected.path) ?? {};
    assert.ok(asset, `${inspected.path} must be registered`);
    const bytes = readFileSync(new URL(`../${inspected.path}`, import.meta.url));
    assert.equal(bytes.length, inspected.bytes);
    assert.equal(asset.bytes, inspected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), inspected.sha256);
    assert.equal(readFileSync(new URL(`../${entry.licenseFile}`, import.meta.url), 'utf8'), readFileSync(new URL(`../${entry.publicLicenseFile}`, import.meta.url), 'utf8'));
    if (entry.supportedScripts.includes('japanese')) assert.equal(inspected.japaneseSampleMissing, '', `${entry.id}: Japanese specimens must have inspected glyph coverage`);
    if (!inspected.originalUnmodified) {
      assert.equal(entry.license, 'KOGL Type 1', 'only the explicitly licensed Seoul container conversions are modified');
      assert.match(inspected.sourceSha256, /^[a-f0-9]{64}$/u);
      assert.ok(entry.attribution?.url);
    }
  }
});

test('fonts with no app redistribution grant remain absent from the selectable registry', () => {
  const names = Object.values(FONT_REGISTRY).map((entry) => `${entry.id} ${entry.family}`).join('\n');
  assert.doesNotMatch(names, /kopub|eulyoo|ok.?mallang|ok.?sunnynote|ownglyph.?okticon/iu);
});
