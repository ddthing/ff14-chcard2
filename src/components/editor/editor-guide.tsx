'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { Locale } from '@/lib/types';
import { useEditorChrome } from '@/components/editor/editor-chrome-context';
import { EditorIcon } from '@/components/editor/editor-icon';
import { useI18n } from '@/lib/i18n';
import styles from './editor-guide.module.css';

const GUIDE_COPY: Record<Locale, {
  title: string;
  close: string;
  previous: string;
  next: string;
  done: string;
  stepOf: (step: number) => string;
  steps: ReadonlyArray<{ title: string; description: string }>;
}> = {
  ko: {
    title: '편집기 빠른 안내',
    close: '안내 닫기',
    previous: '이전',
    next: '다음',
    done: '완료',
    stepOf: (step) => `${step} / 4 단계`,
    steps: [
      { title: '작업 도구를 골라 시작해요', description: '사진, 문구, 디자인 도구를 선택하면 편집 패널이 해당 작업에 맞게 바뀝니다.' },
      { title: '번호로 문구를 찾거나 카드에서 바로 골라요', description: '문구 목록의 번호는 카드 문구와 연결됩니다. 카드에 표시된 이름이나 문장을 눌러도 같은 문구를 편집할 수 있어요.' },
      { title: '사진과 글꼴을 조절해요', description: '사진 위치와 확대 수치를 입력하거나 슬라이더로 맞추세요. 문구를 선택하면 실제 모양을 보며 글꼴을 고를 수 있습니다.' },
      { title: '이미지를 저장해요', description: '완성되면 오른쪽 위의 이미지 저장을 눌러 카드를 내보내세요. 언제든 다시 편집할 수 있습니다.' },
    ],
  },
  en: {
    title: 'Editor quick guide',
    close: 'Close guide',
    previous: 'Previous',
    next: 'Next',
    done: 'Done',
    stepOf: (step) => `Step ${step} of 4`,
    steps: [
      { title: 'Choose a tool to get started', description: 'Choose Photo, Text, or Design. The editing panel changes to match your task.' },
      { title: 'Use the numbers or select text on the card', description: 'The numbered text list matches the editable text on your card. You can also select a name or phrase directly on the card.' },
      { title: 'Adjust photos and fonts', description: 'Enter photo position or scale values, or use the sliders. Select text to browse fonts with a live preview.' },
      { title: 'Save your image', description: 'When your card is ready, choose Save image in the top right to export it. You can return to edit it at any time.' },
    ],
  },
  ja: {
    title: '編集ガイド',
    close: 'ガイドを閉じる',
    previous: '戻る',
    next: '次へ',
    done: '完了',
    stepOf: (step) => `ステップ ${step} / 4`,
    steps: [
      { title: 'ツールを選んで始めましょう', description: '写真・テキスト・デザインを選ぶと、編集パネルが作業に合わせて切り替わります。' },
      { title: '番号から選ぶか、カード上で直接選択', description: 'テキスト一覧の番号はカード上の編集できる文言に対応しています。カード上の名前や文章を直接選んでも編集できます。' },
      { title: '写真とフォントを調整', description: '写真の位置や拡大率は数値入力またはスライダーで調整できます。テキストを選ぶと、実際の見た目を確認しながらフォントを選べます。' },
      { title: '画像を保存', description: 'カードが完成したら右上の「画像を保存」を選んで書き出します。いつでも編集に戻れます。' },
    ],
  },
};

export function EditorGuideHost() {
  const { locale } = useI18n();
  const { guideOpen, setGuideOpen, guideTriggerRef } = useEditorChrome();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const copy = GUIDE_COPY[locale];
  const currentStep = copy.steps[step];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (guideOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
    }
    else if (!guideOpen && dialog.open) dialog.close();
  }, [guideOpen]);

  function closeGuide() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else {
      setGuideOpen(false);
      setStep(0);
    }
  }

  function handleDialogClose() {
    setGuideOpen(false);
    setStep(0);
    requestAnimationFrame(() => {
      const trigger = guideTriggerRef.current;
      if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus({ preventScroll: true });
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    });
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement, Event>) {
    event.preventDefault();
    closeGuide();
  }

  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((control) => control.getClientRects().length > 0);
    if (!controls.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function advance() {
    if (step === copy.steps.length - 1) closeGuide();
    else setStep((current) => Math.min(copy.steps.length - 1, current + 1));
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-editor-shortcuts-disabled="true"
      aria-labelledby="editor-guide-title"
      aria-describedby="editor-guide-description"
      onCancel={handleCancel}
      onClose={handleDialogClose}
      onKeyDown={trapTab}
    >
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{copy.title}</p>
          <span className={styles.counter} aria-live="polite" aria-atomic="true">{copy.stepOf(step + 1)}</span>
          <button type="button" className={styles.closeButton} aria-label={copy.close} onClick={closeGuide}>
            <EditorIcon name="close" size={18} />
          </button>
        </header>

        <div className={styles.progress} aria-hidden="true">
          {copy.steps.map((item, index) => (
            <span key={item.title} className={styles.progressDot} data-active={index === step ? 'true' : undefined} data-complete={index < step ? 'true' : undefined} />
          ))}
        </div>

        <div className={styles.stepContent} aria-live="polite" aria-atomic="true">
          <h2 id="editor-guide-title" className={styles.title}>{currentStep.title}</h2>
          <p id="editor-guide-description" className={styles.description}>{currentStep.description}</p>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
            {copy.previous}
          </button>
          <button type="button" className={styles.primaryButton} onClick={advance}>
            {step === copy.steps.length - 1 ? copy.done : copy.next}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
