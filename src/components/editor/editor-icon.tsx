import type { ReactNode } from 'react';
import type { EditorPanelId } from '@/store/editor-store';

export type EditorIconName =
  | EditorPanelId
  | 'close'
  | 'export'
  | 'fit'
  | 'pan'
  | 'preview'
  | 'redo'
  | 'reset'
  | 'safe-area'
  | 'sparkle'
  | 'undo'
  | 'upload'
  | 'zoom-in'
  | 'zoom-out';

const shapes: Record<EditorIconName, ReactNode> = {
  screenshot: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><circle cx="8.3" cy="9" r="1.4" /><path d="m4 17 5-5 3 3 2-2 6 5" /></>,
  character: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.2-5.2 7-5.2s6.2 1.8 7 5.2" /></>,
  information: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  template: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M9 9v11" /></>,
  style: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="1.7" fill="var(--editor-panel, #171816)" /><circle cx="15" cy="12" r="1.7" fill="var(--editor-panel, #171816)" /><circle cx="8" cy="18" r="1.7" fill="var(--editor-panel, #171816)" /></>,
  effects: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  export: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  fit: <><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /></>,
  pan: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3" /></>,
  preview: <><rect x="3" y="4" width="18" height="14" rx="1.5" /><path d="M8 21h8m-4-3v3" /></>,
  redo: <><path d="M15 7h4v4" /><path d="M19 7 13 13a5 5 0 0 1-7 0l-1-1" /></>,
  reset: <><path d="M4 11a8 8 0 1 1 1.7 5.2" /><path d="M4 5v6h6" /></>,
  'safe-area': <><rect x="3" y="3" width="18" height="18" rx="1" /><rect x="7" y="7" width="10" height="10" rx=".5" /></>,
  sparkle: <><path d="m12 3 1.8 5.3L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  undo: <><path d="M9 7H5v4" /><path d="M5 7 11 13a5 5 0 0 0 7 0l1-1" /></>,
  upload: <><path d="M12 15V4m-4 4 4-4 4 4" /><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" /></>,
  'zoom-in': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M10.5 7.5v6m-3-3h6" /></>,
  'zoom-out': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M7.5 10.5h6" /></>,
};

export function EditorIcon({ name, size = 18 }: { name: EditorIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
