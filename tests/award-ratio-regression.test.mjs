import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import test from 'node:test';
import { evidenceTests } from './qa-evidence-gate.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exportDirectory = resolvePath(root, 'docs/qa/award-pass/exports');
const evidenceTest = evidenceTests(test, 'award-pass');
const families = ['cinematic', 'editorial', 'id-card'];
const ratios = ['1:1', '4:5', '3:4', '9:16', '16:9'];
const primaryFields = {
  cinematic: ['name', 'job', 'level', 'world'],
  editorial: ['name', 'job', 'race', 'clan'],
  'id-card': ['name', 'job', 'world', 'dataCenter', 'race', 'clan', 'freeCompany'],
};

function exportStem(family, locale, ratio) {
  return `${family}-${locale}-${ratio.replace(':', 'x')}-2x`;
}

async function loadExport(family, locale, ratio) {
  const stem = exportStem(family, locale, ratio);
  const jsonPath = resolvePath(exportDirectory, `${stem}.json`);
  const pngPath = resolvePath(exportDirectory, `${stem}.png`);
  const metadata = JSON.parse(await readFile(jsonPath, 'utf8'));

  assert.equal(metadata.family, family, `${stem}: family metadata`);
  assert.equal(metadata.locale, locale, `${stem}: locale metadata`);
  assert.equal(metadata.ratio, ratio, `${stem}: ratio metadata`);
  assert.equal(metadata.scale, 2, `${stem}: export scale`);
  assert.equal(metadata.format, 'png', `${stem}: export format`);
  assert.equal(metadata.size.scale, metadata.scale, `${stem}: raster scale metadata`);

  assert.ok(Array.isArray(metadata.images) && metadata.images.length > 0, `${stem}: image readiness metadata`);
  for (const image of metadata.images) {
    assert.equal(image.loaded, true, `${stem}: image did not finish loading (${image.src})`);
  }
  assert.equal(metadata.fonts, 'loaded', `${stem}: fonts were not ready at capture time`);

  // Decode every output, rather than only trusting the PNG dimensions in its header.
  const pngHeader = await sharp(pngPath).metadata();
  assert.equal(pngHeader.format, 'png', `${stem}: file is not a PNG`);
  const decodedPng = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  assert.ok(decodedPng.data.length > 0, `${stem}: PNG decoded to no pixels`);
  assert.deepEqual(
    { width: decodedPng.info.width, height: decodedPng.info.height },
    { width: metadata.size.width, height: metadata.size.height },
    `${stem}: decoded PNG dimensions disagree with capture metadata`,
  );

  return metadata;
}

evidenceTest('Award exports retain primary fields, readiness, and PNG dimensions across all families and ratios', async (t) => {
  for (const family of families) {
    for (const ratio of ratios) {
      await t.test(`${family} EN ${ratio}`, async () => {
        const metadata = await loadExport(family, 'en', ratio);
        const fields = new Map(metadata.fields.map((field) => [field.field, field]));

        for (const requiredField of primaryFields[family]) {
          const field = fields.get(requiredField);
          assert.ok(field, `${family}/${ratio}: missing primary field ${requiredField}`);
          assert.equal(field.priority, 'primary', `${family}/${ratio}: ${requiredField} lost primary priority`);
          assert.equal(field.inside, true, `${family}/${ratio}: ${requiredField} escaped the card`);
          assert.ok(field.text?.trim(), `${family}/${ratio}: ${requiredField} has no visible text`);
        }

        for (const field of metadata.fields.filter((entry) => entry.priority === 'primary')) {
          assert.equal(field.inside, true, `${family}/${ratio}: ${field.field} is outside the card`);
        }
      });
    }
  }
});

evidenceTest('Korean and Japanese 4:5 exports include script-appropriate character names', async (t) => {
  for (const family of families) {
    for (const locale of ['ko', 'ja']) {
      await t.test(`${family} ${locale}`, async () => {
        const metadata = await loadExport(family, locale, '4:5');
        const name = metadata.fields.find((field) => field.field === 'name');
        assert.ok(name, `${family}/${locale}: missing character name`);
        assert.equal(name.priority, 'primary', `${family}/${locale}: name lost primary priority`);
        assert.equal(name.inside, true, `${family}/${locale}: name escaped the card`);
        assert.ok(name.text?.trim(), `${family}/${locale}: character name is blank`);

        const localizedNamePattern = locale === 'ko'
          ? /\p{Script=Hangul}/u
          : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
        assert.match(name.text, localizedNamePattern, `${family}/${locale}: name is not in its expected script`);
      });
    }
  }
});
