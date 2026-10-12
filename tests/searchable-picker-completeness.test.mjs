import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JOBS } from '../src/data/ffxiv/jobs.ts';
import { JOB_CATEGORIES } from '../src/data/ffxiv/roles.ts';
import { GLOBAL_WORLDS } from '../src/data/ffxiv/worlds/global.ts';
import { KOREA_WORLDS } from '../src/data/ffxiv/worlds/korea.ts';
import { CLANS, RACES } from '../src/data/ffxiv/races.ts';
import { GRAND_COMPANIES } from '../src/data/ffxiv/grand-companies.ts';
import { getNextComboboxOptionIndex } from '../src/components/editor/editor-interaction.ts';

const pickerSource = readFileSync(new URL('../src/components/editor/searchable-picker.tsx', import.meta.url), 'utf8');
const pickerCallSiteSource = readFileSync(new URL('../src/components/editor/ffxiv-pickers.tsx', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../src/app/editor/editor.module.css', import.meta.url), 'utf8');

test('job search exposes all 34 jobs and ArrowDown can reach the final clearable-list row', () => {
  assert.equal(JOBS.length, 34);
  assert.equal(JOBS.at(-1).id, 'fisher');

  const start = pickerSource.indexOf('const filteredOptions = useMemo');
  const end = pickerSource.indexOf('const pickerRows =', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(pickerSource.slice(start, end), /\.slice\s*\(/u);
  assert.doesNotMatch(pickerSource, /maxResults/u);
  assert.doesNotMatch(pickerCallSiteSource, /maxResults\s*=/u);

  const dpsMatches = JOBS.filter((job) => `${job.abbreviation} ${job.role} ${job.category}`.toLocaleLowerCase().includes('dps'));
  assert.equal(dpsMatches.length, 15);

  const rowCount = JOBS.length + 1; // The clear/unset option is the first row.
  let activeIndex = -1;
  for (let step = 0; step < rowCount; step += 1) {
    activeIndex = getNextComboboxOptionIndex(activeIndex, rowCount, 'ArrowDown');
  }
  assert.equal(activeIndex, rowCount - 1);
});

test('job picker uses one ordered category filter while keeping role data searchable', () => {
  const start = pickerCallSiteSource.indexOf('export function JobPicker(');
  const end = pickerCallSiteSource.indexOf('export function WorldPicker(', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const jobPickerSource = pickerCallSiteSource.slice(start, end);

  assert.deepEqual(
    [...JOB_CATEGORIES].sort((left, right) => left.sortOrder - right.sortOrder).map((category) => category.id),
    ['tank', 'healer', 'melee-dps', 'physical-ranged-dps', 'magical-ranged-dps', 'limited', 'crafter', 'gatherer'],
  );
  assert.match(jobPickerSource, /const categories = useMemo\(\(\) => ordered\(JOB_CATEGORIES\), \[\]\)/u);
  assert.match(jobPickerSource, /filter\(\(job\) => categoryId === 'all' \|\| job\.category === categoryId\)/u);
  assert.match(jobPickerSource, /filterGroups=\{\[\s*\{ id: 'job-category', label: copy\.picker\.categoryFilter, filters: categoryFilters, activeFilter: categoryId, onChange: setCategoryId \},\s*\]\}/u);
  assert.doesNotMatch(jobPickerSource, /roleId|roleFilters|roleFilter|changeRole|job-role/u);
  assert.match(jobPickerSource, /job\.role, job\.category, allNames\(job\)/u);
  assert.match(jobPickerSource, /allNames\(role\)/u);
});

test('complete option catalogs remain scrollable on desktop and mobile', () => {
  const catalogs = {
    jobs: JOBS,
    worlds: [...GLOBAL_WORLDS, ...KOREA_WORLDS],
    races: RACES,
    clans: CLANS,
    grandCompanies: GRAND_COMPANIES,
  };
  for (const [name, options] of Object.entries(catalogs)) {
    assert.ok(options.length < 200, `${name} catalog should remain a bounded in-memory picker list`);
  }

  assert.match(pickerSource, /scrollIntoView\(\{ block: 'nearest' \}\)/u);
  const pickerListRules = [...editorCss.matchAll(/\.pickerList\s*\{([^}]*)\}/gs)].map((match) => match[1]);
  assert.ok(pickerListRules.some((rule) => /overflow:\s*auto/u.test(rule)));
  assert.ok(pickerListRules.some((rule) => /min-height:\s*0/u.test(rule) && /flex:\s*1/u.test(rule)));
});

test('desktop combo input can reopen on click without duplicating focus-open state changes', () => {
  const openHandlerStart = pickerSource.indexOf('function openDesktopPicker()');
  const inputRendererStart = pickerSource.indexOf('function renderSearchInput(');
  const panelRendererStart = pickerSource.indexOf('function renderPickerPanelContents(');
  assert.notEqual(openHandlerStart, -1);
  assert.notEqual(inputRendererStart, -1);
  assert.notEqual(panelRendererStart, -1);
  assert.match(pickerSource.slice(openHandlerStart, inputRendererStart), /if \(openStateRef\.current\) return;/u);

  const inputRenderer = pickerSource.slice(inputRendererStart, panelRendererStart);
  assert.match(inputRenderer, /onFocus=\{\(\) => \{[\s\S]*?if \(id === inputId\) openDesktopPicker\(\);/u);
  assert.match(inputRenderer, /onClick=\{\(\) => \{ if \(id === inputId\) openDesktopPicker\(\); \}\}/u);
});
