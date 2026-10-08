import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
globalThis.__cardLocalizationCreateElement = createElement;

function findModule(specifier, parentURL) {
  const base = specifier.startsWith('@/')
    ? resolve(process.cwd(), 'src', specifier.slice(2))
    : resolve(dirname(fileURLToPath(parentURL)), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/image') return { url: 'card-localization:next-image', shortCircuit: true };
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const file = findModule(specifier, context.parentURL);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'card-localization:next-image') {
      return {
        format: 'module',
        source: 'export default function Image(props) { const { fill, unoptimized, priority, ...attributes } = props; return globalThis.__cardLocalizationCreateElement("img", attributes); }',
        shortCircuit: true,
      };
    }

    if (url.startsWith('file:')) {
      const file = fileURLToPath(url);
      if (file.endsWith('.module.css')) {
        return {
          format: 'module',
          source: 'export default new Proxy({}, { get: (_target, key) => String(key) });',
          shortCircuit: true,
        };
      }
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const source = readFileSync(file, 'utf8');
        const output = ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
          fileName: file,
        }).outputText;
        return { format: 'module', source: output, shortCircuit: true };
      }
    }

    return nextLoad(url, context);
  },
});

const [{ CinematicMaster }, { EditorialMaster }, { IdentityMaster }, { getConerSample }] = await Promise.all([
  import('../src/components/cards/masters/cinematic-master.tsx'),
  import('../src/components/cards/masters/editorial-master.tsx'),
  import('../src/components/cards/masters/identity-master.tsx'),
  import('../src/components/cards/types.ts'),
]);
const { GLOBAL_WORLDS, getDataCenter, getWorld, findWorld, localizeFfxivLabel } = await import('../src/data/ffxiv/index.ts');
const { localizeCardWorld } = await import('../src/lib/card-microcopy.ts');
const { getCardDisplayBio } = await import('../src/lib/card-copy.ts');
const [{ CinematicCard, EditorialCard, AdventurerIdCard }, { getCardFontRequest, getCardPreviewFontRequestKey, loadCardPreviewFonts }] = await Promise.all([
  import('../src/components/cards/AdventurerCards.tsx'),
  import('../src/components/editor/card-preview.tsx'),
]);

const masters = [CinematicMaster, EditorialMaster, IdentityMaster];
const stockEnglish = [
  'A BRIGHTER', 'TOMORROW', 'Small steps,', 'great wonders.', 'Adventures', 'in good company',
  'EORZEA', 'ADVENTURER CARD', 'More stories ahead.', 'Warrior of Light', 'PEOPLE', 'PLACES',
  'STORIES', 'Small steps lead to', 'grand journeys.', 'ANOTHER DAY', 'IN EORZEA',
];

function makeData(template) {
  const data = getConerSample(template, '4:5');
  data.character = {
    ...data.character,
    name: 'Coner',
    freeCompany: 'Ember Bloom',
    bio: 'My own story.',
  };
  return data;
}

