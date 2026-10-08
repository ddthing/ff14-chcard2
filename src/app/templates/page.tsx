'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMaster } from '@/components/marketing/lazy-master';
import { getRouteCopy } from '@/components/editor/copy';
import { buildCardData, readCardDraft, writeCardDraft } from '@/components/editor/draft';
import { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { useI18n } from '@/lib/i18n';
import type { AdventurerCardTemplate } from '@/components/cards/types';
import type { Locale } from '@/lib/types';
import styles from './templates.module.css';

const templates = MASTER_TEMPLATE_ORDER.map((id) => ({
  id,
  master: MASTER_CARD_CONFIG[id],
}));

function choiceLabel(locale: Locale, title: string, selected: boolean) {
  if (locale === 'ko') return selected ? `${title} 선택됨` : `${title} 스타일 미리보기 선택`;
  if (locale === 'ja') return selected ? `${title}を選択中` : `${title}のスタイルをプレビュー`;
  return selected ? `${title} selected` : `Preview ${title} design`;
}

export default function TemplatesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = getRouteCopy(locale);
  const [selected, setSelected] = useState<AdventurerCardTemplate>(MASTER_TEMPLATE_ORDER[0]);
  const labels: Record<AdventurerCardTemplate, { title: string; description: string }> = {
    cinematic: { title: copy.cinematic, description: copy.cinematicDesc },
    editorial: { title: copy.editorial, description: copy.editorialDesc },
    'id-card': { title: copy.idCard, description: copy.idCardDesc },
  };

  function startWith(template: AdventurerCardTemplate) {
    writeCardDraft(buildCardData(template, readCardDraft()));
    router.push('/editor');
  }

  return (
    <div className={styles.page} lang={locale} data-page-transition="templates">
      <div className={styles.wrap}>
        <header className={styles.heading}>
          <div className={styles.headingCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true" />{copy.templatesEyebrow}</p>
            <h1>{copy.templatesTitle}</h1>
            <p className={styles.intro}>{copy.templatesIntro}</p>
          </div>
        </header>

        <section className={styles.gallery} aria-label={copy.templatesEyebrow}>
          {templates.map((template, index) => {
            const active = selected === template.id;
            const title = labels[template.id].title;

            return (
              <article
                className={styles.master}
                id={template.id}
                data-template={template.id}
                data-selected={active}
                data-master-id={template.master.id}
                key={template.id}
              >
                <figure className={styles.masterVisual}>
                  <div className={styles.visualStage}>
                    <div className={styles.cardFrame}>
                      <LazyMaster
                        template={template.id}
                        ratio="4:5"
                        locale={locale}
                        eager={index === 0}
                        className={styles.masterCard}
                      />
                      <button
                        className={styles.focusTarget}
                        type="button"
                        aria-label={choiceLabel(locale, title, active)}
                        aria-pressed={active}
                        onClick={() => setSelected(template.id)}
                      />
                    </div>
                  </div>
                  <figcaption className={styles.visualCaption}>
                    <span>{template.master.direction.toUpperCase()}</span>
                    <span>4 : 5</span>
                  </figcaption>
                </figure>

                <div className={styles.masterCopy}>
                  <h2>{title}</h2>
                  <p className={styles.description}>{labels[template.id].description}</p>
                  {active && (
                    <button className={styles.primaryAction} type="button" onClick={() => startWith(template.id)}>
                      <span>{copy.useTemplate}</span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
