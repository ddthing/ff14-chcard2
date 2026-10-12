import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('./ts-alias-loader.mjs', import.meta.url);

const {
  CARD_TEXTURE_EFFECTS,
  CARD_TEXTURE_LAYER_ORDER,
  DEFAULT_CARD_TEXTURE_INTENSITY,
  getCardTextureEffectIntensity,
  normalizeCardTextureIntensity,
  toggleCardTextureEffect,
} = await import('../src/lib/card-texture-effects.ts');
const [{ editorStore }, { demoAdventurerData }, { normalizeCardData }] = await Promise.all([
  import('../src/store/editor-store.ts'),
  import('../src/components/cards/types.ts'),
  import('../src/store/editor-persistence.ts'),
]);

function restoreDemoCard() {
  editorStore.getState().replaceCardData(demoAdventurerData, {
    persist: false,
    recordHistory: false,
    saveStatus: 'saved',
  });
}

test('new card texture layers have stable independent IDs and a defined paint order', () => {
  assert.deepEqual(CARD_TEXTURE_EFFECTS, ['xerox', 'halftone', 'distressed']);
  assert.deepEqual(CARD_TEXTURE_LAYER_ORDER, ['xerox', 'halftone', 'distressed']);
  assert.deepEqual(DEFAULT_CARD_TEXTURE_INTENSITY, { xerox: 22, halftone: 18, distressed: 15 });
});

test('texture strength defaults moderately and clamps saved or edited values to the slider range', () => {
  assert.equal(getCardTextureEffectIntensity(undefined, 'xerox'), 22);
  assert.equal(getCardTextureEffectIntensity({ halftone: 36 }, 'halftone'), 36);
  assert.equal(normalizeCardTextureIntensity(-1, 'distressed'), 0);
  assert.equal(normalizeCardTextureIntensity(101, 'distressed'), 100);
  assert.equal(normalizeCardTextureIntensity(41.7, 'distressed'), 42);
  assert.equal(normalizeCardTextureIntensity(Number.NaN, 'halftone'), 18);
});

test('saved effect strengths keep valid layer keys and clamp malformed values', () => {
  const normalized = normalizeCardData({
    ...demoAdventurerData,
    design: {
      ...demoAdventurerData.design,
      effectIntensity: { xerox: -8, halftone: 42, distressed: 108, 'bad key': 55, invalid: Number.NaN },
    },
  });

  assert.deepEqual(normalized.design.effectIntensity, { xerox: 0, halftone: 42, distressed: 100 });
});

test('toggling a texture preserves all other existing effects and removes only its own ID', () => {
  const initial = ['grain', 'holographic', 'grain', 'vignette'];
  assert.deepEqual(toggleCardTextureEffect(initial, 'xerox'), [...initial, 'xerox']);
  assert.deepEqual(toggleCardTextureEffect([...initial, 'halftone'], 'halftone'), initial);
});

test('a continuous texture strength edit groups into one design undo and preserves stacked effects', () => {
  const effects = ['grain', 'holographic', 'xerox', 'halftone'];
  const card = {
    ...demoAdventurerData,
    design: {
      ...demoAdventurerData.design,
      effects,
      effectIntensity: { xerox: 22, halftone: 18 },
    },
  };

  try {
    editorStore.getState().replaceCardData(card, { persist: false, recordHistory: false });
    editorStore.getState().beginHistoryGroup('texture-intensity-xerox', 'design');
    editorStore.getState().setDesign({ effectIntensity: { xerox: 34, halftone: 18 } });
    editorStore.getState().setDesign({ effectIntensity: { xerox: 51, halftone: 18 } });
    editorStore.getState().endHistoryGroup();

    assert.equal(editorStore.getState().history.past.length, 1);
    assert.deepEqual(editorStore.getState().design.effects, effects);
    assert.equal(editorStore.getState().design.effectIntensity.xerox, 51);

    editorStore.getState().undo();
    assert.deepEqual(editorStore.getState().design.effects, effects);
    assert.deepEqual(editorStore.getState().design.effectIntensity, { xerox: 22, halftone: 18 });

    editorStore.getState().redo();
    assert.equal(editorStore.getState().design.effectIntensity.xerox, 51);
  } finally {
    restoreDemoCard();
  }
});
