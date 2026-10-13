'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/app-icon';
import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';
import { demoAdventurerData } from '@/components/cards/types';
import { CardPreview } from '@/components/editor/card-preview';
import { getRouteCopy } from '@/components/editor/copy';
import { useI18n } from '@/lib/i18n';
import { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { LazyMaster } from '@/components/marketing/lazy-master';
import { getTemplatePhotoPath } from '@/app/create/create-draft';
import { getHomeResumeDraft } from '@/components/home/home-draft';
import { normalizeCardData } from '@/store/editor-persistence';
import { editorStore } from '@/store/editor-store';
import {
  applyTemplateToEditorDraft,
  createTemplateComparisonData,
} from './template-comparison';
import styles from './templates.module.css';

type CompareMode = 'sample' | 'personal';

const localizedSelection = {
  ko: {
    navigation: '스타일 선택',
    title: '카드 스타일',
    selected: '선택한 스타일',
    choose: '스타일 미리보기',
    home: '홈',
    photo: '이 스타일로 시작',
    apply: '내 카드에 적용',
    newCard: '새 카드',
    modeLabel: '비교할 카드',
    sampleMode: '예시',
    personalMode: '내 카드',
    sampleStatus: '예시 카드',
    personalStatus: '내 카드',
    loading: '초안 확인 중',
    compareUnavailable: '내 카드 비교는 카드를 만든 뒤 사용할 수 있어요.',
    draftName: '현재 초안',
    unnamed: '이름 없음',
  },
  en: {
    navigation: 'Style selection',
    title: 'Card styles',
    selected: 'Selected style',
    choose: 'Preview style',
    home: 'Home',
    photo: 'Start with this style',
    apply: 'Apply to my card',
    newCard: 'New card',
    modeLabel: 'Compare',
    sampleMode: 'Sample',
    personalMode: 'My card',
    sampleStatus: 'Sample card',
    personalStatus: 'My card',
    loading: 'Checking draft',
    compareUnavailable: 'Create a card to use My card.',
    draftName: 'Current draft',
    unnamed: 'Unnamed',
  },
  ja: {
    navigation: 'スタイル選択',
    title: 'カードスタイル',
    selected: '選択中のスタイル',
    choose: 'スタイルをプレビュー',
    home: 'ホーム',
    photo: 'このスタイルで始める',
    apply: '自分のカードに適用',
    newCard: '新しいカード',
    modeLabel: '比較するカード',
    sampleMode: 'サンプル',
    personalMode: '自分のカード',
    sampleStatus: 'サンプルカード',
    personalStatus: '自分のカード',
    loading: '下書きを確認中',
    compareUnavailable: '自分のカードを作成すると比較できます。',
    draftName: '現在の下書き',
    unnamed: '名前未設定',
  },
} as const;

function centerGalleryCard(gallery: HTMLElement, card: HTMLElement, behavior: 'instant' | 'smooth') {
  const galleryBox = gallery.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const left = gallery.scrollLeft + cardBox.left - galleryBox.left - (gallery.clientWidth - cardBox.width) / 2;
  if (behavior === 'instant' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gallery.scrollLeft = left;
    return;
  }
  gallery.scrollTo({ left, behavior: 'smooth' });
}

export default function TemplatesPage({ initialTemplate }: { initialTemplate: AdventurerCardTemplate }) {
  const { locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPersonalMode = searchParams.get('compare') === 'personal';
  const copy = getRouteCopy(locale);
  const labels = localizedSelection[locale];
  const [selected, setSelected] = useState<AdventurerCardTemplate>(initialTemplate);
  const [compareMode, setCompareMode] = useState<CompareMode>('sample');
  const [draft, setDraft] = useState<AdventurerCardData | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const galleryRef = useRef<HTMLElement>(null);
  const selectedRef = useRef<AdventurerCardTemplate>(initialTemplate);
  const appliedQueryModeRef = useRef(false);
  const starter = useMemo(() => normalizeCardData(demoAdventurerData), []);

  const names: Record<AdventurerCardTemplate, string> = {
    cinematic: copy.cinematic,
    editorial: copy.editorial,
    'id-card': copy.idCard,
  };

  useEffect(() => {
    const syncDraft = () => {
      const state = editorStore.getState();
      if (!state.isHydrated) return;
      const nextDraft = getHomeResumeDraft(state.toCardData(), starter);
      setDraft(nextDraft);
      setDraftReady(true);
      if (!appliedQueryModeRef.current) {
        appliedQueryModeRef.current = true;
        if (requestedPersonalMode && nextDraft) setCompareMode('personal');
      }
    };
    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (!state.isHydrated) return;
      if (state.isHydrated !== previous.isHydrated ||
        state.character !== previous.character ||
        state.design !== previous.design ||
        state.image !== previous.image) {
        syncDraft();
      }
    });
    editorStore.getState().hydrate();
    syncDraft();
    return unsubscribe;
  }, [requestedPersonalMode, starter]);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const media = window.matchMedia('(max-width: 760px)');
    let observer: IntersectionObserver | null = null;
    const observeCards = () => {
      observer?.disconnect();
      observer = null;
      if (!media.matches) return;

      const selectedCard = gallery.querySelector<HTMLElement>(`:scope > article[data-template="${selectedRef.current}"]`);
      if (selectedCard) centerGalleryCard(gallery, selectedCard, 'instant');
      if (typeof IntersectionObserver === 'undefined') return;

      observer = new IntersectionObserver(() => {
        const galleryBox = gallery.getBoundingClientRect();
        const center = galleryBox.left + gallery.clientLeft + gallery.clientWidth / 2;
        const active = Array.from(gallery.querySelectorAll<HTMLElement>(':scope > article[data-template]'))
          .map((card) => {
            const bounds = card.getBoundingClientRect();
            const visibleWidth = Math.max(0, Math.min(bounds.right, galleryBox.right) - Math.max(bounds.left, galleryBox.left));
            return { card, visibleRatio: visibleWidth / Math.max(bounds.width, 1), distance: Math.abs((bounds.left + bounds.right) / 2 - center) };
          })
          .filter((item) => item.visibleRatio >= 0.55)
          .sort((a, b) => a.distance - b.distance)[0];
        const template = active?.card.getAttribute('data-template');
        if (template && MASTER_TEMPLATE_ORDER.includes(template as AdventurerCardTemplate)) {
          const next = template as AdventurerCardTemplate;
          if (selectedRef.current !== next) {
            selectedRef.current = next;
            setSelected(next);
          }
        }
      }, { root: gallery, threshold: [0.55, 0.7, 0.85, 1] });

      gallery.querySelectorAll<HTMLElement>(':scope > article[data-template]').forEach((card) => observer?.observe(card));
    };

    observeCards();
    media.addEventListener('change', observeCards);
    return () => {
      observer?.disconnect();
      media.removeEventListener('change', observeCards);
    };
  }, []);

  const personalData = compareMode === 'personal' ? draft : null;
  const personalPreviews = useMemo(() => {
    if (!personalData) return null;
    return Object.fromEntries(MASTER_TEMPLATE_ORDER.map((template) => [
      template,
      createTemplateComparisonData(personalData, template),
    ])) as Record<AdventurerCardTemplate, AdventurerCardData>;
  }, [personalData]);
  const status = !draftReady
    ? labels.loading
    : !draft
      ? labels.compareUnavailable
      : compareMode === 'personal' ? labels.personalStatus : labels.sampleStatus;
  const comparisonUnavailable = draftReady && !draft;

  const chooseTemplate = (template: AdventurerCardTemplate) => {
    selectedRef.current = template;
    setSelected(template);
    const gallery = galleryRef.current;
    if (gallery && window.matchMedia('(max-width: 760px)').matches) {
      const card = gallery.querySelector<HTMLElement>(`:scope > article[data-template="${template}"]`);
      if (card) centerGalleryCard(gallery, card, 'smooth');
    }
  };

  const editSelectedTemplate = () => {
    if (applyTemplateToEditorDraft(selected)) router.push('/editor');
  };

  return (
    <div className={styles.page} lang={locale} data-page-transition="templates">
      <div className={styles.wrap}>
        <nav className={styles.stepNav} aria-label={labels.navigation}>
          <Link href="/" className={styles.backLink}><span aria-hidden="true"><AppIcon name="ArrowLeft" /></span>{labels.home}</Link>
        </nav>

        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <h1>{labels.title}</h1>
          </div>
        </header>

        <section className={styles.compareTools} aria-label={labels.modeLabel}>
          <div className={styles.compareControl}>
            <span className={styles.compareLabel}>{labels.modeLabel}</span>
            <div className={styles.compareModes} role="group" aria-label={labels.modeLabel}>
              <button
                type="button"
                aria-pressed={compareMode === 'sample'}
                onClick={() => setCompareMode('sample')}
              >
                {labels.sampleMode}
              </button>
              <button
                type="button"
                aria-pressed={compareMode === 'personal'}
                aria-describedby={comparisonUnavailable ? 'comparison-status' : undefined}
                disabled={!draftReady || !draft}
                onClick={() => setCompareMode('personal')}
              >
                {labels.personalMode}
              </button>
            </div>
          </div>
          <span
            className={comparisonUnavailable ? styles.compareStatus : styles.srOnly}
            id="comparison-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status}
          </span>
        </section>

        <div className={styles.mobileStyleSelectors} role="group" aria-label={labels.title}>
          {MASTER_TEMPLATE_ORDER.map((template) => (
            <button
              className={styles.mobileStyleSelector}
              type="button"
              aria-pressed={selected === template}
              aria-controls={template}
              key={template}
              onClick={() => chooseTemplate(template)}
            >
              {names[template]}
            </button>
          ))}
        </div>

        <section
          className={styles.gallery}
          ref={galleryRef}
          data-active={selected}
          data-mode={compareMode}
          role="group"
          aria-label={labels.title}
        >
          {MASTER_TEMPLATE_ORDER.map((template) => {
            const active = selected === template;
            const master = MASTER_CARD_CONFIG[template];
            const comparisonData = personalPreviews?.[template];
            const ratio = personalData?.design.ratio ?? '4:5';
            return (
              <article
                className={styles.galleryCard}
                id={template}
                data-template={template}
                data-selected={active}
                data-master-id={master.id}
                key={template}
              >
                <button
                  className={styles.cardChoice}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${names[template]}${active ? ` · ${labels.selected}` : ` · ${labels.choose}`}`}
                  onClick={() => chooseTemplate(template)}
                >
                  <span className={styles.visualStage} aria-hidden="true">
                    {comparisonData ? (
                      <CardPreview data={comparisonData} locale={locale} className={styles.liveMaster} />
                    ) : (
                      <LazyMaster
                        template={template}
                        ratio={ratio}
                        locale={locale}
                        eager={active}
                        className={styles.masterCard}
                      />
                    )}
                  </span>
                  <span className={styles.masterCopy}>
                    <strong>{names[template]}</strong>
                    <span className={styles.choiceMark} aria-hidden="true">{active ? <AppIcon name="Check" /> : ''}</span>
                  </span>
                </button>
              </article>
            );
          })}
        </section>

        <section className={styles.selectionBar}>
          <div className={styles.selectionCopy}>
            <span>{labels.selected}</span>
            <strong key={selected} aria-live="polite" aria-atomic="true">{names[selected]}</strong>
            {draft && <small>{labels.draftName}: {draft.character.name.trim() || labels.unnamed}</small>}
          </div>
          <div className={styles.actions}>
            {draft ? (
              <>
                <button className={styles.primaryAction} type="button" onClick={editSelectedTemplate}>
                  <span>{labels.apply}</span><span aria-hidden="true"><AppIcon name="ArrowUpRight" /></span>
                </button>
                <Link className={styles.secondaryAction} href={getTemplatePhotoPath(selected)}>{labels.newCard}</Link>
              </>
            ) : (
              <Link className={styles.primaryAction} href={getTemplatePhotoPath(selected)}>
                <span>{labels.photo}</span><span aria-hidden="true"><AppIcon name="ArrowUpRight" /></span>
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
