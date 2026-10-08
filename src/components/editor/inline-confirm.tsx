'use client';

import { memo, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import styles from '@/app/editor/editor.module.css';
import { isImeComposing } from './editor-input';
import { getInlineConfirmKeyboardAction } from './editor-interaction';
import { profileRender } from '@/lib/performance-profile';

type InlineConfirmProps = {
  triggerLabel: string;
  triggerClassName?: string;
  triggerContent: ReactNode;
  prompt: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export const InlineConfirm = memo(function InlineConfirm({
  triggerLabel,
  triggerClassName,
  triggerContent,
  prompt,
  cancelLabel,
  confirmLabel,
  onConfirm,
}: InlineConfirmProps) {
  profileRender('InlineConfirm');
  const [isConfirming, setIsConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocusOnClose = useRef(false);
  const promptId = useId();

  useEffect(() => {
    if (isConfirming) cancelRef.current?.focus();
    else if (restoreFocusOnClose.current) {
      triggerRef.current?.focus();
      restoreFocusOnClose.current = false;
    }
  }, [isConfirming]);

  function cancel() {
    restoreFocusOnClose.current = true;
    setIsConfirming(false);
  }

  function confirm() {
    if (!isConfirming) return;
    restoreFocusOnClose.current = true;
    setIsConfirming(false);
    onConfirm();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isImeComposing(event.nativeEvent)) return;
    const action = getInlineConfirmKeyboardAction(event.key, isConfirming, event.target === cancelRef.current);
    if (action === 'cancel') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (action === 'confirm') {
      event.preventDefault();
      event.stopPropagation();
      confirm();
    }
  }

  return (
    <div
      className={`${styles.inlineConfirm ?? ''} ${isConfirming ? (styles.inlineConfirmConfirming ?? '') : ''}`.trim()}
      data-state={isConfirming ? 'confirming' : 'idle'}
      data-editor-shortcuts-disabled={isConfirming ? 'true' : undefined}
      role={isConfirming ? 'group' : undefined}
      aria-labelledby={isConfirming ? promptId : undefined}
      onKeyDown={onKeyDown}
    >
      {isConfirming ? (
        <>
          <span id={promptId} className={styles.inlineConfirmPrompt ?? ''} role="status" aria-live="polite">{prompt}</span>
          <span className={styles.inlineConfirmActions ?? ''}>
            <button ref={cancelRef} type="button" className={styles.inlineConfirmCancel ?? ''} onClick={cancel}>{cancelLabel}</button>
            <button type="button" className={styles.inlineConfirmAccept ?? ''} onClick={confirm}>{confirmLabel}</button>
          </span>
        </>
      ) : (
        <button ref={triggerRef} type="button" className={triggerClassName} aria-label={triggerLabel} title={triggerLabel} onClick={() => setIsConfirming(true)}>
          {triggerContent}
        </button>
      )}
    </div>
  );
});
