import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);

const ffxiv = await import('../src/data/ffxiv/index.ts');

test('job registry covers current combat, limited, crafter, and gatherer choices', () => {
  assert.equal(ffxiv.JOBS.length, 34);
  assert.equal(ffxiv.JOBS.filter((job) => ['tank', 'healer', 'melee-dps', 'physical-ranged-dps', 'magical-ranged-dps'].includes(job.category)).length, 21);
  assert.equal(ffxiv.JOBS.filter((job) => job.category === 'limited').length, 2);
  assert.equal(ffxiv.JOBS.filter((job) => job.category === 'crafter').length, 8);
  assert.equal(ffxiv.JOBS.filter((job) => job.category === 'gatherer').length, 3);
  assert.equal(new Set(ffxiv.JOBS.map((job) => job.id)).size, ffxiv.JOBS.length);

  for (const job of ffxiv.JOBS) {
    assert.ok(job.id && job.abbreviation && job.icon);
    assert.ok(/^#[\da-f]{6}$/i.test(job.themeAccent));
    assert.ok(/^#[\da-f]{6}$/i.test(job.themeSecondary));
    for (const locale of ['ko', 'en', 'ja']) assert.ok(job.localizedName[locale]);
    assert.ok(ffxiv.JOB_ROLES.some((role) => role.id === job.role));
    assert.ok(ffxiv.JOB_CATEGORIES.some((category) => category.id === job.category && category.roleId === job.role));
  }

  assert.equal(ffxiv.getJob('Bard')?.id, 'bard');
  assert.equal(ffxiv.getJob('BLM')?.id, 'black-mage');
  assert.equal(ffxiv.localizeJob('bard', 'ja'), '吟遊詩人');
});

test('global Worlds map to official DC and region records; Korea grouping stays unknown', () => {
  assert.equal(ffxiv.GLOBAL_WORLDS.length, 85);
  assert.equal(new Set(ffxiv.WORLDS.map((world) => world.id)).size, ffxiv.WORLDS.length);
  assert.equal(ffxiv.getWorldsByDataCenter('global.elemental').length, 8);
  assert.ok(ffxiv.getWorldsByDataCenter('global.elemental').some((world) => world.id === 'global.elemental.tonberry'));
  assert.equal(ffxiv.getWorldsByPhysicalRegion('japan').length, 32);
  assert.equal(ffxiv.getWorldsByService('korea').length, 5);
  assert.equal(ffxiv.normalizeServiceId('china'), 'china', 'future service IDs can be added without a schema redesign');
  assert.ok(ffxiv.KOREA_WORLDS.every((world) => world.physicalRegionId === null && world.dataCenterId === null));
  assert.ok(ffxiv.GLOBAL_WORLDS.every((world) => {
    const center = ffxiv.getDataCenter(world.dataCenterId);
    return world.service === 'global' && center?.physicalRegionId === world.physicalRegionId;
  }));
  assert.ok(ffxiv.WORLDS.every((world) => !Object.hasOwn(world, 'status')));

  assert.equal(ffxiv.findWorld('Tonberry', { dataCenterId: 'global.elemental' })?.id, 'global.elemental.tonberry');
  assert.equal(ffxiv.findWorld('Carbuncle'), undefined, 'ambiguous service label should not guess a service');
  assert.equal(ffxiv.findWorld('Carbuncle', { service: 'global', dataCenterId: 'global.elemental' })?.id, 'global.elemental.carbuncle');
  assert.equal(ffxiv.findWorld('톤베리', { service: 'korea' })?.id, 'korea.tonberry');
});

test('race and clan registry enforces the race dependency and localized labels', () => {
  assert.equal(ffxiv.RACES.length, 8);
  assert.equal(ffxiv.CLANS.length, 16);
  for (const race of ffxiv.RACES) {
    assert.equal(ffxiv.getClansByRace(race.id).length, 2);
    for (const locale of ['ko', 'en', 'ja']) assert.ok(race.localizedName[locale]);
  }
  assert.equal(ffxiv.getRace('Miqo’te')?.id, 'miqote');
  assert.equal(ffxiv.getClan('Keeper of the Moon')?.id, 'keeper-of-the-moon');
  assert.equal(ffxiv.getClansByRace('viera')[1].id, 'veena');
  assert.equal(ffxiv.localizeFfxivLabel('race', 'viera', 'ko'), '비에라');
  assert.equal(ffxiv.localizeFfxivLabel('clan', 'keeper-of-the-moon', 'ja'), 'ムーンキーパー');
});

test('grand companies, languages, and play styles accept stable IDs and legacy display labels', () => {
  assert.deepEqual(ffxiv.GRAND_COMPANIES.map((company) => company.id), ['maelstrom', 'twin-adder', 'immortal-flames']);
  assert.equal(ffxiv.getGrandCompany('Order of the Twin Adder')?.id, 'twin-adder');
  assert.equal(ffxiv.getGrandCompany('흑와단')?.id, 'maelstrom');
  assert.equal(ffxiv.normalizeLanguageId('EN'), 'en');
  assert.equal(ffxiv.normalizeLanguageId('JP'), 'ja');
  assert.equal(ffxiv.normalizePlayStyleId('Raids'), 'raid');
  assert.equal(ffxiv.normalizePlayStyleId('Duty finder'), 'duty-finder');
  assert.equal(ffxiv.normalizePlayStyleId('My old activity'), 'My old activity', 'unknown previous text should survive migration');
  assert.equal(ffxiv.localizeFfxivLabel('grandCompany', 'immortal-flames', 'ko'), '불멸대');
  assert.equal(ffxiv.localizeFfxivLabel('language', 'en', 'ja'), '英語');
  assert.equal(ffxiv.localizeFfxivLabel('playStyle', 'story', 'ja'), 'ストーリー');
  assert.equal(ffxiv.localizeFfxivLabel('job', 'Old Job Text', 'ko'), 'Old Job Text');
});
