import type { EditorPanelId } from '@/store/editor-store';

export const EDITOR_TASK_IDS = ['photo', 'information', 'design'] as const;
export type EditorTaskId = (typeof EDITOR_TASK_IDS)[number];

export const EDITOR_TASK_PANEL: Record<EditorTaskId, EditorPanelId> = {
  photo: 'screenshot',
  information: 'character',
  design: 'template',
};

export const EDITOR_TASK_FOR_PANEL: Record<EditorPanelId, EditorTaskId> = {
  screenshot: 'photo',
  character: 'information',
  information: 'information',
  template: 'design',
  style: 'design',
  effects: 'design',
};

export function getEditorTaskForPanel(panel: EditorPanelId): EditorTaskId {
  return EDITOR_TASK_FOR_PANEL[panel];
}
