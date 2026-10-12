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

const [{ CinematicMaster }, { EditorialMaster, getEditorialInformationFontContextKey }, { IdentityMaster }, { getConerSample }] = await Promise.all([
  import('../src/components/cards/masters/cinematic-master.tsx'),
  import('../src/components/cards/masters/editorial-master.tsx'),
  import('../src/components/cards/masters/identity-master.tsx'),
  import('../src/components/cards/types.ts'),
]);
const { GLOBAL_WORLDS, RACES, CLANS, getDataCenter, getWorld, findWorld, localizeFfxivLabel } = await import('../src/data/ffxiv/index.ts');
const { localizeCardWorld } = await import('../src/lib/card-microcopy.ts');
const { CARD_STOCK_COPY, getCardDisplayBio, getCardMasterCopy } = await import('../src/lib/card-copy.ts');
const { MASTER_TYPOGRAPHY_MAP, getTypographyFontFamily } = await import('../src/lib/typography-presets.ts');
const [{ CinematicCard, EditorialCard, AdventurerIdCard }, { getCardFontRequest, getCardPreviewFontRequestKey, loadCardPreviewFonts }] = await Promise.all([
  import('../src/components/cards/AdventurerCards.tsx'),
  import('../src/components/editor/card-preview.tsx'),
]);
const { loadTypographyFonts } = await import('../src/data/fonts/load-fonts.ts');
const { getFitFactMeasurementKey } = await import('../src/components/cards/craft/fit-fact-value.tsx');
const { observeCardTypographyChanges } = await import('../src/components/cards/card-typography-override-scaler.tsx');

const masters = [CinematicMaster, EditorialMaster, IdentityMaster];
const stockEnglish = [
  'A BRIGHTER', 'TOMORROW', 'Small steps,', 'great wonders.', 'Adventures', 'in good company',
  'EORZEA', 'ADVENTURER CARD', 'More stories ahead.', 'Warrior of Light', 'PEOPLE', 'PLACES',
  'STORIES', 'Small steps lead to', 'grand journeys.', 'ANOTHER DAY', 'IN EORZEA',
];
const editorialStyles = readFileSync(resolve(process.cwd(), 'src/components/cards/masters/editorial-master.module.css'), 'utf8');

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

function cardStyleProperties(markup) {
  const rootTag = markup.match(/<article\b[^>]*>/s)?.[0];
  const style = rootTag?.match(/\bstyle="([\s\S]*)"\s+data-template=/)?.[1];
  assert.ok(style, 'card root exposes its resolved typography properties');
  return Object.fromEntries(style.replaceAll('&quot;', '"').split(';').filter(Boolean).map((declaration) => {
    const separator = declaration.indexOf(':');
    return [declaration.slice(0, separator), declaration.slice(separator + 1)];
  }));
}

