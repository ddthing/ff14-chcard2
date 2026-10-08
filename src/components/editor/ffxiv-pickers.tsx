'use client';

import { useMemo, useState } from 'react';
import { JobIcon } from '@/components/ffxiv/job-icon';
import {
  CLANS,
  DATA_CENTERS,
  GRAND_COMPANIES,
  JOB_CATEGORIES,
  JOB_ROLES,
  JOBS,
  PHYSICAL_REGIONS,
  RACES,
  SERVICES,
  getClansByRace,
  getWorldsByService,
} from '@/data/ffxiv';
import type { AdventurerCardCharacter } from '@/components/cards/types';
import type { EditorCopy } from '@/components/editor/copy';
import type { Locale } from '@/lib/types';
import { SearchablePicker, type SearchablePickerFilter, type SearchablePickerOption } from '@/components/editor/searchable-picker';
import { getWorldPickerOptions, getWorldSelectionPatch } from '@/components/editor/world-picker';
import { editorStore } from '@/store/editor-store';
import { profileRender } from '@/lib/performance-profile';
import styles from '@/app/editor/editor.module.css';

type LocalizedRecord = { localizedName: Record<Locale, string> };

function localName(record: LocalizedRecord, locale: Locale): string {
  return record.localizedName[locale] || record.localizedName.en;
}

function allNames(record: LocalizedRecord): string {
  return Object.values(record.localizedName).join(' ');
}

function aliasesOf(record: LocalizedRecord & { aliases?: readonly string[] }): string {
  return record.aliases?.join(' ') ?? '';
}

function ordered<T extends { sortOrder: number }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.sortOrder - right.sortOrder);
}

function updateCharacter(partial: Partial<AdventurerCardCharacter>) {
  editorStore.getState().setCharacter(partial);
}

interface PickerFeedbackProps {
  onFocusField: (field: string) => void;
  onBlurField: (field: string) => void;
}

export function JobPicker({
  character,
  copy,
  locale,
  onFocusField,
  onBlurField,
}: PickerFeedbackProps & {
  character: AdventurerCardCharacter;
  copy: EditorCopy;
  locale: Locale;
}) {
  const [roleId, setRoleId] = useState('all');
  profileRender('JobPicker');
  const [categoryId, setCategoryId] = useState('all');
  const roles = useMemo(() => ordered(JOB_ROLES), []);
  const categories = useMemo(() => ordered(JOB_CATEGORIES).filter((category) => roleId === 'all' || category.roleId === roleId), [roleId]);
  const roleFilters: SearchablePickerFilter[] = useMemo(() => [
    { id: 'all', label: copy.picker.all },
    ...roles.map((role) => ({ id: role.id, label: localName(role, locale) })),
  ], [copy.picker.all, locale, roles]);
  const categoryFilters: SearchablePickerFilter[] = useMemo(() => [
    { id: 'all', label: copy.picker.all },
    ...categories.map((category) => ({ id: category.id, label: localName(category, locale) })),
  ], [categories, copy.picker.all, locale]);
  const selectedCategory = JOB_CATEGORIES.find((category) => category.id === categoryId);
  const options: SearchablePickerOption[] = useMemo(() => ordered(JOBS)
    .filter((job) => roleId === 'all' || job.role === roleId)
    .filter((job) => categoryId === 'all' || job.category === categoryId)
    .map((job) => {
      const category = JOB_CATEGORIES.find((candidate) => candidate.id === job.category);
      const role = JOB_ROLES.find((candidate) => candidate.id === job.role);
      const label = localName(job, locale);
      return {
        id: job.id,
        label,
        abbreviation: job.abbreviation,
        groupLabel: category ? localName(category, locale) : role ? localName(role, locale) : undefined,
        searchText: [job.abbreviation, job.role, job.category, allNames(job), aliasesOf(job), category && allNames(category), role && allNames(role)].filter(Boolean).join(' '),
        icon: <JobIcon jobId={job.id} role={job.role} label={label} size={20} usage="picker" decorative />,
      };
    }), [categoryId, locale, roleId]);

  function changeRole(nextRoleId: string) {
    setRoleId(nextRoleId);
    if (nextRoleId !== 'all' && selectedCategory && selectedCategory.roleId !== nextRoleId) setCategoryId('all');
  }

  return (
    <SearchablePicker
      label={copy.fields.job}
      value={character.jobId ?? null}
      selectedLabel={character.job}
      placeholder={copy.picker.searchPlaceholder}
      searchLabel={copy.picker.search}
      noResultsLabel={copy.picker.noResults}
      clearLabel={copy.picker.clear}
      closeLabel={copy.picker.close}
      options={options}
      maxResults={14}
      filterGroups={[
        { id: 'job-role', label: copy.picker.roleFilter, filters: roleFilters, activeFilter: roleId, onChange: changeRole },
        { id: 'job-category', label: copy.picker.categoryFilter, filters: categoryFilters, activeFilter: categoryId, onChange: setCategoryId },
      ]}
      onFocusField={() => onFocusField('job')}
      onBlurField={() => onBlurField('job')}
      onSelect={(option) => {
        const job = option ? JOBS.find((candidate) => candidate.id === option.id) : undefined;
        updateCharacter({ job: job ? localName(job, locale) : '', jobId: job?.id ?? null });
      }}
    />
  );
}

