import { AppIcon } from '@/components/app-icon';
import type { XxdIconName } from '@/components/icons/vendor/xxd-ui-kit/nodes.js';
import type { EditorPanelId } from '@/store/editor-store';

export type EditorIconName =
  | EditorPanelId
  | 'close'
  | 'export'
  | 'fit'
  | 'pan'
  | 'panel-left'
  | 'more'
  | 'text'
  | 'preview'
  | 'redo'
  | 'reset'
  | 'safe-area'
  | 'select'
  | 'sparkle'
  | 'undo'
  | 'upload'
  | 'zoom-in'
  | 'zoom-out';

type EditorIconMapping = {
  name: XxdIconName;
  mirrored?: boolean;
};

const ICONS: Record<EditorIconName, EditorIconMapping> = {
  screenshot: { name: 'Image' },
  character: { name: 'UserRound' },
  information: { name: 'Info' },
  template: { name: 'PanelsTopLeft' },
  style: { name: 'SlidersHorizontal' },
  effects: { name: 'Sparkles' },
  close: { name: 'X' },
  export: { name: 'Download' },
  fit: { name: 'Maximize2' },
  pan: { name: 'Grip' },
  'panel-left': { name: 'PanelRightOpen', mirrored: true },
  more: { name: 'Ellipsis' },
  text: { name: 'Type' },
  preview: { name: 'Eye' },
  redo: { name: 'Redo' },
  reset: { name: 'RotateCcw' },
  'safe-area': { name: 'Square' },
  select: { name: 'MousePointer2' },
  sparkle: { name: 'Sparkle' },
  undo: { name: 'Undo' },
  upload: { name: 'Upload' },
  'zoom-in': { name: 'Plus' },
  'zoom-out': { name: 'Minus' },
};

export function EditorIcon({ name, size = 18 }: { name: EditorIconName; size?: number }) {
  const icon = ICONS[name];
  return <AppIcon name={icon.name} size={size} mirrored={icon.mirrored} />;
}
