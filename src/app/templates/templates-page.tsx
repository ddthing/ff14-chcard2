'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AdventurerCardTemplate } from '@/components/cards/types';
import { getRouteCopy } from '@/components/editor/copy';
import { useI18n } from '@/lib/i18n';
import { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { LazyMaster } from '@/components/marketing/lazy-master';
import { getTemplatePhotoPath } from '@/app/create/create-draft';
import styles from './templates.module.css';

const templateNumbers: Record<AdventurerCardTemplate, string> = {
  cinematic: '01',
  editorial: '02',
  'id-card': '03',
};

const localizedSelection = {
  ko: {
    selected: '선택한 스타일',
    choose: '스타일 미리보기',
    home: '홈으로',
    photo: '이 스타일로 시작',
    progress: '카드 만들기 진행',
    step: '01 / 04',
    ratio: '카드 비율',
    ratioNote: 'SNS 세로형',
    stylePrefix: '스타일',
    galleryHint: '세 가지 인쇄 스타일을 살펴보고 어울리는 구성을 골라 보세요.',
    selectedHint: '사진과 캐릭터 정보는 다음 단계에서 직접 고를 수 있어요.',
  },
  en: {
    selected: 'Selected style',
    choose: 'Preview style',
    home: 'Home',
    photo: 'Start with this style',
    progress: 'Card creation progress',
    step: '01 / 04',
    ratio: 'Card format',
    ratioNote: 'SOCIAL PORTRAIT',
    stylePrefix: 'STYLE',
    galleryHint: 'Browse the three print styles and choose the one that fits your moment.',
    selectedHint: 'Choose your own screenshot and character details in the next step.',
  },
  ja: {
    selected: '選択中のスタイル',
    choose: 'スタイルをプレビュー',
    home: 'ホーム',
    photo: 'このスタイルで始める',
    progress: 'カード作成の進行',
    step: '01 / 04',
    ratio: 'カード比率',
    ratioNote: 'SNS縦型',
    stylePrefix: 'スタイル',
    galleryHint: '三つの印刷スタイルを見比べて、好みの構成を選びましょう。',
    selectedHint: '次の画面で写真とキャラクター情報を選べます。',
  },
} as const;

function centerGalleryCard(gallery: HTMLElement, card: HTMLElement, behavior: ScrollBehavior) {
  const galleryBox = gallery.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  gallery.scrollTo({
    left: gallery.scrollLeft + cardBox.left - galleryBox.left - (gallery.clientWidth - cardBox.width) / 2,
    behavior,
  });
}

export default function TemplatesPage({ initialTemplate }: { initialTemplate: AdventurerCardTemplate }) {
  const { locale } = useI18n();
  const copy = getRouteCopy(locale);
  const labels = localizedSelection[locale];
  const [selection, setSelection] = useState({ source: initialTemplate, value: initialTemplate });
  const selected = selection.source === initialTemplate ? selection.value : initialTemplate;
  const galleryRef = useRef<HTMLElement>(null);

  const names: Record<AdventurerCardTemplate, string> = {
    cinematic: copy.cinematic,
    editorial: copy.editorial,
    'id-card': copy.idCard,
  };
  const descriptions: Record<AdventurerCardTemplate, string> = {
    cinematic: copy.cinematicDesc,
    editorial: copy.editorialDesc,
    'id-card': copy.idCardDesc,
  };

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery || typeof IntersectionObserver === 'undefined') return;

    const media = window.matchMedia('(max-width: 760px)');
    let observer: IntersectionObserver | null = null;
    const observeCards = () => {
      observer?.disconnect();
      observer = null;
      if (!media.matches) return;

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
          setSelection((current) => current.source === initialTemplate && current.value === template
            ? current
            : { source: initialTemplate, value: template as AdventurerCardTemplate });
        }
      }, { root: gallery, threshold: [0.55, 0.7, 0.85, 1] });

      gallery.querySelectorAll<HTMLElement>(':scope > article[data-template]').forEach((card) => observer?.observe(card));
      const initialCard = gallery.querySelector<HTMLElement>(`:scope > article[data-template="${initialTemplate}"]`);
      if (initialCard) centerGalleryCard(gallery, initialCard, 'auto');
    };

    observeCards();
    media.addEventListener('change', observeCards);
    return () => {
      observer?.disconnect();
      media.removeEventListener('change', observeCards);
    };
  }, [initialTemplate]);

  const chooseTemplate = (template: AdventurerCardTemplate) => {
    setSelection({ source: initialTemplate, value: template });
    const gallery = galleryRef.current;
    if (gallery && window.matchMedia('(max-width: 760px)').matches) {
      const card = gallery.querySelector<HTMLElement>(`:scope > article[data-template="${template}"]`);
      if (card) centerGalleryCard(gallery, card, 'auto');
    }
  };

  return (
    <div className={styles.page} lang={locale} data-page-transition="templates">
      <div className={styles.wrap}>
        <nav className={styles.stepNav} aria-label={labels.progress}>
          <Link href="/" className={styles.backLink}><span aria-hidden="true">←</span>{labels.home}</Link>
          <span className={styles.stepCount}>{labels.step}</span>
          <span className={styles.stepLabel}>{copy.templatesEyebrow}</span>
        </nav>

        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <p className={styles.eyebrow}>{copy.templatesEyebrow}</p>
            <h1>{copy.templatesTitle}</h1>
            <p className={styles.intro}>{copy.templatesIntro}</p>
            <p className={styles.galleryHint}>{labels.galleryHint}</p>
          </div>
          <div className={styles.ratioNote}>
            <span>{labels.ratio}</span>
            <strong>4:5</strong>
            <small>{labels.ratioNote}</small>
          </div>
        </header>

        <section className={styles.gallery} ref={galleryRef} data-active={selected} role="group" aria-label={copy.templatesEyebrow}>
          {MASTER_TEMPLATE_ORDER.map((template) => {
            const active = selected === template;
            const master = MASTER_CARD_CONFIG[template];
            return (
              <article
                className={styles.galleryCard}
                id={template}
                data-template={template}
                data-selected={active}
                data-master-id={master.id}
                key={template}
              >
                <div className={styles.cardMeta}>
                  <span>{labels.stylePrefix} {templateNumbers[template]}</span>
                  <span>{active ? labels.selected : '4:5'}</span>
                </div>
                <button
                  className={styles.cardChoice}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${names[template]}${active ? ` · ${labels.selected}` : ` · ${labels.choose}`}`}
                  aria-describedby={`style-${template}-description`}
                  onClick={() => chooseTemplate(template)}
                >
                  <span className={styles.visualStage} aria-hidden="true">
                    <LazyMaster
                      template={template}
                      ratio="4:5"
                      locale={locale}
                      eager={active}
                      className={styles.masterCard}
                    />
                  </span>
                  <span className={styles.masterCopy}>
                    <span className={styles.cardIndex}>{templateNumbers[template]} <span aria-hidden="true">/</span> 03</span>
                    <strong>{names[template]}</strong>
                    <span id={`style-${template}-description`}>{descriptions[template]}</span>
                  </span>
                </button>
              </article>
            );
          })}
        </section>

        <section className={styles.selectionBar} aria-live="polite" aria-atomic="true">
          <div className={styles.selectionCopy}>
            <span>{labels.selected}</span>
            <strong>{names[selected]}</strong>
            <p>{labels.selectedHint}</p>
          </div>
          <Link className={styles.primaryAction} href={getTemplatePhotoPath(selected)}>
            <span>{labels.photo}</span><span aria-hidden="true">↗</span>
          </Link>
        </section>

        <footer className={styles.footer}>
          <span>XIV / ATELIER</span>
          <span>{locale === 'ko' ? '스타일은 편집 중에도 바꿀 수 있습니다.' : locale === 'ja' ? 'スタイルは編集中でも変更できます。' : 'You can change your style in the editor.'}</span>
        </footer>
      </div>
    </div>
  );
}
