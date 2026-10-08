import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';
import {readFile, readdir} from 'node:fs/promises';
import sharp from 'sharp';

const folder = new URL('../docs/qa/reference-detail/exports/', import.meta.url);
const evidenceTest=evidenceTests(test,'reference-detail');
const read = async name => JSON.parse(await readFile(new URL(name, folder), 'utf8'));

evidenceTest('reference detail exports preserve name ink, real assets and shadow-free outlined credit', async () => {
  const files = (await readdir(folder)).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 64);
  for (const name of files) {
    const capture = await read(name);
    assert.equal(capture.credit, '© SQUARE ENIX', name);
    assert.equal(capture.fonts, 'loaded', name);
    assert.ok(capture.images.every(image => image.loaded), name);
    assert.ok(capture.shadows.every(text => text.shadow === 'none'), name);
    assert.equal(capture.optical.opticalReady, 'true', name);
    assert.equal(capture.assetOpticalSnapshots[0].ready, 'true', name);
    assert.equal(capture.assetOpticalSnapshots[0].size, capture.optical.opticalSize, name);
    const nameField = capture.fields.find(field => field.field === 'name');
    assert.ok(nameField.inside && nameField.inkInside, name);
    // DOM textContent concatenates deliberate line spans without their visual break.
    assert.equal(nameField.text.replace(/\s/g, ''), capture.character.name.replace(/\s/g, ''), name);
    assert.match(capture.imageUrl, /^\/assets\/samples\/coner\/optimized\/(portrait|landscape)\.webp$/, name);
  }
});

evidenceTest('reference detail PNG and WebP retain the same live typography and card geometry', async () => {
  for (const family of ['cinematic', 'editorial', 'id-card']) {
    const stem = `${family}-latin-4x5-2x`;
    const png = await read(`${stem}.json`);
    const webp = await read(`${stem}-webp.json`);
    assert.deepEqual(png.fields, webp.fields, family);
    assert.deepEqual(png.optical, webp.optical, family);
    assert.deepEqual(png.shapes, webp.shapes, family);
    for (const format of ['png', 'webp']) {
      const metadata = await sharp(await readFile(new URL(`${stem}.${format}`, folder))).metadata();
      assert.equal(metadata.width, 2160, `${family}/${format}`);
      assert.equal(metadata.height, 2700, `${family}/${format}`);
      assert.equal(metadata.format, format === 'png' ? 'png' : 'webp');
    }
  }
});