export function WorldPicker({
  character,
  copy,
  locale,
  onFocusField,
  onBlurField,
}: PickerFeedbackProps & {
  character: AdventurerCardCharacter;
  copy: EditorCopy;
  locale: Locale;
}) {
  const service = character.service ?? 'global';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const serviceWorlds = useMemo(() => getWorldsByService(service), [service]);
  const availableRegionIds = new Set(serviceWorlds.flatMap((world) => world.physicalRegionId ? [world.physicalRegionId] : []));
  const regions = ordered(PHYSICAL_REGIONS).filter((region) => availableRegionIds.has(region.id));
  const regionId = character.physicalRegionId ?? '';
  const worldsInRegion = regionId ? serviceWorlds.filter((world) => world.physicalRegionId === regionId) : serviceWorlds;
  const availableDataCenterIds = new Set(worldsInRegion.flatMap((world) => world.dataCenterId ? [world.dataCenterId] : []));
  const dataCenters = ordered(DATA_CENTERS).filter((dataCenter) => availableDataCenterIds.has(dataCenter.id));
  const worldOptions: SearchablePickerOption[] = useMemo(() => getWorldPickerOptions(locale, {
    filtersOpen,
    service,
    regionId: regionId || null,
    dataCenterId: character.dataCenterId ?? null,
  }), [character.dataCenterId, filtersOpen, locale, regionId, service]);
  const services = useMemo(() => ordered(SERVICES), []);
  const currentWorldId = character.worldId ?? null;

  return (
    <div className={styles.pickerWorldFlow}>
      <div className={styles.pickerWideField}>
        <SearchablePicker
          label={copy.fields.world}
          value={currentWorldId}
          selectedLabel={character.world}
          placeholder={copy.picker.searchPlaceholder}
          searchLabel={copy.picker.search}
          noResultsLabel={copy.picker.noResults}
          clearLabel={copy.picker.clear}
          closeLabel={copy.picker.close}
          options={worldOptions}
          maxResults={16}
          onFocusField={() => onFocusField('world')}
          onBlurField={() => onBlurField('world')}
          onSelect={(option) => {
            const selection = option ? getWorldSelectionPatch(option.id, locale) : null;
            updateCharacter(selection ?? { worldId: null, world: '' });
          }}
        />
        <p className={styles.pickerHint}>{copy.worldSearchHint}</p>
        <p className={styles.pickerHint}>{copy.worldLocationAuto}</p>
      </div>

      <details
        className={`${styles.disclosure} ${styles.pickerWideField}`}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>{copy.worldFilters}</summary>
        <div className={styles.pickerWorldFlow}>
          <label className={styles.pickerInlineSelect}>
            <span>{copy.fields.service}</span>
            <select
              value={service}
              aria-label={copy.fields.service}
              onFocus={() => onFocusField('service')}
              onBlur={() => onBlurField('service')}
              onChange={(event) => {
                const nextService = event.currentTarget.value;
                if (nextService === service) return;
                updateCharacter({ service: nextService as (typeof SERVICES)[number]['id'], physicalRegionId: null, dataCenterId: null, worldId: null, dataCenter: '', world: '' });
              }}
            >
              {services.map((item) => <option value={item.id} key={item.id}>{localName(item, locale)}</option>)}
            </select>
          </label>
          <label className={styles.pickerInlineSelect}>
            <span>{copy.fields.region}</span>
            <select
              value={regionId}
              disabled={service === 'korea'}
              aria-label={copy.fields.region}
              onFocus={() => onFocusField('region')}
              onBlur={() => onBlurField('region')}
              onChange={(event) => {
                const nextRegionId = event.currentTarget.value;
                const region = PHYSICAL_REGIONS.find((candidate) => candidate.id === nextRegionId);
                updateCharacter({ physicalRegionId: region?.id ?? null, dataCenterId: null, dataCenter: '', worldId: null, world: '' });
              }}
            >
              <option value="">{copy.picker.all}</option>
              {regions.map((region) => <option value={region.id} key={region.id}>{localName(region, locale)}</option>)}
            </select>
          </label>
          <label className={`${styles.pickerInlineSelect} ${styles.pickerWideField}`}>
            <span>{copy.fields.dataCenter}</span>
            <select
              value={character.dataCenterId ?? ''}
              disabled={service === 'korea'}
              aria-label={copy.fields.dataCenter}
              onFocus={() => onFocusField('dataCenter')}
              onBlur={() => onBlurField('dataCenter')}
              onChange={(event) => {
                const nextDataCenter = DATA_CENTERS.find((candidate) => candidate.id === event.currentTarget.value);
                updateCharacter({ dataCenterId: nextDataCenter?.id ?? null, dataCenter: nextDataCenter ? localName(nextDataCenter, locale) : '', worldId: null, world: '' });
              }}
            >
              <option value="">{copy.picker.all}</option>
              {dataCenters.map((dataCenter) => <option value={dataCenter.id} key={dataCenter.id}>{localName(dataCenter, locale)}</option>)}
            </select>
          </label>
          {service === 'korea' && <p className={`${styles.pickerHint} ${styles.pickerWideField}`}>{copy.picker.koreaNoDataCenter}</p>}
        </div>
      </details>
    </div>
  );
}