function textContent(markup) {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('all three Korean card masters localize profile metadata and stock copy while preserving custom fields', () => {
  const templates = ['cinematic', 'editorial', 'id-card'];

  for (const [index, Master] of masters.entries()) {
    const markup = renderToStaticMarkup(createElement(Master, {
      data: makeData(templates[index]),
      locale: 'ko',
    }));
    const text = textContent(markup);

    for (const visible of ['모그리', '카오스', '레벨', '100', 'Ember Bloom', 'My own story.']) {
      assert.ok(text.includes(visible), `${Master.name} should print ${visible}`);
    }
    assert.match(markup, /alt="Coner 모험가 초상"/);
    for (const englishCopy of stockEnglish) {
      assert.ok(!text.includes(englishCopy), `${Master.name} should translate decorative copy: ${englishCopy}`);
    }
    assert.ok(!text.includes('LEVEL'), `${Master.name} should keep the level label in Korean`);
  }
});

test('record and editorial facts use localized service, region, language, race, clan, and play-style names', () => {
  const editorial = textContent(renderToStaticMarkup(createElement(EditorialMaster, {
    data: makeData('editorial'),
    locale: 'ko',
  })));
  const record = textContent(renderToStaticMarkup(createElement(IdentityMaster, {
    data: makeData('id-card'),
    locale: 'ko',
  })));

  for (const visible of ['서비스 · 지역', '글로벌 · 유럽', '라라펠', '사막 부족']) {
    assert.ok(record.includes(visible), `record should print ${visible}`);
  }
  for (const visible of ['서비스 · 지역', '글로벌 · 유럽', '라라펠', '사막 부족']) {
    assert.ok(editorial.includes(visible), `editorial card should print ${visible}`);
  }
  for (const visible of ['한국어', '영어', '탐험', '퀘스트']) {
    assert.ok(record.includes(visible), `record should print ${visible}`);
  }
  assert.ok(record.includes('불멸대'));
});

test('known Korean Global world labels preserve canonical IDs and English search names', () => {
  const knownWorlds = [
    ['global.chaos.moogle', 'Moogle', '모그리'],
    ['global.mana.chocobo', 'Chocobo', '초코보'],
    ['global.elemental.carbuncle', 'Carbuncle', '카벙클'],
    ['global.elemental.tonberry', 'Tonberry', '톤베리'],
    ['global.gaia.fenrir', 'Fenrir', '펜리르'],
    ['global.gaia.bahamut', 'Bahamut', '바하무트'],
  ];

  for (const [id, english, korean] of knownWorlds) {
    const world = GLOBAL_WORLDS.find((candidate) => candidate.id === id);
    assert.ok(world, `${id} remains a canonical Global world`);
    assert.equal(localizeFfxivLabel('world', id, 'ko'), korean);
    const legacyCharacter = {
      ...getConerSample('cinematic', '4:5').character,
      world: english,
      worldId: undefined,
      service: 'global',
      physicalRegionId: world.physicalRegionId,
      dataCenterId: world.dataCenterId,
    };
    assert.equal(localizeCardWorld(legacyCharacter, 'ko'), korean);
    assert.equal(localizeFfxivLabel('world', id, 'en'), english);
    assert.equal(findWorld(english, { service: 'global' })?.id, id);
    assert.equal(getWorld(id)?.id, id);
  }

  assert.equal(localizeFfxivLabel('dataCenter', 'global.chaos', 'ko'), '카오스');
  assert.equal(getDataCenter('Chaos')?.id, 'global.chaos');
});

test('legacy b/c card layouts localize stock headings and keep Korean level labels', () => {
  const cards = [
    [CinematicCard, 'cinematic', ['모험가 기록', '하이델린', '에오르제아']],
    [EditorialCard, 'editorial', ['모험가', '여행 기록', '에오르제아']],
    [AdventurerIdCard, 'id-card', ['모험가 신원 기록', '에오르제아 모험가 프로필']],
  ];
  const oldStockEnglish = ['ADVENTURER RECORD', 'HYDAELYN', 'EORZEA', 'FIELD NOTES', 'ADVENTURER IDENTIFICATION', 'EORZEAN CHARACTER PROFILE', 'Lv.', 'LV.'];

  for (const [Card, template, expected] of cards) {
    for (const layoutVariant of ['b', 'c']) {
      const data = makeData(template);
      data.design.layoutVariant = layoutVariant;
      const markup = renderToStaticMarkup(createElement(Card, { data, locale: 'ko' }));
      const text = textContent(markup);
      for (const visible of [...expected, '서버', '모그리', '카오스', '레벨', '100', '한국어', '영어', 'Ember Bloom', 'My own story.']) {
        assert.ok(text.includes(visible), `${Card.name} ${layoutVariant} should print ${visible}`);
      }
      assert.match(markup, /aria-label="Coner, 적마도사 모험가 카드"/);
      assert.match(markup, /alt="Coner 모험가 초상"/);
      for (const englishCopy of oldStockEnglish) {
        assert.ok(!text.includes(englishCopy), `${Card.name} ${layoutVariant} should translate ${englishCopy}`);
      }
    }
  }
});

test('only the untouched built-in sample bio localizes for its bundled sample image', () => {
  const templates = ['cinematic', 'editorial', 'id-card'];
  const koreanBio = '작은 걸음이 모여 긴 여정으로 이어집니다.';
  const japaneseBio = '小さな一歩から、長い旅へ。';

  for (const [index, Master] of masters.entries()) {
    const data = getConerSample(templates[index], '4:5');
    assert.equal(data.character.bio, 'Small steps, long journeys.');
    assert.equal(getCardDisplayBio(data.character, data.imageUrl, 'ko'), koreanBio);
    assert.equal(getCardDisplayBio(data.character, data.imageUrl, 'ja'), japaneseBio);
    const korean = textContent(renderToStaticMarkup(createElement(Master, { data, locale: 'ko' })));
    const japanese = textContent(renderToStaticMarkup(createElement(Master, { data, locale: 'ja' })));
    assert.ok(korean.includes(koreanBio));
    assert.ok(!korean.includes('Small steps, long journeys.'));
    assert.ok(japanese.includes(japaneseBio));
    assert.ok(!japanese.includes('Small steps, long journeys.'));
    assert.equal(data.character.bio, 'Small steps, long journeys.', 'display localization must not rewrite persisted sample data');
  }

  const sample = getConerSample('cinematic', '4:5');
  const uploadedImage = { ...sample.character };
  const uploadData = { ...sample, imageUrl: '/uploads/player-photo.webp' };
  assert.equal(getCardDisplayBio(uploadedImage, uploadData.imageUrl, 'ko'), 'Small steps, long journeys.');
  assert.equal(getCardDisplayBio({ ...sample.character, bio: 'Small steps, long journeys. ' }, sample.imageUrl, 'ko'), 'Small steps, long journeys. ');
  assert.equal(getCardDisplayBio({ ...sample.character, bio: 'My own story.' }, sample.imageUrl, 'ko'), 'My own story.');
});

test('legacy card layouts localize the built-in sample bio under the same source match', () => {
  const cards = [
    [CinematicCard, 'cinematic'],
    [EditorialCard, 'editorial'],
    [AdventurerIdCard, 'id-card'],
  ];

  for (const [Card, template] of cards) {
    const data = getConerSample(template, '4:5');
    data.design.layoutVariant = 'b';
    const text = textContent(renderToStaticMarkup(createElement(Card, { data, locale: 'ko' })));
    assert.ok(text.includes('작은 걸음이 모여 긴 여정으로 이어집니다.'));
    assert.ok(!text.includes('Small steps, long journeys.'));
    assert.equal(data.character.bio, 'Small steps, long journeys.');
  }
});

test('preview font requests include the selected locale’s fixed card glyphs', () => {
  const data = makeData('editorial');
  const korean = getCardFontRequest(data.character, 'ko', 'editorial');
  const japanese = getCardFontRequest(data.character, 'ja', 'id-card');

  assert.ok(korean.textByScript.korean?.includes('빛의 전사'));
  assert.ok(korean.textByScript.korean?.includes('이야기는 계속됩니다.'));
  assert.ok(korean.textByScript.korean?.includes('서버'));
  assert.ok(korean.textByScript.latin?.includes('FINAL FANTASY XIV'));
  assert.ok(japanese.textByScript.japanese?.includes('冒険者の記録'));
  assert.ok(japanese.textByScript.japanese?.includes('レベル'));

  const sample = getConerSample('cinematic', '4:5');
  const sampleRequest = getCardFontRequest(sample.character, 'ko', 'cinematic', sample.imageUrl);
  assert.ok(sampleRequest.textByScript.korean?.includes('작은 걸음이 모여 긴 여정으로 이어집니다.'));
  assert.ok(!Object.values(sampleRequest.textByScript).some((text) => text.includes('Small steps, long journeys.')));
});

test('preview font key tracks rendered text and font choices while ignoring unrelated character fields', () => {
  const data = makeData('editorial');
  const fontData = {
    character: data.character,
    imageUrl: data.imageUrl,
    design: {
      typographyPreset: data.design.typographyPreset,
      template: data.design.template,
      layoutVariant: data.design.layoutVariant,
    },
  };
  const key = getCardPreviewFontRequestKey(fontData, 'ko');

  assert.equal(getCardPreviewFontRequestKey({
    ...fontData,
    character: { ...fontData.character, level: fontData.character.level + 1 },
  }, 'ko'), key);
  assert.notEqual(getCardPreviewFontRequestKey({
    ...fontData,
    character: { ...fontData.character, name: '다른 이름' },
  }, 'ko'), key);
  assert.notEqual(getCardPreviewFontRequestKey(fontData, 'ja'), key);
  assert.ok(key.includes('이야기는 계속됩니다.'));
});

test('preview font waits stop when their owning render is cancelled', async () => {
  const originalDocument = globalThis.document;
  let calls = 0;
  let resolveFont;
  globalThis.document = {
    fonts: {
      load: () => {
        calls += 1;
        return new Promise((resolve) => { resolveFont = resolve; });
      },
      ready: Promise.resolve(),
    },
  };
  const data = makeData('cinematic');
  const controller = new AbortController();

  try {
    const pending = loadCardPreviewFonts({
      character: { ...data.character, name: 'Ari Sol', bio: '' },
      imageUrl: data.imageUrl,
      design: { typographyPreset: 'editorial', template: 'cinematic', layoutVariant: 'a' },
    }, 'en', { signal: controller.signal, timeoutMs: 1000, source: 'preview' });
    for (let attempt = 0; attempt < 10 && calls === 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(calls, 1);
    controller.abort();
    await assert.rejects(pending, (error) => error?.code === 'cancelled');
    resolveFont([]);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('repeated preview readiness reuses its fixed handwritten font requests', async () => {
  const originalDocument = globalThis.document;
  const calls = [];
  globalThis.document = {
    fonts: {
      load: async (font, text) => {
        calls.push([font, text]);
        return [{ family: font }];
      },
      ready: Promise.resolve(),
    },
  };
  const data = makeData('cinematic');
  const fontData = {
    character: data.character,
    imageUrl: data.imageUrl,
    design: { typographyPreset: 'editorial', template: 'cinematic', layoutVariant: 'a' },
  };

  try {
    await loadCardPreviewFonts(fontData, 'en', { source: 'preview' });
    await loadCardPreviewFonts(fontData, 'en', { source: 'preview' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '400 24px "Pinyon Script"');
    assert.ok(calls[0][1].length > 0);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('English and Japanese label conventions remain coherent', () => {
  const english = textContent(renderToStaticMarkup(createElement(CinematicMaster, {
    data: makeData('cinematic'),
    locale: 'en',
  })));
  const japanese = textContent(renderToStaticMarkup(createElement(CinematicMaster, {
    data: makeData('cinematic'),
    locale: 'ja',
  })));
  const englishRecord = textContent(renderToStaticMarkup(createElement(IdentityMaster, {
    data: makeData('id-card'),
    locale: 'en',
  })));
  const japaneseRecord = textContent(renderToStaticMarkup(createElement(IdentityMaster, {
    data: makeData('id-card'),
    locale: 'ja',
  })));

  assert.ok(english.includes('Moogle'));
  assert.ok(english.includes('Chaos'));
  assert.ok(english.includes('LEVEL'));
  assert.ok(englishRecord.includes('Global · Europe'));
  assert.ok(englishRecord.includes('Korean'));
  assert.ok(englishRecord.includes('Exploration'));
  assert.ok(japanese.includes('Moogle'));
  assert.ok(japanese.includes('Chaos'));
  assert.ok(japanese.includes('レベル'));
  assert.ok(!japanese.includes('A BRIGHTER'));

  for (const [index, Master] of masters.entries()) {
    const japaneseText = textContent(renderToStaticMarkup(createElement(Master, {
      data: makeData(['cinematic', 'editorial', 'id-card'][index]),
      locale: 'ja',
    })));
    for (const englishCopy of stockEnglish) {
      assert.ok(!japaneseText.includes(englishCopy), `${Master.name} should translate Japanese decorative copy: ${englishCopy}`);
    }
  }
  assert.ok(japaneseRecord.includes('グローバル ・ 欧州'));
  assert.ok(japaneseRecord.includes('韓国語'));
  assert.ok(japaneseRecord.includes('探索'));
});
