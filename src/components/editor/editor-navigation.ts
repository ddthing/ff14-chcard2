import type { EditorPanelId } from '@/store/editor-store';
import type { AdventurerCardCharacter } from '@/components/cards/types';

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

/** Returns the task-tab action, keeping desktop selection stable and making mobile tabs toggles. */
export function getEditorTaskActivation(
  task: EditorTaskId,
  currentPanel: EditorPanelId,
  inspectorOpen: boolean,
  isMobile: boolean,
): { activePanel: EditorPanelId; inspectorOpen: boolean } {
  if (isMobile && getEditorTaskForPanel(currentPanel) === task) {
    return { activePanel: currentPanel, inspectorOpen: !inspectorOpen };
  }

  return { activePanel: EDITOR_TASK_PANEL[task], inspectorOpen: true };
}

/** A sparse new user card needs identity input when entering after a full-page navigation. */
export function getEditorEntryPanel(character: AdventurerCardCharacter, current: EditorPanelId): EditorPanelId {
  return current === 'screenshot' && character.profileOrigin === 'user' && !character.name.trim()
    ? 'information'
    : current;
}