function opticalNameStyleProperties(markup, family) {
  const heading = markup.match(new RegExp(`<h2\\b(?=[^>]*data-optical-name="${family}")[^>]*>`, 'u'))?.[0];
  const style = heading?.match(/\bstyle="([\s\S]*)"\s+aria-label=/u)?.[1];
  assert.ok(style, `${family} title exposes its selected font family`);
  return Object.fromEntries(style.replaceAll('&quot;', '"').split(';').filter(Boolean).map((declaration) => {
    const separator = declaration.indexOf(':');
    return [declaration.slice(0, separator), declaration.slice(separator + 1)];
  }));
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

test('unknown level is omitted across all card families, layouts and ratios', () => {
  const cards = [CinematicCard, EditorialCard, AdventurerIdCard];
  const templates = ['cinematic', 'editorial', 'id-card'];
  for (let index = 0; index < cards.length; index += 1) {
    for (const layoutVariant of ['a', 'b', 'c']) {
      for (const ratio of ['1:1', '4:5', '3:4', '9:16', '16:9']) {
        const data = makeData(templates[index]);
        data.character.level = 0;
        data.design.layoutVariant = layoutVariant;
        data.design.ratio = ratio;
        const markup = renderToStaticMarkup(createElement(cards[index], { data, ratio, locale: 'ko' }));
        assert.ok(!markup.includes('data-field="level"'), `${templates[index]} ${layoutVariant} ${ratio} must omit unknown level`);
      }
    }
  }
});

test('legacy B/C card photos use the same processed-image readiness path and keep their photo alt', () => {
  const cards = [CinematicCard, EditorialCard, AdventurerIdCard];
  const templates = ['cinematic', 'editorial', 'id-card'];
  for (let index = 0; index < cards.length; index += 1) {
    for (const layoutVariant of ['b', 'c']) {
      const data = makeData(templates[index]);
      data.design.layoutVariant = layoutVariant;
      const markup = renderToStaticMarkup(createElement(cards[index], { data, locale: 'ko' }));
      assert.match(markup, /data-photo-print-ready="false"/);
      assert.match(markup, /data-photo-print-state="processing"/);
      assert.match(markup, /data-photo-print-fallback="true"/);
      assert.equal((markup.match(/alt="Coner 모험가 초상"/g) ?? []).length, 1);
    }
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

test('Editorial photo wash reuses the live image decoratively and stays absent without a photo', () => {
  const data = makeData('editorial');
  data.imageUrl = '/uploads/player-photo.webp';
  const markup = renderToStaticMarkup(createElement(EditorialMaster, { data, locale: 'ko' }));
  const imageTags = markup.match(/<img\b[^>]*>/g) ?? [];
  const photoImageTags = imageTags.filter(tag => tag.includes('src="/uploads/player-photo.webp"'));

  assert.equal(photoImageTags.length, 2, 'one decorative wash accompanies the original sharp photo');
  assert.ok(photoImageTags.every(tag => tag.includes('src="/uploads/player-photo.webp"')), 'all layers use the same live image source');
  assert.equal(photoImageTags.filter(tag => tag.includes('alt=""')).length, 1, 'the decorative wash has empty alt text');
  assert.match(markup, /data-photo-atmosphere=/);
  assert.equal((markup.match(/class="photoWashBackdrop"[^>]*><div class="photoWashImage"><div class="photo photoArt" aria-hidden="true">/g) ?? []).length, 1);
  assert.match(markup, /<div class="photo photoArt"><span class="imageSet"[^>]*data-photo-print-state="processing"[^>]*><img[^>]*src="\/uploads\/player-photo\.webp"[^>]*alt="Coner 모험가 초상"[^>]*data-photo-print-fallback="true"/);

  const withoutPhoto = { ...data, imageUrl: '' };
  const noPhotoMarkup = renderToStaticMarkup(createElement(EditorialMaster, { data: withoutPhoto, locale: 'ko' }));
  assert.doesNotMatch(noPhotoMarkup, /data-photo-atmosphere/);
  assert.doesNotMatch(noPhotoMarkup, /src="\/uploads\/player-photo\.webp"/);
});

test('complete Japanese Editorial lineage keeps both canonical segments intact at compact ratios', () => {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const combinations = RACES.flatMap((race) => CLANS
    .filter((clan) => clan.raceId === race.id)
    .map((clan) => ({ race, clan, length: [...segmenter.segment(race.localizedName.ja + clan.localizedName.ja)].length })));
  const longest = Math.max(...combinations.map(({ length }) => length));
  const longestPairs = combinations.filter(({ length }) => length === longest);

  assert.equal(longest, 13);
  assert.deepEqual(longestPairs.map(({ race, clan }) => `${race.id}/${clan.id}`).sort(), [
    'lalafell/dunesfolk',
    'lalafell/plainsfolk',
  ]);

  for (const ratio of ['4:5', '3:4', '1:1']) {
    for (const { race, clan } of longestPairs) {
      const data = makeData('editorial');
      data.character.raceId = race.id;
      data.character.race = race.localizedName.en;
      data.character.clanId = clan.id;
      data.character.clan = clan.localizedName.en;
      data.design.ratio = ratio;
      const markup = renderToStaticMarkup(createElement(EditorialMaster, { data, locale: 'ja', ratio }));
      const lineageStart = markup.indexOf('class="factValue completeLineage"');
      const lineageEnd = markup.indexOf('</dd>', lineageStart);
      const lineage = markup.slice(lineageStart, lineageEnd);

      assert.ok(lineageStart >= 0 && lineageEnd > lineageStart, `${ratio} renders compact full lineage`);
      assert.match(lineage, /data-field="race"[^>]*>ララフェル</);
      assert.ok(lineage.includes(clan.localizedName.ja), `${ratio} preserves ${clan.localizedName.ja}`);
      assert.match(lineage, /data-field="clan"/);
    }
  }

  const sparse = makeData('editorial');
  sparse.character.clanId = null;
  sparse.character.clan = '';
  assert.doesNotMatch(renderToStaticMarkup(createElement(EditorialMaster, { data: sparse, locale: 'ja' })), /class="factValue completeLineage"/);
  assert.match(editorialStyles, /\.canvas:lang\(ja\)\[data-ratio='4:5'\] \.completeLineage > span,[\s\S]*?\.canvas:lang\(ja\)\[data-ratio='3:4'\] \.completeLineage > span,[\s\S]*?\.canvas:lang\(ja\)\[data-ratio='1:1'\] \.completeLineage > span\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow-wrap:\s*normal/s);
});

test('decorative copy modes localize only fixed master text and preserve personal bios and required labels', () => {
  const cards = [
    { Card: CinematicCard, template: 'cinematic', family: 'cinematic' },
    { Card: EditorialCard, template: 'editorial', family: 'editorial' },
    { Card: AdventurerIdCard, template: 'id-card', family: 'identity' },
  ];
  const modes = ['none', 'default', 'adventure', 'companions'];
  const locales = ['ko', 'en', 'ja'];
  const alternateBio = {
    adventure: { ko: '새로운 여정이 시작됩니다.', en: 'A new journey begins.', ja: '新たな旅路が始まる。' },
    companions: { ko: '동료와 함께라면 더 멀리.', en: 'Better journeys together.', ja: '仲間と進む、遠い旅。' },
  };

  for (const locale of locales) {
    for (const { Card, template, family } of cards) {
      const stock = getCardMasterCopy(family, locale, 'default');
      const stockDecorativeValues = family === 'cinematic'
        ? [...stock.promise, ...stock.quote, ...stock.signature, stock.place]
        : family === 'editorial'
          ? [stock.story, stock.warriorOfLight]
          : [...stock.banner, stock.location, ...stock.photoQuote, ...stock.photoStamp];

      for (const mode of modes) {
        const data = getConerSample(template, '4:5');
        data.design.decorativeCopy = mode;
        const markup = renderToStaticMarkup(createElement(Card, { data, locale }));
        const text = textContent(markup);
        const selected = getCardMasterCopy(family, locale, mode);
        const selectedDecorativeValues = family === 'cinematic'
          ? [...selected.promise, ...selected.quote, ...selected.signature, selected.place]
          : family === 'editorial'
            ? [selected.story, selected.warriorOfLight]
            : [...selected.banner, selected.location, ...selected.photoQuote, ...selected.photoStamp];
        const visibleSelectedValues = family === 'editorial'
          ? selectedDecorativeValues.filter((value) => value !== selected.story)
          : selectedDecorativeValues;

        for (const value of visibleSelectedValues.filter(Boolean)) {
          assert.ok(text.includes(value), `${family} ${locale} ${mode} prints selected copy: ${value}`);
        }

        if (mode === 'none') {
          for (const value of stockDecorativeValues.filter(Boolean)) {
            assert.ok(!text.includes(value), `${family} ${locale} none omits stock copy: ${value}`);
          }
          assert.ok(!text.includes(CARD_STOCK_COPY.sample.bio[locale]), `${family} ${locale} none omits the untouched sample bio`);
        } else {
          const sampleBio = mode === 'default' ? CARD_STOCK_COPY.sample.bio[locale] : alternateBio[mode][locale];
          assert.ok(text.includes(sampleBio), `${family} ${locale} ${mode} prints its sample bio`);
        }

        assert.ok(markup.includes('© SQUARE ENIX'), `${family} ${locale} ${mode} keeps its copyright credit`);
        if (family === 'cinematic') {
          assert.ok(markup.includes(`aria-label="${stock.details}"`), `${family} retains the details label`);
        } else if (family === 'editorial') {
          assert.ok(markup.includes(CARD_STOCK_COPY.brand.finalFantasy), `${family} retains its FINAL FANTASY XIV masthead`);
          assert.ok(markup.includes(`aria-label="${stock.details}"`), `${family} retains the details label`);
        } else {
          assert.ok(text.includes(CARD_STOCK_COPY.brand.recordMark), `${family} retains the XIV mark`);
          assert.ok(markup.includes(`aria-label="${stock.record}"`), `${family} retains the record label`);
        }
      }

      for (const mode of modes) {
        const data = getConerSample(template, '4:5');
        data.character.bio = '';
        data.design.decorativeCopy = mode;
        const text = textContent(renderToStaticMarkup(createElement(Card, { data, locale })));
        const copy = getCardMasterCopy(family, locale, mode);
        if (family === 'editorial' && mode !== 'none') {
          assert.ok(text.includes(copy.story), `${family} ${locale} ${mode} uses the selected story when no bio is set`);
        }
      }

      for (const mode of modes) {
        const data = getConerSample(template, '4:5');
        data.character.profileOrigin = 'user';
        data.character.bio = 'My own card story.';
        data.design.decorativeCopy = mode;
        const text = textContent(renderToStaticMarkup(createElement(Card, { data, locale })));
        assert.ok(text.includes(data.character.bio), `${family} ${locale} ${mode} preserves the personal bio`);
      }
    }
  }
});

test('Editorial Adventure bio and story stay distinct in every locale', () => {
  const sampleBio = {
    ko: '새로운 여정이 시작됩니다.',
    en: 'A new journey begins.',
    ja: '新たな旅路が始まる。',
  };

  for (const locale of ['ko', 'en', 'ja']) {
    const data = getConerSample('editorial', '4:5');
    data.design.decorativeCopy = 'adventure';
    const copy = getCardMasterCopy('editorial', locale, 'adventure');
    const text = textContent(renderToStaticMarkup(createElement(EditorialCard, { data, locale })));

    assert.notEqual(copy.story, sampleBio[locale], `${locale} bio and story are distinct`);
    assert.ok(text.includes(sampleBio[locale]), `${locale} renders the themed sample bio`);
    assert.ok(text.includes(copy.story), `${locale} renders the separate Editorial story`);
  }
});

test('master information typography uses script-aware families consistently across the three card families', () => {
  const cards = [
    [CinematicCard, 'cinematic'],
    [EditorialCard, 'editorial'],
    [AdventurerIdCard, 'identity'],
  ];
  const scripts = [
    ['en', 'latin', 'Coner', 'Latin Company'],
    ['ko', 'korean', '가람', '모험가 회사'],
    ['ja', 'japanese', 'カオル', '冒険者の会社'],
  ];
  const roles = ['display', 'secondaryDisplay', 'job', 'information', 'label', 'caption', 'micro'];
  const presets = ['editorial', 'modern', 'condensed', 'classic', 'clean'];

  for (const [Card, family] of cards) {
    for (const [locale, script, name, freeCompany] of scripts) {
      for (const preset of presets) {
        const data = makeData(family === 'identity' ? 'id-card' : family);
        data.character.name = name;
        data.character.freeCompany = freeCompany;
        data.character.bio = { en: 'A story continues.', ko: '모험 이야기는 계속됩니다.', ja: '冒険の物語は続く。' }[locale];
        data.design.typographyPreset = preset;
        const style = cardStyleProperties(renderToStaticMarkup(createElement(Card, { data, locale })));

        for (const role of roles) {
          const expected = MASTER_TYPOGRAPHY_MAP[family][script][role];
          const cssRole = role.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
          assert.equal(style[`--master-font-${cssRole}`], expected.fontFamily, `${family} ${locale} ${preset} ${role} family`);
          if (role === 'information') {
            assert.equal(expected.weight, 500, `${family} ${script} information weight`);
            assert.equal(style['--master-information-weight'], '500', `${family} ${locale} information weight is applied`);
          }
          if ((family === 'cinematic' || family === 'editorial') && role === 'information') {
            assert.ok(expected.fontFamily.startsWith('DM Sans Variable'), `${family} ${locale} starts with its sans face`);
            assert.ok(!/Cormorant|Georgia/u.test(expected.fontFamily), `${family} ${locale} avoids Latin serif fallback before CJK coverage`);
          }
          if (family === 'identity' && role === 'information') {
            assert.ok(expected.fontFamily.startsWith('Cormorant Garamond Variable'), `${family} ${locale} retains its information serif`);
          }
        }
      }
    }

    const latinNameData = makeData(family === 'identity' ? 'id-card' : family);
    const cjkNameData = { ...latinNameData, character: { ...latinNameData.character, name: 'カオル' } };
    const latinStyle = cardStyleProperties(renderToStaticMarkup(createElement(Card, { data: latinNameData, locale: 'en' })));
    const cjkNameStyle = cardStyleProperties(renderToStaticMarkup(createElement(Card, { data: cjkNameData, locale: 'en' })));
    for (const role of roles.filter((candidate) => candidate !== 'display')) {
      const cssRole = role.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
      assert.equal(latinStyle[`--master-font-${cssRole}`], cjkNameStyle[`--master-font-${cssRole}`], `${family} ${role} family is independent of the character name script`);
    }
    assert.notEqual(latinStyle['--master-font-display'], cjkNameStyle['--master-font-display'], `${family} display family still follows the character name script`);
  }
});

test('master A title family follows each persisted preset for EN, KO, and JA', () => {
  const cards = [
    [CinematicCard, 'cinematic', 'cinematic'],
    [EditorialCard, 'editorial', 'editorial'],
    [AdventurerIdCard, 'id-card', 'id-card'],
  ];
  const scripts = [
    ['en', 'latin', 'Ari Sol'],
    ['ko', 'korean', '가람'],
    ['ja', 'japanese', 'カオル'],
  ];
  const presets = ['editorial', 'modern', 'condensed', 'classic', 'clean'];

  for (const [Card, template, opticalFamily] of cards) {
    for (const [locale, script, name] of scripts) {
      for (const preset of presets) {
        const data = getConerSample(template, '4:5');
        data.character.name = name;
        data.design.typographyPreset = preset;
        const markup = renderToStaticMarkup(createElement(Card, { data, locale }));
        const titleStyle = opticalNameStyleProperties(markup, opticalFamily);

        assert.equal(
          titleStyle['font-family'],
          getTypographyFontFamily(preset, 'display', script),
          `${template} ${locale} ${preset} title family matches the selected specimen face`,
        );
        assert.equal(cardStyleProperties(markup)['--master-information-weight'], '500', `${template} ${locale} information role stays at 500`);
      }
    }
  }
});

test('legacy B/C card roots retain all five preset faces for EN, KO, and JA', () => {
  const cards = [
    [CinematicCard, 'cinematic'],
    [EditorialCard, 'editorial'],
    [AdventurerIdCard, 'id-card'],
  ];
  const scripts = [
    ['en', 'latin', 'Ari Sol'],
    ['ko', 'korean', '가람'],
    ['ja', 'japanese', 'カオル'],
  ];
  const presets = ['editorial', 'modern', 'condensed', 'classic', 'clean'];

  for (const [Card, template] of cards) {
    for (const [locale, script, name] of scripts) {
      for (const layoutVariant of ['b', 'c']) {
        for (const preset of presets) {
          const data = getConerSample(template, '4:5');
          data.character.name = name;
          data.design.layoutVariant = layoutVariant;
          data.design.typographyPreset = preset;
          const markup = renderToStaticMarkup(createElement(Card, { data, locale }));
          assert.equal(
            cardStyleProperties(markup)['--card-font-display'],
            getTypographyFontFamily(preset, 'display', script),
            `${template} layout ${layoutVariant} ${locale} ${preset} retains its legacy display face`,
          );
        }
      }
    }
  }
});

test('Editorial free-company fitter retains complete text and joins export optical readiness', () => {
  const values = ['Ember Bloom', '境界検証'.repeat(12)];
  for (const freeCompany of values) {
    const data = makeData('editorial');
    data.character.freeCompany = freeCompany;
    const markup = renderToStaticMarkup(createElement(EditorialMaster, {
      data,
      locale: 'ja',
      ratio: '4:5',
    }));
    const fittedValueStart = markup.indexOf('data-optical-name="editorial-free-company"');
    const fittedValueEnd = markup.indexOf('</span>', fittedValueStart);
    const fittedSpanStart = markup.lastIndexOf('<span', fittedValueStart);
    const fittedValue = markup.slice(fittedSpanStart, fittedValueEnd);

    assert.ok(fittedSpanStart >= 0 && fittedValueEnd > fittedSpanStart, 'free company uses the measured value span');
    assert.match(fittedValue, /data-optical-ready="false"/);
    assert.match(fittedValue, /data-field="freeCompany"/);
    assert.ok(fittedValue.includes(freeCompany), 'full free-company text is preserved');
  }
});

test('Editorial free-company measurement key changes when its selected information typography changes', () => {
  const fields = { name: 'Coner', locale: 'en', job: 'Sage', world: 'Tonberry', dataCenter: 'Elemental', grandCompany: 'Maelstrom' };
  const defaultContext = getEditorialInformationFontContextKey(fields);
  const customContext = getEditorialInformationFontContextKey({
    ...fields,
    typography: { fontFamily: 'gmarket-sans', sizePercent: 110, weight: 500, trackingEm: 0.02 },
  });
  const measureDefault = getFitFactMeasurementKey(defaultContext, 'en', '4:5', 'editorial', 1, 'Ember Bloom');
  const measureCustom = getFitFactMeasurementKey(customContext, 'en', '4:5', 'editorial', 1.1, 'Ember Bloom');

  assert.notEqual(customContext, defaultContext);
  assert.notEqual(measureCustom, measureDefault);
});

test('typography scaler observes text and card context without watching its own inline style writes', () => {
  const previous = {
    MutationObserver: globalThis.MutationObserver,
    ResizeObserver: globalThis.ResizeObserver,
  };
  const observed = [];
  let disconnects = 0;
  class MutationObserverMock {
    observe(...args) { observed.push(args[1]); }
    disconnect() { disconnects += 1; }
  }
  class ResizeObserverMock {
    observe() {}
    disconnect() { disconnects += 1; }
  }
  globalThis.MutationObserver = MutationObserverMock;
  globalThis.ResizeObserver = ResizeObserverMock;

  try {
    const disconnect = observeCardTypographyChanges({}, () => {});
    assert.deepEqual(observed[0], {
      attributes: true,
      attributeFilter: ['lang', 'data-locale', 'data-ratio', 'data-layout', 'data-typography', 'style'],
    });
    assert.deepEqual(observed[1], { characterData: true, childList: true, subtree: true });
    disconnect();
    assert.equal(disconnects, 3);
  } finally {
    if (previous.MutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previous.MutationObserver;
    if (previous.ResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previous.ResizeObserver;
  }
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
  data.character.bio = '';
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

  const families = [
    ['cinematic', 'cinematic'],
    ['editorial', 'editorial'],
    ['identity', 'id-card'],
  ];
  const themedBios = {
    adventure: { ko: '새로운 여정이 시작됩니다.', en: 'A new journey begins.', ja: '新たな旅路が始まる。' },
    companions: { ko: '동료와 함께라면 더 멀리.', en: 'Better journeys together.', ja: '仲間と進む、遠い旅。' },
  };
  for (const locale of ['ko', 'en', 'ja']) {
    for (const [family, template] of families) {
      const source = getConerSample(template, '4:5');
      const getOptionalValues = (copy) => family === 'cinematic'
        ? [...copy.promise, ...copy.quote, ...copy.signature, copy.place]
        : family === 'editorial'
          ? [copy.story, copy.warriorOfLight]
          : [...copy.banner, copy.location, ...copy.photoQuote, ...copy.photoStamp];
      for (const mode of ['none', 'default', 'adventure', 'companions']) {
        const request = getCardFontRequest(source.character, locale, template, source.imageUrl, mode, 'a');
        const requested = Object.values(request.textByScript).join(' ');
        const copy = getCardMasterCopy(family, locale, mode);
        const requestedCopy = getOptionalValues(copy).filter((value) => value && !(family === 'editorial' && value === copy.story));

        for (const value of requestedCopy) {
          assert.ok(requested.includes(value), `${family} ${locale} ${mode} waits for selected copy: ${value}`);
        }
        if (mode === 'none') {
          assert.ok(!requested.includes(CARD_STOCK_COPY.sample.bio[locale]), `${family} ${locale} none skips the sample bio font`);
          for (const value of getOptionalValues(getCardMasterCopy(family, locale, 'default')).filter(Boolean)) {
            assert.ok(!requested.includes(value), `${family} ${locale} none does not wait for hidden stock copy: ${value}`);
          }
        } else {
          const sampleBio = mode === 'default' ? CARD_STOCK_COPY.sample.bio[locale] : themedBios[mode][locale];
          assert.ok(requested.includes(sampleBio), `${family} ${locale} ${mode} waits for the rendered sample bio`);
        }
      }
    }
  }
});

test('registered typography overrides add selected families to preview font requests and load supported weights', async () => {
  const data = makeData('editorial');
  const typography = {
    display: { fontFamily: 'estonia', weight: 800 },
    information: { fontFamily: 'gmarket-sans', weight: 690 },
  };
  const request = getCardFontRequest(
    data.character,
    'en',
    data.design.template,
    data.imageUrl,
    data.design.decorativeCopy,
    'a',
    typography,
  );

  assert.deepEqual(request.fontRequests, [
    { fontId: 'estonia', weight: 800 },
    { fontId: 'gmarket-sans', weight: 690 },
  ]);

  const originalDocument = globalThis.document;
  const loaded = [];
  globalThis.document = {
    fonts: {
      load: async (font, text) => { loaded.push([font, text]); return [{}]; },
    },
  };
  try {
    await loadTypographyFonts('editorial', ['latin'], { latin: 'Coner' }, {
      fontRequests: request.fontRequests,
      profileSource: 'preview',
    });
    assert.deepEqual(loaded.map(([font]) => font), ['400 16px "Estonia"', '700 16px "Gmarket Sans"']);
    assert.ok(loaded.every(([, text]) => text.includes('Coner')));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('preview font key tracks rendered text and font choices while ignoring unrelated character fields', () => {
  const data = makeData('editorial');
  data.character.bio = '';
  const fontData = {
    character: data.character,
    imageUrl: data.imageUrl,
    design: {
      typographyPreset: data.design.typographyPreset,
      template: data.design.template,
      layoutVariant: data.design.layoutVariant,
      decorativeCopy: data.design.decorativeCopy,
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
  assert.notEqual(getCardPreviewFontRequestKey({
    ...fontData,
    design: { ...fontData.design, typography: { display: { fontFamily: 'valley-sans' } } },
  }, 'ko'), key);
  assert.ok(key.includes('이야기는 계속됩니다.'));
  assert.notEqual(getCardPreviewFontRequestKey({
    ...fontData,
    design: { ...fontData.design, decorativeCopy: 'none' },
  }, 'ko'), key);
  assert.equal(JSON.parse(key)[4], 'default', 'the selected copy mode is part of the readiness key');
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
