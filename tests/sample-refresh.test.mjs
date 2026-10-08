import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);
const { normalizeCardData } = await import('../src/store/editor-persistence.ts');
const { demoAdventurerCards } = await import('../src/components/cards/types.ts');

test('existing drafts retain their chosen image, name and crop when the default sample changes', () => {
  const retired = { cinematic: ['/images/hero-adventurer.webp', 'Luna Nyx'], editorial: ['/images/kael-adventurer.webp', 'Kai Valen'], 'id-card': ['/images/seraphine-adventurer.webp', 'Seraphine Noir'] };
  for (const [family, [imageUrl, name]] of Object.entries(retired)) {
    const current = demoAdventurerCards[family];
    const restored = normalizeCardData({ ...current, character: {...current.character, name}, imageUrl, design: {...current.design, ratio:'9:16'}, imageAdjustments:{...current.imageAdjustments,x:99} });
    assert.equal(restored.imageUrl,imageUrl);
    assert.equal(existsSync(new URL(`../public${imageUrl}`,import.meta.url)),true);
    assert.equal(restored.character.name,name);
    assert.equal(restored.design.ratio,'9:16');
    assert.deepEqual(restored.imageAdjustments,{...current.imageAdjustments,x:99});
  }
});

test('uploaded images, custom names and their edits survive preset refresh', () => {
  const base=demoAdventurerCards.cinematic;
  const restored=normalizeCardData({...base,character:{...base.character,name:'My adventurer'},imageUrl:'data:image/png;base64,aGVsbG8=',imageAdjustments:{...base.imageAdjustments,x:17,y:81,scale:1.4}});
  assert.equal(restored.character.name,'My adventurer');
  assert.equal(restored.imageUrl,'data:image/png;base64,aGVsbG8=');
  assert.equal(restored.imageAdjustments.x,17);
  assert.equal(restored.imageAdjustments.y,81);
  assert.equal(restored.imageAdjustments.scale,1.4);
});