export function RaceClanPicker({
  character,
  copy,
  locale,
  onFocusField,
  onBlurField,
}: PickerFeedbackProps & {
  character: AdventurerCardCharacter;
  copy: EditorCopy;
  locale: Locale;
}) {
  const raceOptions: SearchablePickerOption[] = useMemo(() => ordered(RACES).map((race) => ({
    id: race.id,
    label: localName(race, locale),
    searchText: `${allNames(race)} ${aliasesOf(race)}`,
  })), [locale]);
  const selectedRaceId = character.raceId ?? '';
  const clanOptions: SearchablePickerOption[] = useMemo(() => {
    if (!selectedRaceId) return [];
    return ordered(getClansByRace(selectedRaceId)).map((clan) => ({ id: clan.id, label: localName(clan, locale), searchText: `${allNames(clan)} ${aliasesOf(clan)}` }));
  }, [locale, selectedRaceId]);
  const optionsByRace = useMemo(() => new Map(RACES.map((race) => [race.id, race])), []);
  const optionsByClan = useMemo(() => new Map(CLANS.map((clan) => [clan.id, clan])), []);

  return (
    <>
      <SearchablePicker
        label={copy.fields.race}
        value={selectedRaceId || null}
        selectedLabel={character.race}
        placeholder={copy.picker.searchPlaceholder}
        searchLabel={copy.picker.search}
        noResultsLabel={copy.picker.noResults}
        clearLabel={copy.picker.clear}
        closeLabel={copy.picker.close}
        options={raceOptions}
        maxResults={8}
        onFocusField={() => onFocusField('race')}
        onBlurField={() => onBlurField('race')}
        onSelect={(option) => {
          const race = option ? optionsByRace.get(option.id as (typeof RACES)[number]['id']) : undefined;
          const retainedClan = race && character.clanId && getClansByRace(race.id).some((clan) => clan.id === character.clanId)
            ? optionsByClan.get(character.clanId as (typeof CLANS)[number]['id'])
            : undefined;
          updateCharacter({
            race: race ? localName(race, locale) : '',
            raceId: race?.id ?? null,
            clan: retainedClan ? localName(retainedClan, locale) : '',
            clanId: retainedClan?.id ?? null,
          });
        }}
      />
      <SearchablePicker
        label={copy.fields.clan}
        value={character.clanId ?? null}
        selectedLabel={character.clan}
        placeholder={copy.picker.searchPlaceholder}
        searchLabel={copy.picker.search}
        noResultsLabel={copy.picker.noResults}
        clearLabel={copy.picker.clear}
        closeLabel={copy.picker.close}
        options={clanOptions}
        disabled={!selectedRaceId}
        maxResults={8}
        onFocusField={() => onFocusField('clan')}
        onBlurField={() => onBlurField('clan')}
        onSelect={(option) => {
          const clan = option ? optionsByClan.get(option.id as (typeof CLANS)[number]['id']) : undefined;
          updateCharacter({ clan: clan ? localName(clan, locale) : '', clanId: clan?.id ?? null });
        }}
      />
    </>
  );
}

export function GrandCompanyPicker({
  character,
  copy,
  locale,
  onFocusField,
  onBlurField,
}: PickerFeedbackProps & {
  character: AdventurerCardCharacter;
  copy: EditorCopy;
  locale: Locale;
}) {
  const options: SearchablePickerOption[] = useMemo(() => ordered(GRAND_COMPANIES).map((company) => ({
    id: company.id,
    label: localName(company, locale),
    detail: company.abbreviation,
    searchText: `${company.abbreviation} ${allNames(company)} ${aliasesOf(company)}`,
  })), [locale]);

  return (
    <SearchablePicker
      label={copy.fields.grandCompany}
      value={character.grandCompanyId ?? null}
      selectedLabel={character.grandCompany}
      placeholder={copy.picker.searchPlaceholder}
      searchLabel={copy.picker.search}
      noResultsLabel={copy.picker.noResults}
      clearLabel={copy.picker.clear}
      closeLabel={copy.picker.close}
      options={options}
      maxResults={5}
      onFocusField={() => onFocusField('grandCompany')}
      onBlurField={() => onBlurField('grandCompany')}
      onSelect={(option) => {
        const company = option ? GRAND_COMPANIES.find((candidate) => candidate.id === option.id) : undefined;
        updateCharacter({ grandCompany: company ? localName(company, locale) : '', grandCompanyId: company?.id ?? null });
      }}
    />
  );
}

