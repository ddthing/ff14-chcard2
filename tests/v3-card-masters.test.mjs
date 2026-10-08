import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const { MASTER_DESIGN_VERSION, MASTER_VISUAL_VERSION, MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } = await import('../src/lib/master-card-config.ts');
const { getEditorialBrushShape } = await import('../src/lib/card-graphics/editorial-shape.ts');
const { EDITORIAL_BRUSH_PATH } = await import('../src/lib/card-graphics/editorial-brush-path.ts');
const { CARD_NAME_ENVELOPES } = await import('../src/lib/card-name-envelope.ts');
const { CARD_STOCK_COPY } = await import('../src/lib/card-copy.ts');

const root = process.cwd();
const assetDir = resolve(root, 'public/assets/card-materials/v3');
const editorialTsx = readFileSync(resolve(root, 'src/components/cards/masters/editorial-master.tsx'), 'utf8');
const editorialCss = readFileSync(resolve(root, 'src/components/cards/masters/editorial-master.module.css'), 'utf8');
const identityTsx = readFileSync(resolve(root, 'src/components/cards/masters/identity-master.tsx'), 'utf8');
const identityCss = readFileSync(resolve(root, 'src/components/cards/masters/identity-master.module.css'), 'utf8');
const cinematicTsx = readFileSync(resolve(root, 'src/components/cards/masters/cinematic-master.tsx'), 'utf8');
const adventurerCards = readFileSync(resolve(root, 'src/components/cards/AdventurerCards.tsx'), 'utf8');
const attribution = readFileSync(resolve(root, 'src/components/ffxiv/ffxiv-attribution.tsx'), 'utf8');
const cardCss = readFileSync(resolve(root, 'src/components/cards/Cards.module.css'), 'utf8');

test('V3 advances only the visual version while keeping the stable masters and field registry', () => {
  assert.equal(MASTER_DESIGN_VERSION, '2.6.4');
  assert.equal(MASTER_VISUAL_VERSION, '3.0.0');
  assert.deepEqual(MASTER_TEMPLATE_ORDER, ['cinematic', 'editorial', 'id-card']);
  assert.deepEqual(MASTER_TEMPLATE_ORDER.map(family => MASTER_CARD_CONFIG[family].id), [
    'cinematic-master', 'editorial-master', 'identity-master',
  ]);
  assert.ok(MASTER_CARD_CONFIG['id-card'].defaultFields.includes('languages'));
  assert.ok(MASTER_CARD_CONFIG['id-card'].defaultFields.includes('playStyles'));
});

