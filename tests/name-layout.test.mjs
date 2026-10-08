import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const { getCardNameLayout } = await import('../src/lib/card-name-layout.ts');
const { detectTypographyScript } = await import('../src/lib/typography-presets.ts');

function assertNamePreserved(layout) {
  assert.equal(
    layout.lines.join('').replace(/\s+/gu, ''),
    layout.normalizedName.replace(/\s+/gu, ''),
  );
}

test('short and medium Korean names use deliberate two-line composition', () => {
  const short = getCardNameLayout('루나', 'ko');
  assert.equal(short.script, 'korean');
  assert.equal(short.category, 'short');
  assert.deepEqual(short.lines, ['루나']);

  const medium = getCardNameLayout('카엘 오리온', 'ko');
  assert.equal(medium.category, 'medium');
  assert.deepEqual(medium.lines, ['카엘', '오리온']);
  assertNamePreserved(medium);

  const spacedLongName = getCardNameLayout('카엘 오리온 달빛 기사', 'ko');
  assert.equal(spacedLongName.category, 'long');
  assert.equal(spacedLongName.lines.join(' '), spacedLongName.normalizedName);

  // A Latin character name stays Latin even when the editor locale is Korean.
  assert.equal(getCardNameLayout('Kael Orion', 'ko').script, 'latin');
});

test('Japanese middle dot stays with the preceding name segment', () => {
  const layout = getCardNameLayout('カエル・オリオン', 'ja');
  assert.equal(layout.script, 'japanese');
  assert.equal(layout.category, 'medium');
  assert.deepEqual(layout.lines, ['カエル・', 'オリオン']);
  assertNamePreserved(layout);
});

test('long Latin names use up to four balanced lines and retain whitespace-normalized text', () => {
  const layout = getCardNameLayout('  Alaric   Vanehart of the Western   Marches  ', 'en');
  assert.equal(layout.script, 'latin');
  assert.equal(layout.category, 'long');
  assert.ok(layout.lines.length >= 3 && layout.lines.length <= 4);
  assert.equal(layout.normalizedName, 'Alaric Vanehart of the Western Marches');
  assertNamePreserved(layout);
  assert.equal(layout.lines.join(' '), layout.normalizedName);

  const unbroken = getCardNameLayout('A'.repeat(48), 'en');
  assert.equal(unbroken.category, 'long');
  assert.ok(unbroken.lines.length >= 3 && unbroken.lines.length <= 4);
  assert.equal(unbroken.lines.join(''), 'A'.repeat(48));
});

test('long CJK names break at grapheme boundaries and preserve all ideographs', () => {
  const korean = '모험가의이름을아주길게지어보았습니다'.repeat(2);
  const layout = getCardNameLayout(korean, 'ko');
  assert.equal(layout.script, 'korean');
  assert.equal(layout.category, 'long');
  assert.ok(layout.lines.length >= 3 && layout.lines.length <= 4);
  assertNamePreserved(layout);

  const japanese = getCardNameLayout('星野'.repeat(24), 'ja');
  assert.equal(japanese.script, 'japanese');
  assert.equal(japanese.category, 'long');
  assert.equal(japanese.lines.length, 4);
  const lineLengths = japanese.lines.map((line) => Array.from(line).length);
  assert.ok(Math.max(...lineLengths) - Math.min(...lineLengths) <= 1);
  assertNamePreserved(japanese);
});

test('Han-only names use locale fallback and mixed scripts keep the detected writing system', () => {
  assert.equal(detectTypographyScript('星野雪'), 'japanese');
  assert.equal(detectTypographyScript('星野雪', 'korean'), 'korean');
  assert.equal(detectTypographyScript('Kael Orion', 'korean'), 'latin');
  assert.equal(getCardNameLayout('星野雪', 'en').script, 'japanese');
  assert.equal(getCardNameLayout('星野雪', 'ko').script, 'korean');
  assert.equal(getCardNameLayout('星野雪', 'ja').script, 'japanese');
  assert.equal(getCardNameLayout('雪ルナ', 'en').script, 'japanese');
  assert.equal(getCardNameLayout('雪루나', 'ja').script, 'korean');

  const mixed = getCardNameLayout('  카엘・Orion  ', 'en');
  assert.equal(mixed.script, 'korean');
  assert.equal(mixed.normalizedName, '카엘・Orion');
  assertNamePreserved(mixed);
});

test('line breaks do not split emoji graphemes or surrogate pairs', () => {
  const name = `A👩‍🚀${'B'.repeat(45)}`;
  const layout = getCardNameLayout(name, 'en');
  assert.equal(layout.lines.join(''), name);
  assert.equal(layout.lines.join('').includes('\uFFFD'), false);
});
