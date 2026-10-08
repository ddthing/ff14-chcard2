import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
register('./ts-alias-loader.mjs', import.meta.url);
import { isSampleArtworkSource, transitionImageDragHint } from '../src/components/editor/editor-ux.ts';
const { demoAdventurerCards, demoAdventurerData } = await import('../src/components/cards/types.ts');

test('all bundled template samples are identified while a legacy data URL remains user artwork', () => {
  const sampleSources = new Set([
    demoAdventurerData.imageUrl,
    ...Object.values(demoAdventurerCards).map((card) => card.imageUrl),
  ]);

  assert.equal(isSampleArtworkSource(demoAdventurerData.imageUrl, sampleSources), true);
  for (const sampleCard of Object.values(demoAdventurerCards)) {
    assert.equal(isSampleArtworkSource(sampleCard.imageUrl, sampleSources), true);
  }
  assert.equal(isSampleArtworkSource('data:image/jpeg;base64,dXNlci1pbWFnZQ==', sampleSources), false);
  assert.equal(isSampleArtworkSource('data:image/webp;base64,dXNlci1pbWFnZQ==', sampleSources), false);
});

test('mobile upload hint stays pending under the sheet and becomes visible after the canvas is available', () => {
  let phase = transitionImageDragHint('idle', 'successful-upload');
  assert.equal(phase, 'pending', 'upload succeeds while the mobile sheet is covering the canvas');

  phase = transitionImageDragHint(phase, 'canvas-available');
  assert.equal(phase, 'visible', 'closing the sheet starts the hint timer from its visible state');
  assert.equal(transitionImageDragHint(phase, 'timeout'), 'finished');

  let desktopPhase = transitionImageDragHint('idle', 'successful-upload');
  desktopPhase = transitionImageDragHint(desktopPhase, 'canvas-available');
  assert.equal(desktopPhase, 'visible', 'desktop can show the hint as soon as upload succeeds');
});

test('an image drag or reset to sample cancels a pending hint for the rest of the editor session', () => {
  const pending = transitionImageDragHint('idle', 'successful-upload');
  assert.equal(transitionImageDragHint(pending, 'image-drag'), 'finished');
  assert.equal(transitionImageDragHint(pending, 'sample-reset'), 'finished');
  assert.equal(transitionImageDragHint('finished', 'canvas-available'), 'finished');

  const experiencedSession = transitionImageDragHint('idle', 'image-drag');
  assert.equal(transitionImageDragHint(experiencedSession, 'successful-upload'), 'finished');
});
