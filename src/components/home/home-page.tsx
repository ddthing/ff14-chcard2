'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';
import { demoAdventurerData } from '@/components/cards/types';
import { CardPreview } from '@/components/editor/card-preview';
import { getRouteCopy } from '@/components/editor/copy';
import { FFXIVAttribution } from '@/components/ffxiv';
import { LocalProjectLibrary } from '@/components/library/local-project-library';
import { LazyMaster } from '@/components/marketing/lazy-master';
import { useI18n } from '@/lib/i18n';
import { MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { getTemplatePhotoPath } from '@/app/create/create-draft';
import { normalizeCardData } from '@/store/editor-persistence';
import { editorStore } from '@/store/editor-store';
import { getHomeResumeDraft } from './home-draft';
import { homeCopy } from './home-copy';
import styles from './home.module.css';

export default function HomePage() {
  const { locale } = useI18n();
  const copy = homeCopy[locale];
  const routeCopy = getRouteCopy(locale);
  const starter = useMemo(() => normalizeCardData(demoAdventurerData), []);
  const [activeTemplate, setActiveTemplate] = useState<AdventurerCardTemplate>('editorial');
  const [draft, setDraft] = useState<AdventurerCardData | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');

  useEffect(() => {
    const syncDraft = () => {
      const state = editorStore.getState();
      if (!state.isHydrated) return;
      setDraft(getHomeResumeDraft(state.toCardData(), starter));
      setSaveStatus(state.saveStatus);
    };
    const unsubscribe = editorStore.subscribe(syncDraft);
    editorStore.getState().hydrate();
    syncDraft();
    return unsubscribe;
  }, [starter]);

  const styleNames: Record<AdventurerCardTemplate, string> = {
    cinematic: routeCopy.cinematic,
    editorial: routeCopy.editorial,
    'id-card': routeCopy.idCard,
  };
  const activeTemplateIndex = MASTER_TEMPLATE_ORDER.indexOf(activeTemplate);
  const saveLabel = saveStatus === 'saving' ? copy.saving : saveStatus === 'error' ? copy.saveError : copy.saved;
  const draftName = draft?.character.name || routeCopy.characterName;
  const compareHref = `/templates?template=${activeTemplate}${draft ? '&compare=personal' : ''}`;

  return (
    <div
      className={styles.page}
      lang={locale}
      data-page-transition="home"
      data-has-draft={draft ? 'true' : undefined}
    >
      <div className={styles.content}>
        <section className={styles.studio} aria-labelledby="home-title">
          <header className={styles.intro}>
            <h1 id="home-title">{copy.title}</h1>
          </header>

          {draft ? (
            <section className={styles.draft} aria-label={`${copy.draftHeading}: ${draftName}`}>
              <div className={styles.draftArtwork} aria-hidden="true"><CardPreview data={draft} locale={locale} /></div>
              <div className={styles.draftCopy}>
                <span className={styles.draftLabel}>{copy.draftHeading}</span>
                <div className={styles.draftIdentity}>
                  <strong>{draftName}</strong>
                  <span className={styles.draftDetails}>{copy.draftDetails(draft.character.job, draft.character.world)}</span>
                </div>
                <span className={styles.saveStatus} data-status={saveStatus} role="status" aria-live="polite" aria-atomic="true">{saveLabel}</span>
              </div>
              <Link className={styles.resumeAction} href="/editor">
                {copy.resumeDraft}<span aria-hidden="true">↗</span>
              </Link>
            </section>
          ) : null}

          <figure className={styles.artwork}>
            <div className={styles.cardFan}>
              {MASTER_TEMPLATE_ORDER.map((template) => {
                const relativeIndex = (MASTER_TEMPLATE_ORDER.indexOf(template) - activeTemplateIndex + MASTER_TEMPLATE_ORDER.length) % MASTER_TEMPLATE_ORDER.length;
                const position = relativeIndex === 0 ? 'center' : relativeIndex === 1 ? 'right' : 'left';

                return (
                  <div
                    className={styles.cardSlot}
                    key={template}
                    data-position={position}
                    aria-hidden={position !== 'center'}
                  >
                    <LazyMaster
                      template={template}
                      ratio="4:5"
                      locale={locale}
                      eager
                      className={styles.cardArtwork}
                    />
                  </div>
                );
              })}
            </div>
            <figcaption className={styles.activeCaption} aria-live="polite" aria-atomic="true">
              <span>{copy.sampleLabel}</span>
              <span aria-hidden="true">·</span>
              <strong>{styleNames[activeTemplate]}</strong>
            </figcaption>
          </figure>

          <div className={styles.stageDock}>
            <div className={styles.styleChoices} role="group" aria-label={copy.styleSelector}>
              {MASTER_TEMPLATE_ORDER.map((template) => {
                const isActive = activeTemplate === template;

                return (
                  <button
                    type="button"
                    key={template}
                    className={styles.styleChoice}
                    aria-pressed={isActive}
                    aria-label={`${styleNames[template]}${isActive ? ` · ${copy.selected}` : ''}`}
                    onClick={() => setActiveTemplate(template)}
                  >
                    <span className={styles.styleLabel}>{styleNames[template]}</span>
                    <span className={styles.styleCheck} aria-hidden="true">{isActive ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.stageActions}>
              <Link className={styles.primaryAction} href={getTemplatePhotoPath(activeTemplate)}>
                {copy.create}<span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.compareAction} href={compareHref}>
                {draft ? copy.exploreDraft : copy.explore}<span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>

        <div className={styles.workspaceShelf}>
          <LocalProjectLibrary
            compact
            presentation="stage"
            stageSaveTarget={`${draft ? draftName : starter.character.name} · ${styleNames[(draft ?? starter).design.template]}`}
          />
        </div>

        <footer className={styles.footer}>
          <FFXIVAttribution locale={locale} officialAssetsUsed />
        </footer>
      </div>
    </div>
  );
}