test('editorial embeds the exact supplied brush path as a unique local SVG clip', () => {
  const outlinePath = resolve(assetDir, 'editorial-brush-outline.svg');
  assert.ok(existsSync(outlinePath));
  assert.equal(existsSync(resolve(assetDir, 'editorial-brush-clip.svg')), false);
  assert.equal(existsSync(resolve(assetDir, 'editorial-brush-mask.png')), false);
  const outline = readFileSync(outlinePath, 'utf8');
  assert.equal(createHash('sha256').update(outline).digest('hex'), '2cb6ff660c5087ae2c10a605cf7bb65599f78108a440f6960812047a46ffdfcd');
  assert.match(outline, /viewBox="0 0 1024 1536"/);
  assert.ok(outline.length > 1000);
  const pathData = content => content.match(/<path\b[^>]*\bd="([^"]+)"/s)?.[1];
  assert.equal(EDITORIAL_BRUSH_PATH, pathData(outline), 'inline clip keeps the exact path from the supplied outline');

  for (const ratio of ['1:1', '4:5', '3:4', '9:16', '16:9']) {
    const shape = getEditorialBrushShape(ratio);
    assert.equal(shape.inkOutline, '/assets/card-materials/v3/editorial-brush-outline.svg');
  }
  assert.match(editorialCss, /\.photoClip\s*\{[^}]*clip-path:\s*var\(--editorial-brush-clip\)/s);
  assert.match(editorialCss, /\.brushUnderlay\s*\{[^}]*clip-path:\s*var\(--editorial-brush-clip\)/s);
  assert.match(editorialCss, /data-brush-composition='side-panel'[\s\S]*?max-width:\s*calc\(var\(--editorial-copy-left\) - var\(--editorial-photo-left\) - 1\.8%\)/);
  assert.match(editorialCss, /data-brush-composition='stacked'[\s\S]*?max-width:\s*none/);
  assert.doesNotMatch(editorialCss, /mask-image|editorial-brush-mask/);
  const glyphRule = editorialCss.match(/\.jobGlyph\s*\{([^}]+)\}/s)?.[1] ?? '';
  assert.doesNotMatch(glyphRule, /mask-image|clip-path|brush-clip/);
  assert.match(editorialTsx, /<JobIcon[\s\S]*?usage="cardDisplay"/);
  assert.match(editorialTsx, /<ArtPhoto data=\{data\} className=\{styles\.photoArt\}/);
  assert.match(editorialTsx, /useId\(\)/);
  assert.match(editorialTsx, /clipPathUnits="objectBoundingBox"/);
  assert.match(editorialTsx, /transform="scale\(0\.0009765625 0\.0006510416666666666\)"/);
  assert.equal([...editorialTsx.matchAll(/data-card-local-clip=\{brushClipId\}/g)].length, 2);
  assert.match(editorialTsx, /url\(#\$\{brushClipId\}\)/);
  assert.doesNotMatch(editorialTsx, /editorial-brush-clip\.svg#|editorial-brush-mask\.png/);
  assert.equal(CARD_STOCK_COPY.editorial.en.warriorOfLight, 'Warrior of Light');
  assert.equal(CARD_STOCK_COPY.editorial.en.story, 'More stories ahead.');
  assert.match(editorialCss, /\.masthead\s*\{[^}]*display:\s*grid/s);
  assert.match(editorialCss, /font-family:\s*'Pinyon Script'/);
  for (const row of ['job', 'level', 'world', 'data-center', 'lineage', 'free-company', 'service']) {
    assert.ok(editorialTsx.includes(`id: '${row}'`), `editorial row ${row} exists`);
  }
  assert.match(editorialCss, /\.jobInsignia\s*\{[^}]*top:\s*65\.7%/s);
  assert.match(editorialCss, /\.jobGlyph\s*\{[^}]*width:\s*22\.5cqi\s*!important/s);
});

test('the three V3 masters render live data and rely on one shared copyright credit', () => {
  for (const source of [cinematicTsx, editorialTsx, identityTsx]) {
    assert.match(source, /<ArtPhoto data=\{data\}/);
    assert.doesNotMatch(source, /© SQUARE ENIX/);
    assert.doesNotMatch(source, /figma\.com\/api\/mcp\/asset|data:image\//);
  }
  assert.match(adventurerCards, /<CardAssetAttribution character=\{character\} jobId=\{job\.id\} locale=\{locale\} visible=\{jobMotifVisible\} \/>/);
  assert.match(attribution, /<span>© SQUARE ENIX<\/span>/);
  assert.match(cardCss, /\.card\[data-layout='a'\] \.cardAttribution/);
  assert.match(identityTsx, /name=\{nameLayout\.normalizedName\}/);
  assert.match(identityCss, /\.name\s*\{[^}]*text-transform:\s*uppercase/s);
  assert.match(identityCss, /font-family:\s*var\(--font-ui-latin/);
  assert.match(identityCss, /font-weight:\s*900/);
  assert.match(identityCss, /color:\s*#7e3831/);
  assert.ok(CARD_NAME_ENVELOPES['id-card']['4:5'].width >= 48);
  assert.ok(CARD_NAME_ENVELOPES['id-card']['4:5'].caps.korean < CARD_NAME_ENVELOPES['id-card']['4:5'].caps.latin);
  assert.match(identityCss, /\.records\s*\{[^}]*align-content:\s*stretch/s);
  assert.match(identityCss, /\.recordColumn\s*\{[^}]*height:\s*100%/s);
  assert.equal(CARD_STOCK_COPY.brand.recordMark, 'XIV');
  assert.deepEqual(CARD_STOCK_COPY.identity.en.banner, ['PEOPLE', 'PLACES', 'STORIES']);
  assert.equal(CARD_STOCK_COPY.identity.en.photoQuote[0], 'Small steps lead to');
  assert.equal(CARD_STOCK_COPY.identity.en.photoStamp[0], 'ANOTHER DAY');
  assert.match(cinematicTsx, /<OpticalName[\s\S]*?name=\{nameLayout\.normalizedName\}/);
  assert.match(cinematicTsx, /data-cinema-fact="world-data-center"/);
  assert.doesNotMatch(editorialTsx, /© SQUARE ENIX/);
  assert.doesNotMatch(identityTsx, /© SQUARE ENIX/);
  assert.doesNotMatch(cinematicTsx, /© SQUARE ENIX/);
});
