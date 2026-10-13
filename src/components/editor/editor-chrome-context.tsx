'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { EditorGuideHost } from './editor-guide';
import { useI18n } from '@/lib/i18n';
import { TYPOGRAPHY_STYLESHEET_LOADERS } from '@/data/fonts/stylesheet-loaders.generated';

interface EditorChromeState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  navigatorOpen: boolean;
  setNavigatorOpen: Dispatch<SetStateAction<boolean>>;
  navigatorTriggerRef: RefObject<HTMLButtonElement | null>;
  guideOpen: boolean;
  setGuideOpen: Dispatch<SetStateAction<boolean>>;
  guideTriggerRef: RefObject<HTMLButtonElement | null>;
}

const EditorChromeContext = createContext<EditorChromeState | null>(null);

/** Session-only layout state; card drafts and exported artwork never include it. */
export function EditorChromeProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const navigatorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const stylesheet = locale === 'ja' ? 'notoSansJp' : 'notoSansKr';
    const family = locale === 'ja' ? 'Noto Sans JP Variable' : 'Noto Sans KR Variable';
    // UI font availability is independent of the scripts used in the card artwork.
    void TYPOGRAPHY_STYLESHEET_LOADERS[stylesheet]()
      .then(() => document.fonts.load(`400 14px "${family}"`, 'Photo Text Design Guide'))
      .catch(() => { /* The declared system fallback remains usable offline. */ });
  }, [locale]);
  return <EditorChromeContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed, navigatorOpen, setNavigatorOpen, navigatorTriggerRef, guideOpen, setGuideOpen, guideTriggerRef }}>{children}<EditorGuideHost /></EditorChromeContext.Provider>;
}

export function useEditorChrome() {
  const context = useContext(EditorChromeContext);
  if (!context) throw new Error('EditorChromeProvider is required');
  return context;
}
