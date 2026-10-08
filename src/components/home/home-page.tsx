'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';
import { CardPreview } from '@/components/editor/card-preview';
import { getRouteCopy } from '@/components/editor/copy';
import { FFXIVAttribution } from '@/components/ffxiv';
import { LazyMaster } from '@/components/marketing/lazy-master';

import { useI18n } from '@/lib/i18n';
import { MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { demoAdventurerData } from '@/components/cards/types';
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
      const data = state.toCardData();
      setDraft(getHomeResumeDraft(data, starter));
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
  const styleNumbers: Record<AdventurerCardTemplate, string> = {
    cinematic: '01',
    editorial: '02',
    'id-card': '03',
  };
  const saveLabel = saveStatus === 'saving' ? copy.saving : saveStatus === 'error' ? copy.saveError : copy.saved;

  return (
    <div className={styles.page} lang={locale} data-page-transition="home">
      <div className={styles.content}>
        {draft && (
          <section className={styles.draft} aria-label={copy.draftHeading}>
            <div className={styles.draftArtwork} aria-hidden="true"><CardPreview data={draft} locale={locale} /></div>
            <div className={styles.draftCopy}>
              <span>{copy.draftHeading}</span><strong>{draft.character.name || routeCopy.characterName}</strong>
              <span className={styles.draftDetails}>{copy.draftStyle(styleNames[draft.design.template], draft.design.ratio)}</span>
              <span data-status={saveStatus}>{saveLabel}</span>
            </div>
            <Link className={styles.resumeAction} href="/editor">{copy.resumeDraft}<span aria-hidden="true">↗</span></Link>
          </section>
        )}
        <section className={styles.studio} aria-labelledby="home-title">
          <header className={styles.intro}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1 id="home-title">{copy.title}</h1>
            <p className={styles.description}>{copy.description}</p>
            <p className={styles.productNote}>{copy.productNote}</p>
          </header>
          <div className={styles.artwork}>
            <div className={styles.artworkStage} data-template={activeTemplate}>
              <span className={styles.stageMeta} aria-hidden="true">XIV / ATELIER <span>{styleNumbers[activeTemplate]} — 03</span></span>
              <LazyMaster template={activeTemplate} ratio="4:5" locale={locale} eager className={styles.featuredCard} />
            </div>
            <div className={styles.artworkCaption} aria-live="polite" aria-atomic="true">
              <div><span>{copy.stylePrefix} {styleNumbers[activeTemplate]}</span><strong>{styleNames[activeTemplate]}</strong></div>
              <span>{copy.sampleLabel}</span>
            </div>
          </div>
          <div className={styles.controls}>
            <div className={styles.selectorHeading}><h2 id="style-choice-title">{copy.styleSelector}</h2><p>{copy.stylePrompt}</p></div>
            <div className={styles.styleChoices} role="group" aria-labelledby="style-choice-title">
              {MASTER_TEMPLATE_ORDER.map((template) => (
                <button type="button" key={template} className={styles.styleChoice}
                  data-template={template} aria-pressed={activeTemplate === template}
                  aria-label={`${styleNames[template]}${activeTemplate === template ? ` · ${copy.selected}` : ''}`}
                  aria-describedby={`home-style-${template}-description`} onClick={() => setActiveTemplate(template)}>
                  <span className={styles.styleIndex}>{styleNumbers[template]}</span>
                  <span className={styles.styleThumb} aria-hidden="true"><LazyMaster template={template} ratio="4:5" locale={locale} eager={activeTemplate === template} /></span>
                  <span className={styles.styleCopy} id={`home-style-${template}-description`}>
                    <strong>{styleNames[template]}</strong>
                    <span>{copy.featurePoints[template][0]}</span>
                    <span>{copy.featurePoints[template][1]}</span>
                  </span>
                  <span className={styles.choiceMark} aria-hidden="true">{activeTemplate === template ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <Link className={styles.compareLink} href={`/templates?template=${activeTemplate}`}>{copy.explore}<span aria-hidden="true">↗</span></Link>
            <div className={styles.startArea}>
              <Link className={styles.primaryAction} href={getTemplatePhotoPath(activeTemplate)}>{copy.create}<span aria-hidden="true">→</span></Link>
              <p>{copy.privacyNote}</p>
            </div>
          </div>
        </section>
        <ol className={styles.workflow} aria-label={copy.create}>
          {copy.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}{index < 2 && <span className={styles.flowArrow} aria-hidden="true">→</span>}</li>)}
        </ol>
        <footer className={styles.footer}><span>{copy.footer}</span><FFXIVAttribution locale={locale} officialAssetsUsed /></footer>
      </div>
    </div>
  );
}
