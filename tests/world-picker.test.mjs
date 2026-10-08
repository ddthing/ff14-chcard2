import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const [{ WORLDS, getWorld }, { getWorldPickerOptions, getWorldSelectionPatch, toWorldPickerOption }] = await Promise.all([
  import('../src/data/ffxiv/index.ts'),
  import('../src/components/editor/world-picker.ts'),
]);

const worldIds = (options) => options.map((option) => option.id);

test('closed World search includes canonical candidates beyond the saved service and location', () => {
  const options = getWorldPickerOptions('en', {
    filtersOpen: false,
    service: 'global',
    regionId: 'europe',
    dataCenterId: 'global.chaos',
  });
  const optionsById = new Map(options.map((option) => [option.id, option]));

  assert.equal(options.length, WORLDS.length);
  assert.ok(optionsById.has('global.chaos.moogle'));
  assert.ok(optionsById.has('global.aether.cactuar'));
  assert.ok(optionsById.has('global.elemental.tonberry'));
  assert.ok(optionsById.has('korea.mogri'));
  assert.equal(optionsById.get('global.aether.cactuar').label, 'Cactuar');
  assert.ok(optionsById.get('global.elemental.tonberry').searchText.includes('Japan'));
  assert.ok(optionsById.get('korea.mogri').searchText.includes('모그리'));
});

test('open World filters narrow candidates by service, region, and data center', () => {
  const europeanChaos = getWorldPickerOptions('en', {
    filtersOpen: true,
    service: 'global',
    regionId: 'europe',
    dataCenterId: 'global.chaos',
  });

  assert.equal(europeanChaos.length, 8);
  assert.ok(worldIds(europeanChaos).includes('global.chaos.moogle'));
  assert.ok(!worldIds(europeanChaos).includes('global.aether.cactuar'));
  assert.ok(!worldIds(europeanChaos).includes('korea.mogri'));

  const korea = getWorldPickerOptions('en', {
    filtersOpen: true,
    service: 'korea',
    regionId: null,
    dataCenterId: null,
  });
  assert.deepEqual(worldIds(korea), ['korea.mogri', 'korea.chocobo', 'korea.carbuncle', 'korea.tonberry', 'korea.fenrir']);
});

test('World options expose aliases alongside canonical names for searchable matching', () => {
  const canonical = getWorld('global.aether.cactuar');
  assert.ok(canonical);
  const option = toWorldPickerOption({ ...canonical, aliases: ['Cacstar'] }, 'ja');

  assert.equal(option.label, 'Cactuar');
  assert.ok(option.searchText.includes('Cacstar'));
  assert.ok(option.searchText.includes('Cactuar'));
});

test('selecting a canonical World fills service, region, data center, and localized labels', () => {
  assert.deepEqual(getWorldSelectionPatch('global.aether.cactuar', 'ja'), {
    world: 'Cactuar',
    worldId: 'global.aether.cactuar',
    service: 'global',
    physicalRegionId: 'north-america',
    dataCenter: 'Aether',
    dataCenterId: 'global.aether',
  });

  assert.deepEqual(getWorldSelectionPatch('korea.carbuncle', 'ko'), {
    world: '카벙클',
    worldId: 'korea.carbuncle',
    service: 'korea',
    physicalRegionId: null,
    dataCenter: '',
    dataCenterId: null,
  });
  assert.equal(getWorldSelectionPatch('missing-world', 'en'), null);
});
