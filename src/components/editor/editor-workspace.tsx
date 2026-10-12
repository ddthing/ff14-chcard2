'use client';

import { useRouter } from 'next/navigation';
import {
  memo,
  Profiler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';
import { useI18n } from '@/lib/i18n';
import { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { getJobTheme } from '@/lib/job-themes';
import { localizeCardWorld } from '@/lib/card-microcopy';
import { getJob, LANGUAGES, PLAY_STYLES } from '@/data/ffxiv';
import { prepareImageFile, ImageProcessingError, isImageProcessingCancelled } from '@/lib/image-processing';
import { EditorBoundary } from './editor-boundary';
import { EDITOR_TASK_FOR_PANEL as TASK_FOR_PANEL, EDITOR_TASK_IDS as TASK_IDS, EDITOR_TASK_PANEL as TASK_PANEL, getEditorEntryPanel, getEditorTaskActivation, type EditorTaskId } from './editor-navigation';
import { getUploadErrorMessage } from './editor-errors';
import { committedLevel, isImeComposing, validLevelInput } from './editor-input';
import { cancelPendingEditorUploads, registerUploadCancellation } from './upload-session';
import { PERFORMANCE_PROFILING_ENABLED, profileCommit, profileRender, profileTiming } from '@/lib/performance-profile';
import { CardPreview } from '@/components/editor/card-preview';
import { TypographyRoleEditor } from '@/components/editor/typography-role-editor';
import { getCardTextItems, type CardTextCategory, type CardTextItem } from '@/lib/card-text-editing';
import { CardTextEditorNavigation, CardTextOverrideInput, DefaultCopySampleButton, GlobalTypographyPresetPicker } from '@/components/editor/text-editor/card-text-editor';
import { getEditorTextCategory, resolveSelectedTextItem } from '@/components/editor/text-editor/card-text-model';
import { CardTextOverlay } from '@/components/editor/text-editor/card-text-overlay';
import { selectTextEditorControl } from '@/components/editor/text-editor/text-editor-focus';
import { TextureEffects } from './TextureEffects';
import { toggleCardTextureEffect, type CardTextureEffect } from '@/lib/card-texture-effects';
import { getEditorCopy, type EditorCopy } from '@/components/editor/copy';
import { formatAccessibleImageControlValue, formatAccessiblePercent } from '@/components/editor/editor-accessibility';
import { EditorIcon, type EditorIconName } from '@/components/editor/editor-icon';
import { ToolbarTooltipButton } from '@/components/editor/toolbar-tooltip-button';
import { ProjectLibraryDialogTrigger } from '@/components/library/local-project-library';
import { InlineConfirm } from '@/components/editor/inline-confirm';
import { resolveEditorKeyboardAction } from '@/components/editor/editor-keyboard';
import { FFXIVAttribution } from '@/components/ffxiv/ffxiv-attribution';
import { GrandCompanyPicker, JobPicker, RaceClanPicker, WorldPicker } from '@/components/editor/ffxiv-pickers';
import { demoAdventurerCards, demoAdventurerData, type AdventurerCardData, type AdventurerCardTemplate, type CardLayoutVariant } from '@/components/cards/types';
import { RatioPicker } from '@/components/editor/ratio-picker';
import {
  isSampleArtworkSource,
  transitionImageDragHint,
  type ImageDragHintEvent,
  type ImageDragHintPhase,
} from '@/components/editor/editor-ux';
import {
  hasFileTransfer,
  canBeginCanvasDrag,
  isBrowserZoomWheelGesture,
  isCanvasDragPointer,
  isEditorShortcutSuppressed,
  tryReleasePointerCapture,
  trySetPointerCapture,
  transitionUploadInteractionState,
  updateFileDragDepth,
  type UploadInteractionState,
} from '@/components/editor/editor-interaction';
import type { Locale } from '@/lib/types';
import { editorStore, useEditorStore, type EditorImageState } from '@/store/editor-store';
import { FFXIV_OFFICIAL_ASSETS_ENABLED } from '@/lib/ffxiv-assets';
import styles from '@/app/editor/editor.module.css';

const TASK_ICONS: Record<EditorTaskId, EditorIconName> = {
  photo: 'screenshot',
  information: 'character',
  design: 'template',
};
const CARD_TEMPLATES = MASTER_TEMPLATE_ORDER;
const SAMPLE_ARTWORK_SOURCES = new Set([
  demoAdventurerData.imageUrl,
  ...Object.values(demoAdventurerCards).map((card) => card.imageUrl),
]);
const COLOR_KEYS = ['primary', 'accent', 'light', 'dark'] as const;
const BASIC_IMAGE_CONTROL_KEYS = ['x', 'y', 'scale'] as const;
const ADVANCED_IMAGE_CONTROL_KEYS = ['rotation', 'brightness', 'contrast', 'saturation', 'exposure'] as const;
const IMAGE_DRAG_HINT_DURATION_MS = 3200;
const SCREENSHOT_INPUT_ID = 'editor-screenshot-file';
const SCREENSHOT_TYPES_ID = 'editor-screenshot-types';
const SCREENSHOT_STATUS_ID = 'editor-screenshot-status';
const SCREENSHOT_ERROR_ID = 'editor-screenshot-error';

type TextFieldKey = 'name' | 'level' | 'freeCompany' | 'bio';
type ImageControlKey = (typeof BASIC_IMAGE_CONTROL_KEYS)[number] | (typeof ADVANCED_IMAGE_CONTROL_KEYS)[number];
type ColorKey = (typeof COLOR_KEYS)[number];
type RatioStyle = CSSProperties & { '--ratio-width'?: number; '--ratio-height'?: number };

const IMAGE_CONTROL_CONFIG: Record<ImageControlKey, { min: number; max: number; step: number }> = {
  x: { min: 0, max: 100, step: 1 },
  y: { min: 0, max: 100, step: 1 },
  scale: { min: 0.75, max: 2.5, step: 0.01 },
  rotation: { min: -10, max: 10, step: 0.5 },
  brightness: { min: 0.5, max: 1.5, step: 0.01 },
  contrast: { min: 0.5, max: 1.5, step: 0.01 },
  saturation: { min: 0, max: 1.5, step: 0.01 },
  exposure: { min: -2, max: 2, step: 0.1 },
};

const MemoCardPreview = memo(CardPreview);

function ratioNumber(value: string): [number, number] {
  const [width, height] = value.split(':').map(Number);
  return [width || 4, height || 5];
}

function getTemplateLabel(copy: EditorCopy, template: AdventurerCardTemplate): string {
  return copy.templates[template];
}

function getTemplateChoiceActionLabel(
  copy: EditorCopy,
  template: AdventurerCardTemplate,
  selected: boolean,
  layoutVariant: CardLayoutVariant,
  locale: Locale,
): string {
  const templateName = getTemplateLabel(copy, template);
  const masterLabel = copy.variationNames.a;

  if (!selected || layoutVariant === 'a') return `${copy.template}: ${templateName} · ${masterLabel}`;

  const variantLabel = copy.variationNames[layoutVariant];
  if (locale === 'ko') return `${copy.template}: ${templateName} · ${variantLabel} 선택됨. 누르면 ${masterLabel}로 돌아갑니다.`;
  if (locale === 'ja') return `${copy.template}: ${templateName} · ${variantLabel}を選択中。押すと${masterLabel}に戻ります。`;
  return `${copy.template}: ${templateName} · ${variantLabel} selected. Activate to return to ${masterLabel}.`;
}

function moreCanvasControlsLabel(locale: Locale): string {
  if (locale === 'ko') return '추가 도구';
  if (locale === 'ja') return 'その他';
  return 'More tools';
}

function compactMoreCanvasControlsLabel(locale: Locale): string {
  if (locale === 'ko') return '더보기';
  if (locale === 'ja') return 'その他';
  return 'More';
}

function getFocusedFieldLabel(copy: EditorCopy, field: string): string {
  if (!field || !Object.prototype.hasOwnProperty.call(copy.fields, field)) return '';
  return copy.fields[field as keyof EditorCopy['fields']];
}

function formatFocusedFieldHint(locale: Locale, label: string): string {
  if (locale === 'ko') return `편집 중 · ${label}`;
  if (locale === 'ja') return `編集中 · ${label}`;
  return `Editing · ${label}`;
}

function photoAdjustmentsLabel(locale: Locale): string {
  if (locale === 'ko') return '사진 조정';
  if (locale === 'ja') return '写真の調整';
  return 'Photo adjustments';
}

function selectMasterTemplate(template: AdventurerCardTemplate) {
  const state = editorStore.getState();
  if (state.design.template === template && state.design.layoutVariant === 'a') return;
  state.setDesign({ template, layoutVariant: MASTER_CARD_CONFIG[template].layout });
}

const MasterTemplateProof = memo(function MasterTemplateProof({ template, locale }: { template: AdventurerCardTemplate; locale: Locale }) {
  return (
    <div className={styles.templateProof} aria-hidden="true">
      <div className={styles.templateProofCanvas}><CardPreview data={demoAdventurerCards[template]} locale={locale} /></div>
    </div>
  );
});

const CharacterInput = memo(function CharacterInput({
  field,
  value,
  copy,
  onUpdate,
  onFocusField,
  allowEmptyLevel = false,
  textItemId,
}: {
  field: TextFieldKey;
  value: string | number;
  copy: EditorCopy;
  onUpdate: (field: TextFieldKey, value: string) => void;
  onFocusField: (field: string) => void;
  allowEmptyLevel?: boolean;
  textItemId?: string;
}) {
  const label = copy.fields[field];
  profileRender(`CharacterInput.${field}`);
  const placeholder = field === 'level' ? undefined : copy.placeholders[field];
  const isLevel = field === 'level';
  const displayValue = allowEmptyLevel && isLevel && value === 0 ? '' : String(value);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const currentValue = editingValue ?? displayValue;
  const composing = useRef(false);
  const latestComposition = useRef<string | null>(null);
  const groupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupId = `text-${field}`;
  const updateRef = useRef(onUpdate);
  useEffect(() => { updateRef.current = onUpdate; }, [onUpdate]);

  function endGroup() {
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = null;
    const state = editorStore.getState();
    if (state.history.groupId === groupId) state.endHistoryGroup();
  }

  function commit(next: string) {
    updateRef.current(field, next);
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(endGroup, 600);
  }

  useEffect(() => () => {
    if (latestComposition.current !== null) updateRef.current(field, latestComposition.current);
    if (groupTimer.current) clearTimeout(groupTimer.current);
    const state = editorStore.getState();
    if (state.history.groupId === `text-${field}`) state.endHistoryGroup();
    if (state.isHydrated) state.persistNow();
  }, [field]);

  const handlers = {
    onFocus: () => onFocusField(field),
    onBlur: () => {
      if (isLevel && allowEmptyLevel && currentValue.trim() === '') commit('');
      else if (isLevel) commit(String(committedLevel(currentValue, editorStore.getState().character.level)));
      else if (latestComposition.current !== null) commit(latestComposition.current);
      composing.current = false;
      latestComposition.current = null;
      setEditingValue(null);
      endGroup();
      editorStore.getState().persistNow();
      onFocusField('');
    },
    onCompositionStart: () => {
      composing.current = true;
      latestComposition.current = currentValue;
      setEditingValue(currentValue);
      if (groupTimer.current) clearTimeout(groupTimer.current);
    },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false;
      latestComposition.current = null;
      setEditingValue(null);
      commit(event.currentTarget.value);
    },
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.currentTarget.value;
      if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
        latestComposition.current = next;
        setEditingValue(next);
      } else if (isLevel) {
        setEditingValue(next);
        if (validLevelInput(next)) commit(next);
      } else commit(next);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (composing.current || isImeComposing(event.nativeEvent)) event.stopPropagation();
    },
  };

  return (
    <label className={`${styles.field} ${field === 'bio' ? styles.bioField : ''} ${field === 'name' || field === 'freeCompany' || field === 'bio' ? styles.fieldWide : ''}`}>
      <span>{label}</span>
      {field === 'bio' ? <><textarea data-editor-field={field} data-card-text-editor-control={textItemId} rows={4} maxLength={120} value={currentValue}
        placeholder={placeholder} aria-label={label} {...handlers}/><small>{currentValue.length} / 120</small></> : <input
        type={isLevel ? 'number' : 'text'}
        data-editor-field={field}
        data-card-text-editor-control={textItemId}
        min={isLevel ? 1 : undefined}
        max={isLevel ? 100 : undefined}
        maxLength={isLevel ? undefined : 48}
        inputMode={isLevel ? 'numeric' : undefined}
        autoComplete="off"
        spellCheck={field !== 'name' && field !== 'freeCompany'}
        value={currentValue}
        placeholder={placeholder}
        aria-label={label}
        {...handlers}
      />}
    </label>
  );
});

const MemoJobPicker = memo(JobPicker, (previous, next) =>
  previous.copy === next.copy &&
  previous.locale === next.locale &&
  previous.character.jobId === next.character.jobId &&
  previous.character.job === next.character.job &&
  previous.editorControlId === next.editorControlId &&
  previous.onFocusField === next.onFocusField &&
  previous.onBlurField === next.onBlurField,
);

const MemoWorldPicker = memo(WorldPicker, (previous, next) =>
  previous.copy === next.copy &&
  previous.locale === next.locale &&
  previous.character.service === next.character.service &&
  previous.character.physicalRegionId === next.character.physicalRegionId &&
  previous.character.dataCenterId === next.character.dataCenterId &&
  previous.character.worldId === next.character.worldId &&
  previous.character.world === next.character.world &&
  previous.editorControlId === next.editorControlId &&
  previous.onFocusField === next.onFocusField &&
  previous.onBlurField === next.onBlurField,
);

const MemoRaceClanPicker = memo(RaceClanPicker, (previous, next) =>
  previous.copy === next.copy &&
  previous.locale === next.locale &&
  previous.character.raceId === next.character.raceId &&
  previous.character.race === next.character.race &&
  previous.character.clanId === next.character.clanId &&
  previous.character.clan === next.character.clan &&
  previous.onFocusField === next.onFocusField &&
  previous.onBlurField === next.onBlurField,
);

const MemoGrandCompanyPicker = memo(GrandCompanyPicker, (previous, next) =>
  previous.copy === next.copy &&
  previous.locale === next.locale &&
  previous.character.grandCompanyId === next.character.grandCompanyId &&
  previous.character.grandCompany === next.character.grandCompany &&
  previous.onFocusField === next.onFocusField &&
  previous.onBlurField === next.onBlurField,
);

function EditorInspector({
  copy,
  activeTask,
  isMobileViewport,
  onFocusField,
  onClose,
  onSuccessfulUpload,
  locale,
  isOpen,
  selectedTextId,
  textCategory,
  onSelectTextCategory,
  onSelectTextItem,
}: {
  copy: EditorCopy;
  activeTask: EditorTaskId;
  isMobileViewport: boolean;
  onFocusField: (field: string) => void;
  onClose: () => void;
  onSuccessfulUpload: () => void;
  locale: Locale;
  isOpen: boolean;
  selectedTextId: string | null;
  textCategory: CardTextCategory;
  onSelectTextCategory: (category: CardTextCategory) => void;
  onSelectTextItem: (item: CardTextItem) => void;
}) {
  const switchIdPrefix = useId();
  const character = useEditorStore((state) => state.character);
  const designTemplate = useEditorStore((state) => state.design.template);
  const layoutVariant = useEditorStore((state) => state.design.layoutVariant);
  const decorativeCopy = useEditorStore((state) => state.design.decorativeCopy);
  const textOverrides = useEditorStore((state) => state.design.textOverrides);
  const ratio = useEditorStore((state) => state.design.ratio);
  const typographyPreset = useEditorStore((state) => state.design.typographyPreset);
  const effectIntensity = useEditorStore((state) => state.design.effectIntensity);
  const colorMode = useEditorStore((state) => state.design.colorMode);
  const palette = useEditorStore((state) => state.design.palette);
  const jobMotifVisible = useEditorStore((state) => state.design.jobMotifVisible);
  const jobIconColor = useEditorStore((state) => state.design.jobIconColor);
  const effects = useEditorStore((state) => state.design.effects);
  const design = { template: designTemplate, layoutVariant, decorativeCopy, ratio, typographyPreset, colorMode, palette, jobMotifVisible, jobIconColor, effects, effectIntensity };
  const imageSource = useEditorStore((state) => state.image.src);
  const imageFileName = useEditorStore((state) => state.image.fileName);
  const image = useEditorStore((state) => activeTask === 'photo' ? state.image : null);
  const textItems = useMemo(() => getCardTextItems({
    character,
    design: { template: designTemplate, layoutVariant, decorativeCopy, textOverrides },
    imageUrl: imageSource,
  }, locale), [character, decorativeCopy, designTemplate, imageSource, layoutVariant, locale, textOverrides]);
  const supportsPerItemTextEditing = layoutVariant === 'a';
  const textEditorItems = supportsPerItemTextEditing ? textItems : textItems.filter((item) => item.field !== undefined);
  const defaultCopyIds = useMemo(
    () => textItems.filter((item) => item.category === 'copy' && item.supportsTextOverride).map((item) => item.id),
    [textItems],
  );
  const hasDefaultCopyOverrides = defaultCopyIds.some((id) => Object.hasOwn(textOverrides ?? {}, id));
  const activeTextCategory = !supportsPerItemTextEditing && textCategory === 'copy' ? 'identity' : textCategory;
  const selectedTextItem = resolveSelectedTextItem(textEditorItems, activeTextCategory, selectedTextId);
  const isSampleArtwork = isSampleArtworkSource(imageSource, SAMPLE_ARTWORK_SOURCES);
  const isHydrated = useEditorStore((state) => state.isHydrated);
  const [uploadError, setUploadError] = useState('');
  const [uploadState, setUploadState] = useState<UploadInteractionState>('idle');
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadToken = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const uploadDragDepth = useRef(0);
  const uploadSuccessTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);
  const sheetHandlePointer = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const suppressSheetHandleClick = useRef(false);
  const sheetHandlePointerFallbackCleanup = useRef<(() => void) | null>(null);
  const previousTaskRef = useRef(activeTask);
  const previousInspectorOpenRef = useRef(isOpen);
  const copyForPanel = copy.tasks[activeTask];
  const clearHighlightedField = useCallback(() => onFocusField(''), [onFocusField]);

  function finishSheetHandlePointer(pointerId: number, clientX: number, clientY: number) {
    const drag = sheetHandlePointer.current;
    sheetHandlePointer.current = null;
    if (!drag || drag.pointerId !== pointerId) return;
    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    const moved = Math.abs(deltaX) >= 8 || Math.abs(deltaY) >= 8;
    if (moved) {
      suppressSheetHandleClick.current = true;
      requestAnimationFrame(() => { suppressSheetHandleClick.current = false; });
    }
    if (deltaY >= 44) onClose();
  }

  function handleSheetHandlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    sheetHandlePointer.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    const captured = trySetPointerCapture(event.currentTarget, event.pointerId);
    if (captured) return;

    const pointerId = event.pointerId;
    const cleanup = () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      sheetHandlePointerFallbackCleanup.current = null;
    };
    const onWindowPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      finishSheetHandlePointer(pointerEvent.pointerId, pointerEvent.clientX, pointerEvent.clientY);
      cleanup();
    };
    const onWindowPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      sheetHandlePointer.current = null;
      cleanup();
    };
    sheetHandlePointerFallbackCleanup.current = cleanup;
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
  }

  function handleSheetHandlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    finishSheetHandlePointer(event.pointerId, event.clientX, event.clientY);
    tryReleasePointerCapture(event.currentTarget, event.pointerId);
    sheetHandlePointerFallbackCleanup.current?.();
  }

  function cancelSheetHandlePointer(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = sheetHandlePointer.current;
    sheetHandlePointer.current = null;
    if (drag?.pointerId === event.pointerId) tryReleasePointerCapture(event.currentTarget, event.pointerId);
    sheetHandlePointerFallbackCleanup.current?.();
  }

  function handleSheetHandleClick() {
    if (suppressSheetHandleClick.current) {
      suppressSheetHandleClick.current = false;
      return;
    }
    onClose();
  }

  profileRender('EditorInspector');
  if (activeTask === 'design') {
    profileRender('TemplatePicker.subtree');
  }

  useEffect(() => {
    if (selectedTextItem && selectedTextItem.id !== selectedTextId) onSelectTextItem(selectedTextItem);
  }, [onSelectTextItem, selectedTextId, selectedTextItem]);

  useLayoutEffect(() => {
    const previousTask = previousTaskRef.current;
    const inspectorWasOpen = previousInspectorOpenRef.current;
    previousTaskRef.current = activeTask;
    previousInspectorOpenRef.current = isOpen;
    if (previousTask === activeTask) return;

    const body = inspectorBodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    if (!inspectorWasOpen || !isOpen) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const animation = body.animate(
      [
        { opacity: 0.94, transform: 'translate3d(0, 4px, 0)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: MOTION_DURATION.ui * 1000,
        easing: `cubic-bezier(${MOTION_EASE.editorial.join(', ')})`,
        fill: 'both',
      },
    );
    return () => animation.cancel();
  }, [activeTask, isMobileViewport, isOpen]);

  useEffect(() => {
    let frame = 0;
    const revealFocusedInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inspector = inspectorRef.current;
        const input = document.activeElement;
        if (!inspector || !(input instanceof HTMLElement) || !inspector.contains(input) || !input.matches('input, textarea, select')) return;
        const body = inspectorBodyRef.current;
        if (!body) return;
        const bounds = body.getBoundingClientRect(), rect = input.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 8;
        const bottom = Math.min(bounds.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - 8;
        if (rect.bottom > bottom) body.scrollTop += rect.bottom - bottom;
        else if (rect.top < top) body.scrollTop -= top - rect.top;
      });
    };
    const viewport = window.visualViewport;
    const inspectorElement = inspectorRef.current;
    window.addEventListener('resize', revealFocusedInput);
    viewport?.addEventListener('resize', revealFocusedInput);
    viewport?.addEventListener('scroll', revealFocusedInput);
    inspectorElement?.addEventListener('focusin', revealFocusedInput);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', revealFocusedInput);
      viewport?.removeEventListener('resize', revealFocusedInput);
      viewport?.removeEventListener('scroll', revealFocusedInput);
      inspectorElement?.removeEventListener('focusin', revealFocusedInput);
    };
  }, []);

  const updateText = useCallback((field: TextFieldKey, value: string) => {
    const state = editorStore.getState();
    if (field === 'level') {
      if (state.character.profileOrigin === 'user' && value.trim() === '') {
        state.updateCharacter('level', 0, { groupId: `text-${field}` });
        return;
      }
      const level = Math.min(100, Math.max(1, Number(value) || 1));
      state.updateCharacter('level', level, { groupId: `text-${field}` });
      return;
    }
    state.updateCharacter(field, value, { groupId: `text-${field}` });
  }, []);

  useEffect(() => {
    const cancelUpload = () => {
      uploadToken.current += 1;
      uploadController.current?.abort();
      uploadController.current = null;
      uploadDragDepth.current = 0;
      if (uploadSuccessTimeout.current) clearTimeout(uploadSuccessTimeout.current);
      uploadSuccessTimeout.current = null;
      setUploadState((state) => transitionUploadInteractionState(state, 'cancel'));
      setUploadError('');
    };
    const unregister = registerUploadCancellation(cancelUpload);
    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (!uploadController.current || state.image === previous.image) return;
      cancelUpload();
    });
    return () => {
      unsubscribe();
      unregister();
      uploadToken.current += 1;
      uploadController.current?.abort();
      uploadController.current = null;
      uploadDragDepth.current = 0;
      if (uploadSuccessTimeout.current) clearTimeout(uploadSuccessTimeout.current);
      uploadSuccessTimeout.current = null;
    };
  }, []);

  const changeArrayField = useCallback((field: 'languages' | 'playStyles', value: string, limit: number) => {
    const state = editorStore.getState();
    const current = state.character[field];
    if (!current.includes(value) && current.length >= limit) return;
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    state.updateCharacter(field, next);
  }, []);

  const endAdjustment = useCallback(() => {
    editorStore.getState().endImageAdjustmentGroup();
  }, []);

  const updatePaletteColor = useCallback((key: ColorKey, value: string) => {
    const state = editorStore.getState();
    const palette = { ...state.design.palette, [key]: value };
    state.setDesign({ palette, ...(key === 'accent' ? { accentColor: value } : {}), colorMode: 'custom' });
  }, []);

  const updateImageControl = useCallback((key: ImageControlKey, value: number) => {
    const config = IMAGE_CONTROL_CONFIG[key];
    if (!Number.isFinite(value)) return;
    const nextValue = Math.min(config.max, Math.max(config.min, value));
    const state = editorStore.getState();
    if (state.image[key] === nextValue) return;
    const groupId = `image-${key}`;
    state.beginImageAdjustmentGroup(groupId);
    state.setImage({ [key]: nextValue } as Partial<EditorImageState>, { groupId });
  }, []);

  function resetImageAdjustments() {
    const id = 'image-reset';
    const state = editorStore.getState();
    if (state.image.x === 50 && state.image.y === 50 && state.image.scale === 1 && state.image.rotation === 0 &&
      state.image.brightness === 1 && state.image.contrast === 1 && state.image.saturation === 1 && state.image.exposure === 0) return;
    state.beginImageAdjustmentGroup(id);
    state.setImage({ x: 50, y: 50, scale: 1, rotation: 0, brightness: 1, contrast: 1, saturation: 1, exposure: 0 }, { groupId: id });
    state.endImageAdjustmentGroup();
  }

  async function acceptImage(file?: File) {
    if (!file) return;
    const token = uploadToken.current + 1;
    uploadToken.current = token;
    uploadController.current?.abort();
    uploadDragDepth.current = 0;
    if (uploadSuccessTimeout.current) clearTimeout(uploadSuccessTimeout.current);
    uploadSuccessTimeout.current = null;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploadError('');
    setUploadState((state) => transitionUploadInteractionState(state, 'processing'));
    try {
      const prepared = await prepareImageFile(file, {
        signal: controller.signal,
        ...(PERFORMANCE_PROFILING_ENABLED ? {
          onTiming: (stage, durationMs) => profileTiming('image-processing.' + stage, durationMs, { inputBytes: file.size }),
        } : {}),
      });
      if (uploadToken.current !== token) return;
      uploadController.current = null;
      const state = editorStore.getState();
      state.replaceUploadedImage({
        src: prepared.imageUrl,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
      }, prepared.palette);
      onSuccessfulUpload();
      setUploadState((state) => transitionUploadInteractionState(state, 'success'));
      uploadSuccessTimeout.current = setTimeout(() => {
        uploadSuccessTimeout.current = null;
        setUploadState((state) => transitionUploadInteractionState(state, 'success-timeout'));
      }, 1800);
    } catch (error) {
      if (uploadToken.current !== token || isImageProcessingCancelled(error)) return;
      setUploadError(error instanceof ImageProcessingError ? error.code : 'decode-failed');
      setUploadState((state) => transitionUploadInteractionState(state, 'error'));
    } finally {
      if (uploadToken.current === token) {
        uploadController.current = null;
      }
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void acceptImage(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  }

  function onDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    uploadDragDepth.current = 0;
    if (uploadState === 'drag-over') setUploadState((state) => transitionUploadInteractionState(state, 'file-leave'));
    void acceptImage(event.dataTransfer.files?.[0]);
  }

  function onFileDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    if (uploadState === 'processing') return;
    uploadDragDepth.current = updateFileDragDepth(uploadDragDepth.current, 'enter');
    setUploadState((state) => transitionUploadInteractionState(state, 'file-enter'));
  }

  function onFileDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onFileDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    uploadDragDepth.current = updateFileDragDepth(uploadDragDepth.current, 'leave');
    if (uploadDragDepth.current === 0 && uploadState === 'drag-over') {
      setUploadState((state) => transitionUploadInteractionState(state, 'file-leave'));
    }
  }

  function formatControlValue(key: ImageControlKey, value: number): string {
    if (key === 'x' || key === 'y') return `${Math.round(value)}%`;
    if (key === 'scale') return `${value.toFixed(2)}×`;
    if (key === 'rotation') return `${value.toFixed(1)}°`;
    if (key === 'exposure') return `${value > 0 ? '+' : ''}${value.toFixed(1)} EV`;
    return `${Math.round(value * 100)}%`;
  }

  const screenshotDescriptionIds = [
    SCREENSHOT_TYPES_ID,
    SCREENSHOT_STATUS_ID,
    ...(uploadError ? [SCREENSHOT_ERROR_ID] : []),
  ].join(' ');

  function getControlValue(key: ImageControlKey): number {
    return image?.[key] ?? editorStore.getState().image[key];
  }

  function renderImageControl(key: ImageControlKey) {
    const config = IMAGE_CONTROL_CONFIG[key];
    const value = getControlValue(key);
    return (
      <div className={styles.rangeControl} key={key}>
        <span className={styles.rangeLabel}><span>{copy.imageControls[key]}</span><output aria-live="off" aria-hidden="true">{formatControlValue(key, value)}</output></span>
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          aria-label={copy.imageControls[key]}
          aria-valuetext={formatAccessibleImageControlValue(locale, key, value)}
          onPointerUp={endAdjustment}
          onPointerCancel={endAdjustment}
          onBlur={endAdjustment}
          onKeyUp={endAdjustment}
          onChange={(event) => updateImageControl(key, Number(event.currentTarget.value))}
        />
        <input
          className={styles.rangeNumber}
          type="number"
          min={config.min}
          max={config.max}
          step={config.step}
          value={Number(value.toFixed(config.step < 1 ? config.step.toString().split('.')[1]?.length ?? 0 : 0))}
          aria-label={copy.imageValueLabel(copy.imageControls[key])}
          onBlur={endAdjustment}
          onChange={(event) => {
            if (event.currentTarget.value !== '') updateImageControl(key, Number(event.currentTarget.value));
          }}
        />
      </div>
    );
  }

  const jobRecord = character.jobId ? getJob(character.jobId) : undefined;
  const activeJobTheme = {
    ...getJobTheme(jobRecord?.localizedName.en ?? character.job),
    accent: jobRecord?.themeAccent ?? getJobTheme(character.job).accent,
    secondary: jobRecord?.themeSecondary ?? getJobTheme(character.job).secondary,
  };
  const representedCardFields = new Set(textItems.flatMap((item) => item.field ? [item.field] : []));
  const isFieldRepresented = (field: string) => representedCardFields.has(field as keyof typeof character);

  function renderLanguageField(controlId = 'character.languages') {
    return (
      <div className={styles.chipField} data-card-text-editor-control={controlId}>
        <span className={styles.controlLabel}>{copy.fields.languages}<small className={styles.chipCount}>{copy.picker.selectedCount(character.languages.length, copy.picker.maxLanguages)}</small></span>
        <div className={styles.choiceChips}>
          {[...LANGUAGES].sort((left, right) => left.sortOrder - right.sortOrder).map((language) => (
            <button
              type="button"
              className={styles.choiceChip}
              key={language.id}
              aria-pressed={character.languages.includes(language.id)}
              aria-label={`${copy.fields.languages}: ${language.localizedName[locale]}`}
              disabled={!character.languages.includes(language.id) && character.languages.length >= copy.picker.maxLanguages}
              onFocus={() => onFocusField('languages')}
              onBlur={() => onFocusField('')}
              onClick={() => changeArrayField('languages', language.id, copy.picker.maxLanguages)}
            >{language.localizedName[locale]}</button>
          ))}
        </div>
      </div>
    );
  }

  function renderPlayStyleField(controlId = 'character.playStyles') {
    return (
      <div className={styles.chipField} data-card-text-editor-control={controlId}>
        <span className={styles.controlLabel}>{copy.fields.playStyles}<small className={styles.chipCount}>{copy.picker.selectedCount(character.playStyles.length, copy.picker.maxPlayStyles)}</small></span>
        <div className={styles.choiceChips}>
          {[...PLAY_STYLES].sort((left, right) => left.sortOrder - right.sortOrder).map((playStyle) => (
            <button
              type="button"
              className={styles.choiceChip}
              key={playStyle.id}
              aria-pressed={character.playStyles.includes(playStyle.id)}
              aria-label={`${copy.fields.playStyles}: ${playStyle.localizedName[locale]}`}
              disabled={!character.playStyles.includes(playStyle.id) && character.playStyles.length >= copy.picker.maxPlayStyles}
              onFocus={() => onFocusField('playStyles')}
              onBlur={() => onFocusField('')}
              onClick={() => changeArrayField('playStyles', playStyle.id, copy.picker.maxPlayStyles)}
            >{playStyle.localizedName[locale]}</button>
          ))}
        </div>
      </div>
    );
  }

  function renderSelectedProfileControl(): ReactNode {
    const item = selectedTextItem;
    if (!item) return null;
    const itemId = String(item.id);

    if (itemId === 'character.jobAbbreviation') {
      return <MemoJobPicker character={character} copy={copy} locale={locale} editorControlId={item.id} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
    }
    if (itemId === 'character.origin') {
      return <MemoWorldPicker character={character} copy={copy} locale={locale} editorControlId={item.id} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
    }
    if (!item.field) return null;

    switch (item.field) {
      case 'name':
        return <CharacterInput field="name" value={character.name} copy={copy} onUpdate={updateText} onFocusField={onFocusField} textItemId={item.id} />;
      case 'bio':
        return <CharacterInput field="bio" value={character.bio} copy={copy} onUpdate={updateText} onFocusField={onFocusField} textItemId={item.id} />;
      case 'job':
        return <MemoJobPicker character={character} copy={copy} locale={locale} editorControlId={item.id} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
      case 'level':
        return <CharacterInput field="level" value={character.level} copy={copy} onUpdate={updateText} onFocusField={onFocusField} allowEmptyLevel={character.profileOrigin === 'user'} textItemId={item.id} />;
      case 'world':
      case 'dataCenter':
        return <MemoWorldPicker character={character} copy={copy} locale={locale} editorControlId={item.id} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
      case 'race':
      case 'clan':
        return <MemoRaceClanPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
      case 'freeCompany':
        return <CharacterInput field="freeCompany" value={character.freeCompany} copy={copy} onUpdate={updateText} onFocusField={onFocusField} textItemId={item.id} />;
      case 'grandCompany':
        return <MemoGrandCompanyPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />;
      case 'languages':
        return renderLanguageField(item.id);
      case 'playStyles':
        return renderPlayStyleField(item.id);
      default:
        return null;
    }
  }

  const hasUnrepresentedProfileFields = [
    'job', 'level', 'world', 'dataCenter', 'race', 'clan', 'freeCompany', 'grandCompany', 'languages', 'playStyles',
  ].some((field) => !isFieldRepresented(field));

  return (
    <aside ref={inspectorRef} id="editor-inspector" className={styles.inspector}
      role={isMobileViewport ? 'region' : 'tabpanel'}
      aria-labelledby={isMobileViewport ? 'editor-inspector-title' : `editor-task-tab-desktop-${activeTask}`}
      data-state={isOpen ? 'open' : 'closing'} aria-hidden={!isOpen} inert={!isOpen}>
      <button
        className={styles.sheetHandle}
        type="button"
        aria-label={copy.closeInspector}
        onPointerDown={handleSheetHandlePointerDown}
        onPointerUp={handleSheetHandlePointerUp}
        onPointerCancel={cancelSheetHandlePointer}
        onLostPointerCapture={cancelSheetHandlePointer}
        onClick={handleSheetHandleClick}
      >
        <span aria-hidden="true" />
      </button>
      <div className={styles.inspectorHead}>
        <div className={styles.inspectorTitle}>
          <span className={styles.inspectorIcon}><EditorIcon name={TASK_ICONS[activeTask]} /></span>
          <h2 id="editor-inspector-title">{copyForPanel}</h2>
        </div>
        <button className={styles.closeInspector} type="button" onClick={onClose} aria-label={copy.closeInspector}><EditorIcon name="close" size={16} /></button>
      </div>

      <div ref={inspectorBodyRef} className={styles.inspectorBody}>
        {activeTask === 'photo' && (
          <div className={styles.photoPanel}>
            <section className={styles.photoControls} aria-label={copy.image}>
              <div className={styles.photoControlsHeading}>
                <h3>{photoAdjustmentsLabel(locale)}</h3>
                <button type="button" className={styles.imageResetButton} aria-label={`${copy.image}: ${copy.resetImage}`} onClick={resetImageAdjustments}>{copy.resetImage}</button>
              </div>
              <div className={styles.imageControlList}>
                {BASIC_IMAGE_CONTROL_KEYS.map(renderImageControl)}
                <details className={styles.disclosure}>
                  <summary>{copy.moreImageAdjustments}</summary>
                  <div className={styles.imageControlList}>{ADVANCED_IMAGE_CONTROL_KEYS.map(renderImageControl)}</div>
                </details>
              </div>
            </section>
            <div
              className={`${styles.uploadZone} ${styles.uploadZoneCompact} ${uploadState === 'drag-over' ? styles.uploadZoneActive : ''}`}
              data-state={uploadState}
              onDragEnter={onFileDragEnter}
              onDragOver={onFileDragOver}
              onDragLeave={onFileDragLeave}
              onDrop={onDrop}
            >
              {isSampleArtwork ? (
                <>
                  <strong aria-live={uploadState === 'drag-over' ? 'polite' : undefined}>
                    {uploadState === 'drag-over' ? copy.dropToUpload : copy.uploadTitle}
                  </strong>
                  <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => {
                      if (uploadState === 'processing') return;
                      fileInput.current?.click();
                    }}
                    aria-disabled={uploadState === 'processing'}
                    aria-label={`${copy.chooseFile} · ${copy.uploadScreenshot}`}
                    aria-controls={SCREENSHOT_INPUT_ID}
                    aria-describedby={screenshotDescriptionIds}
                  >
                    {copy.chooseFile}
                  </button>
                </>
              ) : (
                <div className={styles.currentImage}>
                  <span className={styles.currentImageMark} aria-hidden="true">✓</span>
                  <span title={imageFileName ?? copy.uploadedScreenshot}>{imageFileName ?? copy.uploadedScreenshot}</span>
                  <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => {
                      if (uploadState === 'processing') return;
                      fileInput.current?.click();
                    }}
                    aria-disabled={uploadState === 'processing'}
                    aria-label={`${copy.replaceImage} · ${copy.uploadScreenshot}`}
                    aria-controls={SCREENSHOT_INPUT_ID}
                    aria-describedby={screenshotDescriptionIds}
                  >
                    {copy.replaceImage}
                  </button>
                </div>
              )}
              <span className={styles.fileTypes} id={SCREENSHOT_TYPES_ID}>{copy.fileTypes}</span>
              <span id={SCREENSHOT_STATUS_ID} className={styles.uploadStatus ?? ''} role="status" aria-live="polite" aria-atomic="true">
                {uploadState === 'processing' ? copy.uploading : uploadState === 'success' ? copy.uploadSuccess : ''}
              </span>
              <input
                id={SCREENSHOT_INPUT_ID}
                ref={fileInput}
                className={styles.visuallyHiddenInput}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={onFileChange}
                aria-label={copy.uploadTitle}
                aria-describedby={screenshotDescriptionIds}
                aria-invalid={uploadError ? true : undefined}
                aria-hidden="true"
                tabIndex={-1}
                disabled={uploadState === 'processing'}
              />
            </div>
            {uploadError && <p className={styles.errorMessage} id={SCREENSHOT_ERROR_ID} role="alert" aria-atomic="true">{getUploadErrorMessage(uploadError, locale)}</p>}
          </div>
        )}

        {activeTask === 'information' && (
          <div className={styles.formSection}>
            <CardTextEditorNavigation
              items={textEditorItems}
              category={activeTextCategory}
              selectedId={selectedTextItem?.id ?? selectedTextId}
              copy={copy}
              disabledCategories={supportsPerItemTextEditing ? [] : ['copy']}
              onCategoryChange={onSelectTextCategory}
              onSelectItem={onSelectTextItem}
            >
              {activeTextCategory !== 'copy' && renderSelectedProfileControl()}

              {!supportsPerItemTextEditing && (
                <p className={styles.globalTypographyNotice} role="note">{copy.textEditor.globalTypographyOnly}</p>
              )}

              {textCategory === 'information' && (hasUnrepresentedProfileFields || FFXIV_OFFICIAL_ASSETS_ENABLED) && (
                <details className={`${styles.disclosure} ${styles.editorGroup}`}>
                  <summary>{copy.additionalCharacterDetails}</summary>
                  <div className={styles.additionalInformation}>
                    {!isFieldRepresented('job') && <MemoJobPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />}
                    {!isFieldRepresented('level') && <CharacterInput field="level" value={character.level} copy={copy} onUpdate={updateText} onFocusField={onFocusField} allowEmptyLevel={character.profileOrigin === 'user'} />}
                    {(!isFieldRepresented('world') || !isFieldRepresented('dataCenter')) && <MemoWorldPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />}
                    {!isFieldRepresented('race') && !isFieldRepresented('clan') && <MemoRaceClanPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />}
                    {!isFieldRepresented('freeCompany') && <CharacterInput field="freeCompany" value={character.freeCompany} copy={copy} onUpdate={updateText} onFocusField={onFocusField} />}
                    {!isFieldRepresented('grandCompany') && <MemoGrandCompanyPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={clearHighlightedField} />}
                    {!isFieldRepresented('languages') && renderLanguageField()}
                    {!isFieldRepresented('playStyles') && renderPlayStyleField()}
                    <FFXIVAttribution
                      className={styles.privacyNote}
                      locale={locale}
                      officialAssetsUsed={FFXIV_OFFICIAL_ASSETS_ENABLED}
                      service={character.service === 'korea' ? 'KOREA' : 'GLOBAL'}
                    />
                  </div>
                </details>
              )}

              {supportsPerItemTextEditing && selectedTextItem?.supportsTextOverride && (
                <CardTextOverrideInput
                  key={selectedTextItem.id}
                  item={selectedTextItem}
                  copy={copy}
                  overriddenValue={textOverrides?.[selectedTextItem.id]}
                />
              )}
              {supportsPerItemTextEditing
                ? <TypographyRoleEditor locale={locale} item={selectedTextItem} />
                : null}
              <details className={`${styles.disclosure} ${styles.editorGroup}`}>
                <summary>{copy.textEditor.additionalSettings}</summary>
                <div className={styles.additionalInformation}>
                  <GlobalTypographyPresetPicker copy={copy} value={typographyPreset} />
                  {layoutVariant === 'a' && <DefaultCopySampleButton copy={copy} copyIds={defaultCopyIds} active={decorativeCopy === 'default' && !hasDefaultCopyOverrides} />}
                </div>
              </details>
            </CardTextEditorNavigation>
          </div>
        )}

        {activeTask === 'design' && (
          <div className={`${styles.formSection} ${styles.templatePanel}`}>
            <section className={`${styles.editorGroup} ${styles.masterTemplateGrid}`} aria-label={copy.template}>
              <div className={styles.sectionHeading}><h3>{copy.template}</h3></div>
              <div className={styles.templateChoices}>
                {CARD_TEMPLATES.map((template) => {
                  const selected = template === designTemplate;
                  const experimentalVariant = selected && layoutVariant !== 'a' ? layoutVariant : null;
                  return (
                    <div key={template} className={styles.templateChoice} data-selected={selected}>
                      <MasterTemplateProof template={template} locale={locale} />
                      <button type="button" className={styles.templateChoiceAction} aria-label={getTemplateChoiceActionLabel(copy, template, selected, layoutVariant, locale)} aria-pressed={selected} onClick={() => {
                        selectMasterTemplate(template);
                      }}>
                        <span className={styles.templateChoiceName}>{getTemplateLabel(copy, template)}</span>
                        {experimentalVariant && <span className={styles.templateVariantBadge}>{copy.variationNames[experimentalVariant]}</span>}
                        <span className={styles.selectedMark} aria-hidden="true">{selected ? '✓' : ''}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.editorGroup} aria-label={copy.ratio}>
              <div className={styles.sectionHeading}><h3>{copy.ratio}</h3></div>
              <RatioPicker
                label={copy.ratio}
                value={design.ratio}
                presentation="inline"
                onChange={(nextRatio) => editorStore.getState().updateDesign('ratio', nextRatio)}
              />
            </section>

          </div>
        )}

        {activeTask === 'design' && (
          <div className={styles.formSection}>
            <section className={styles.editorGroup} aria-label={copy.colors}>
              <div className={styles.sectionHeading}><h3>{copy.colors}</h3></div>
              <div className={styles.modeChoices} role="group" aria-label={copy.colors}>
                {(['auto', 'custom', 'job'] as const).map((mode) => (
                  <button type="button" key={mode} aria-pressed={colorMode === mode} onClick={() => editorStore.getState().updateDesign('colorMode', mode)}>{copy.colorModes[mode]}</button>
                ))}
              </div>
              {colorMode === 'auto' && (
                <div className={styles.autoPalette}>
                  <div className={styles.paletteSwatches}>
                    {COLOR_KEYS.map((key) => <span key={key} title={`${copy.colorNames[key]} ${palette[key]}`} style={{ backgroundColor: palette[key] }} />)}
                  </div>
                  <p>{copy.colorModes.auto} · {isSampleArtwork ? copy.sampleArtwork : imageFileName ?? copy.uploadedScreenshot}</p>
                </div>
              )}
              {colorMode === 'custom' && (
                <div className={styles.paletteControls}>
                  {COLOR_KEYS.map((key: ColorKey) => (
                    <label className={styles.colorControl} key={key}>
                      <span>{copy.colorNames[key]}</span>
                      <input
                        type="color"
                        value={palette[key]}
                        aria-label={copy.colorNames[key]}
                        onInput={(event) => updatePaletteColor(key, event.currentTarget.value)}
                        onChange={(event) => updatePaletteColor(key, event.currentTarget.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
              {colorMode === 'job' && (
                <div className={styles.jobThemePreview}>
                  <span className={styles.jobCrest} style={{ '--job-accent': activeJobTheme.accent, '--job-secondary': activeJobTheme.secondary } as CSSProperties} aria-hidden="true">✦</span>
                  <span><strong>{jobRecord?.localizedName[locale] ?? character.job}</strong><small>{copy.jobThemeHint}</small></span>
                  <div className={styles.jobSwatches} aria-label={copy.jobTheme}>
                    <i style={{ backgroundColor: activeJobTheme.accent }} /><i style={{ backgroundColor: activeJobTheme.secondary }} />
                  </div>
                </div>
              )}
            </section>

            <section className={styles.editorGroup} aria-label={copy.jobMotif}>
              <button
                type="button"
                className={styles.effectRow}
                role="switch"
                aria-checked={jobMotifVisible !== false}
                aria-labelledby={`${switchIdPrefix}-job-motif-label`}
                aria-describedby={`${switchIdPrefix}-job-motif-description`}
                onClick={() => editorStore.getState().updateDesign('jobMotifVisible', jobMotifVisible === false)}
              >
                <span className={styles.effectIcon} aria-hidden="true">✦</span>
                <span>
                  <strong id={`${switchIdPrefix}-job-motif-label`}>{copy.jobMotif}</strong>
                  <small id={`${switchIdPrefix}-job-motif-description`}>{copy.jobMotifHint}</small>
                </span>
                <i className={styles.switchTrack} aria-hidden="true"><b /></i>
              </button>
              <div className={styles.paletteControls}>
                <label className={styles.colorControl}>
                  <span>{copy.jobIconColor}</span>
                  <input
                    type="color"
                    value={jobIconColor ?? palette.accent}
                    aria-label={copy.jobIconColor}
                    onInput={(event) => editorStore.getState().updateDesign('jobIconColor', event.currentTarget.value)}
                    onChange={(event) => editorStore.getState().updateDesign('jobIconColor', event.currentTarget.value)}
                  />
                </label>
                <div className={styles.modeChoices} style={{ gridTemplateColumns: '1fr' }}>
                  <button
                    type="button"
                    aria-label={copy.useFamilyAccent}
                    disabled={!jobIconColor}
                    onClick={() => editorStore.getState().updateDesign('jobIconColor', null)}
                  >{copy.useFamilyAccent}</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTask === 'design' && (
          <div className={styles.formSection}>
            <details className={`${styles.editorGroup} ${styles.disclosure}`}>
              <summary className={styles.sectionHeading}><h3>{copy.sections.effects}</h3></summary>
              {(['grain', 'holographic'] as const).map((effect) => {
                const selected = design.effects.includes(effect);
                const labelId = `${switchIdPrefix}-${effect}-label`;
                const descriptionId = `${switchIdPrefix}-${effect}-description`;
                return (
                  <button
                    type="button"
                    className={styles.effectRow}
                    key={effect}
                    role="switch"
                    aria-checked={selected}
                    aria-labelledby={labelId}
                    aria-describedby={descriptionId}
                    onClick={() => editorStore.getState().updateDesign('effects', selected ? design.effects.filter((item) => item !== effect) : [...design.effects, effect])}
                  >
                    <span className={styles.effectIcon} aria-hidden="true">{effect === 'grain' ? '∴' : '✧'}</span>
                    <span>
                      <strong id={labelId}>{effect === 'grain' ? copy.grain : copy.holographic}</strong>
                      <small id={descriptionId}>{effect === 'grain' ? copy.grainDescription : copy.holographicDescription}</small>
                    </span>
                    <i className={styles.switchTrack} aria-hidden="true"><b /></i>
                  </button>
                );
              })}
              <TextureEffects
                locale={locale}
                effects={design.effects}
                effectIntensity={design.effectIntensity}
                onToggle={(effect: CardTextureEffect) => {
                  const currentEffects = editorStore.getState().design.effects;
                  editorStore.getState().updateDesign('effects', toggleCardTextureEffect(currentEffects, effect));
                }}
                onIntensityChange={(effect, intensity) => {
                  const current = editorStore.getState().design.effectIntensity ?? {};
                  editorStore.getState().setDesign({ effectIntensity: { ...current, [effect]: intensity } });
                }}
                onInteractionStart={(effect) => {
                  editorStore.getState().beginHistoryGroup(`texture-intensity-${effect}`, 'design');
                }}
                onInteractionEnd={(effect) => {
                  const groupId = `texture-intensity-${effect}`;
                  if (editorStore.getState().history.groupId === groupId) editorStore.getState().endHistoryGroup();
                }}
              />
            </details>
          </div>
        )}
        {!isHydrated && <span className={styles.hydrationHint} aria-live="polite">{copy.hydrating}</span>}
      </div>
    </aside>
  );
}

const MemoEditorInspector = memo(EditorInspector);

function EditorCanvas({
  copy,
  locale,
  focusedField,
  contentTextEditing,
  textCategory,
  selectedTextId,
  onSelectTextTarget,
  panMode,
  onTogglePan,
  onRequestScreenshot,
  onEscapeClose,
  showImageDragHint,
  onImageDragStart,
}: {
  copy: EditorCopy;
  locale: Locale;
  focusedField: string;
  contentTextEditing: boolean;
  textCategory: CardTextCategory;
  selectedTextId: string | null;
  onSelectTextTarget: (item: CardTextItem) => void;
  panMode: boolean;
  onTogglePan: () => void;
  onRequestScreenshot: () => void;
  onEscapeClose: () => void;
  showImageDragHint: boolean;
  onImageDragStart: () => void;
}) {
  profileRender('EditorCanvas');
  const character = useEditorStore((state) => state.character);
  const design = useEditorStore((state) => state.design);
  const image = useEditorStore((state) => state.image);
  const isSampleArtwork = isSampleArtworkSource(image.src, SAMPLE_ARTWORK_SOURCES);
  const focusedFieldLabel = getFocusedFieldLabel(copy, focusedField);
  const zoom = useEditorStore((state) => state.ui.zoom);
  const safeAreaVisible = useEditorStore((state) => state.ui.safeAreaVisible);
  const previewOpen = useEditorStore((state) => state.ui.previewOpen);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const resetTriggerContent = useMemo(() => <><EditorIcon name="reset" size={15} /><span>{copy.reset}</span></>, [copy.reset]);
  const resetCard = useCallback(() => {
    cancelPendingEditorUploads();
    editorStore.getState().reset();
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardFrameRef = useRef<HTMLDivElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const moreControlsRef = useRef<HTMLDetailsElement>(null);
  const moreControlsSummaryRef = useRef<HTMLElement>(null);
  const dragRef = useRef<
    | { kind: 'pan'; pointerId: number; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'image'; pointerId: number; startX: number; startY: number; originX: number; originY: number; width: number; height: number }
    | null
  >(null);
  const fallbackPointerCleanupRef = useRef<(() => void) | null>(null);
  const pendingPointerEventRef = useRef<Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'> | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const spaceHeld = useRef(false);
  profileRender('CanvasControls.subtree');
  const wheelGroupActive = useRef(false);
  const wheelGroupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardData = useMemo<AdventurerCardData>(() => ({
    character,
    design: {
      ...design,
      accentColor: design.palette.accent,
      imagePosition: `${image.x}% ${image.y}%`,
      imageScale: image.scale,
    },
    imageUrl: image.src,
    imageAdjustments: {
      x: image.x,
      y: image.y,
      scale: image.scale,
      rotation: image.rotation,
      brightness: image.brightness,
      contrast: image.contrast,
      saturation: image.saturation,
      exposure: image.exposure,
    },
  }), [character, design, image]);
  const cardTextItems = useMemo(() => getCardTextItems(cardData, locale), [cardData, locale]);
  const summaryJob = getJob(character.jobId)?.localizedName[locale] ?? character.job;
  const [width, height] = ratioNumber(design.ratio);
  const frameStyle: RatioStyle = {
    aspectRatio: `${width} / ${height}`,
    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoom})`,
  };

  const adjustZoom = useCallback((delta: number) => {
    const current = editorStore.getState().ui.zoom;
    editorStore.getState().setUi({ zoom: Math.round(Math.min(1.5, Math.max(0.55, current + delta)) * 100) / 100 });
  }, []);

  const fitCanvas = useCallback(() => {
    editorStore.getState().setUi({ zoom: 1 });
    setPanOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (isEditorShortcutSuppressed(target)) return;
      const isTyping = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target?.tagName ?? '') || target?.getAttribute('role') === 'combobox';
      if (event.code === 'Space' && !isTyping && !target?.closest('summary')) {
        event.preventDefault();
        spaceHeld.current = true;
      }

      const action = resolveEditorKeyboardAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        target,
      });
      if (!action) return;
      const state = editorStore.getState();
      if (action === 'close') {
        if (state.ui.previewOpen) {
          state.setUi({ previewOpen: false });
          requestAnimationFrame(() => previewButtonRef.current?.focus());
        }
        else if (state.ui.inspectorOpen) onEscapeClose();
        else return;
      } else if (action === 'undo' || action === 'redo') {
        state[action]();
      } else if (action === 'zoom-in') {
        adjustZoom(0.1);
      } else if (action === 'zoom-out') {
        adjustZoom(-0.1);
      } else {
        fitCanvas();
      }
      event.preventDefault();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') spaceHeld.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (wheelGroupTimeout.current) clearTimeout(wheelGroupTimeout.current);
    };
  }, [adjustZoom, fitCanvas, onEscapeClose]);

  const flushPointerMove = useCallback((pointerId?: number, updatePan = true) => {
    const event = pendingPointerEventRef.current;
    if (!event || (pointerId !== undefined && event.pointerId !== pointerId)) return;
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    pointerFrameRef.current = null;
    pendingPointerEventRef.current = null;

    const drag = dragRef.current;
    if (!drag || !isCanvasDragPointer(drag.pointerId, event.pointerId)) return;
    if (drag.kind === 'pan') {
      if (updatePan) setPanOffset({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY });
      return;
    }

    const x = drag.originX - ((event.clientX - drag.startX) / drag.width) * 100;
    const y = drag.originY - ((event.clientY - drag.startY) / drag.height) * 100;
    editorStore.getState().setImage({ x, y }, { groupId: 'canvas-image-drag' });
  }, []);

  const movePointer = useCallback((event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>) => {
    const drag = dragRef.current;
    if (!drag || !isCanvasDragPointer(drag.pointerId, event.pointerId)) return;
    pendingPointerEventRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      flushPointerMove();
    });
  }, [flushPointerMove]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => movePointer(event), [movePointer]);

  const finishPointerDrag = useCallback((pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || !isCanvasDragPointer(drag.pointerId, pointerId)) return;
    flushPointerMove(pointerId);
    if (drag.kind === 'image') editorStore.getState().endImageAdjustmentGroup();
    dragRef.current = null;
    setIsDragging(false);
    tryReleasePointerCapture(stageRef.current, pointerId);
    fallbackPointerCleanupRef.current?.();
    fallbackPointerCleanupRef.current = null;
  }, [flushPointerMove]);

  const onPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    movePointer(event);
    finishPointerDrag(event.pointerId);
  }, [finishPointerDrag, movePointer]);

  const attachPointerFallback = useCallback((pointerId: number) => {
    fallbackPointerCleanupRef.current?.();
    const onFallbackMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (event.target instanceof Node && stageRef.current?.contains(event.target)) return;
      movePointer(event);
    };
    const onFallbackEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      movePointer(event);
      finishPointerDrag(pointerId);
    };
    window.addEventListener('pointermove', onFallbackMove);
    window.addEventListener('pointerup', onFallbackEnd);
    window.addEventListener('pointercancel', onFallbackEnd);
    fallbackPointerCleanupRef.current = () => {
      window.removeEventListener('pointermove', onFallbackMove);
      window.removeEventListener('pointerup', onFallbackEnd);
      window.removeEventListener('pointercancel', onFallbackEnd);
    };
  }, [finishPointerDrag, movePointer]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canBeginCanvasDrag(dragRef.current?.pointerId ?? null)) return;
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest('button, input, select, a, [role="button"]')) return;
    const stage = stageRef.current;
    if (!stage) return;
    const panRequested = panMode || spaceHeld.current || event.button === 1;
    const insideCard = Boolean((event.target as HTMLElement).closest('[data-card-surface]'));
    if (panRequested) {
      event.preventDefault();
      const captured = trySetPointerCapture(stage, event.pointerId);
      dragRef.current = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: panOffset.x, originY: panOffset.y };
      if (!captured) attachPointerFallback(event.pointerId);
      setIsDragging(true);
    } else if (insideCard) {
      event.preventDefault();
      const captured = trySetPointerCapture(stage, event.pointerId);
      editorStore.getState().beginImageAdjustmentGroup('canvas-image-drag');
      onImageDragStart();
      const cardBounds = cardFrameRef.current?.getBoundingClientRect();
      dragRef.current = { kind: 'image', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: image.x, originY: image.y, width: Math.max(1, cardBounds?.width ?? 1), height: Math.max(1, cardBounds?.height ?? 1) };
      if (!captured) attachPointerFallback(event.pointerId);
      setIsDragging(true);
    }
  }, [attachPointerFallback, image.x, image.y, onImageDragStart, panMode, panOffset.x, panOffset.y]);

  useEffect(() => () => {
    const drag = dragRef.current;
    flushPointerMove(undefined, false);
    if (drag?.kind === 'image') editorStore.getState().endImageAdjustmentGroup();
    dragRef.current = null;
    fallbackPointerCleanupRef.current?.();
    fallbackPointerCleanupRef.current = null;
  }, [flushPointerMove]);

  const onWheel = useCallback((event: WheelEvent) => {
    if (isBrowserZoomWheelGesture(event)) return;
    const onImage = event.target instanceof Element && Boolean(event.target.closest('[data-card-surface]'));
    const state = editorStore.getState();
    event.preventDefault();
    if (onImage) {
      if (!wheelGroupActive.current) {
        state.beginImageAdjustmentGroup('wheel-image-scale');
        wheelGroupActive.current = true;
      }
      const scale = Math.min(2.5, Math.max(0.75, state.image.scale + (event.deltaY < 0 ? 0.04 : -0.04)));
      state.setImage({ scale }, { groupId: 'wheel-image-scale' });
      if (wheelGroupTimeout.current) clearTimeout(wheelGroupTimeout.current);
      wheelGroupTimeout.current = setTimeout(() => {
        editorStore.getState().endImageAdjustmentGroup();
        wheelGroupActive.current = false;
        wheelGroupTimeout.current = null;
      }, 260);
      return;
    }
    state.setUi({ zoom: Math.min(1.5, Math.max(0.55, state.ui.zoom + (event.deltaY < 0 ? 0.05 : -0.05))) });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <section
      className={`${styles.canvasColumn} ${previewOpen ? styles.canvasPreviewMode : ''}`}
      data-has-heading={isSampleArtwork ? 'true' : 'false'}
      aria-label={`${copy.canvasLabel}: ${copy.cardPreviewSummary(character.name, summaryJob, localizeCardWorld(character, locale))}`}
    >
      <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {focusedFieldLabel ? formatFocusedFieldHint(locale, focusedFieldLabel) : ''}
      </span>
      {isSampleArtwork && (
        <div className={styles.canvasHeading}>
          <div className={styles.canvasHeadingActions}>
            <span className={styles.stageSampleBadge}>{copy.sampleBadge}</span>
            <button type="button" className={styles.stageUpload} onClick={onRequestScreenshot} aria-label={copy.uploadScreenshot}>
              <EditorIcon name="upload" size={15} /><span>{copy.uploadScreenshot}</span>
            </button>
          </div>
        </div>
      )}
      <div
        ref={stageRef}
        id="editor-canvas-stage"
        className={`${styles.canvasStage} ${panMode ? styles.panCursor : ''} ${isDragging ? styles.dragging : ''}`}
        data-ratio={design.ratio}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
      >
        <div className={styles.stageGrid} aria-hidden="true" />
        <div className={styles.stageGlow} aria-hidden="true" />
        <div ref={cardFrameRef} className={styles.cardFrame} style={frameStyle} data-card-surface aria-hidden="true">
          <MemoCardPreview data={cardData} className={styles.canvasCard} />
          {safeAreaVisible && <div className={styles.safeAreaGuide} aria-hidden="true" />}
        </div>
        {showImageDragHint && <span className={styles.stageDragHint} role="status" aria-live="polite">{copy.dragToReposition}</span>}
        <span className={styles.stageLabel}>{design.ratio} · {Math.round(zoom * 100)}%</span>
        <span className={styles.stageTip} aria-hidden="true">{copy.panHint}</span>
        {isSampleArtwork && (
          <span className={`${styles.stageSampleBadge} ${styles.mobileStageSampleBadge}`}>{copy.sampleBadge}</span>
        )}
      </div>

      <CardTextOverlay
        enabled={contentTextEditing && !previewOpen && design.layoutVariant === 'a'}
        items={cardTextItems}
        activeCategory={textCategory}
        selectedId={selectedTextId}
        measurementKey={`${design.ratio}:${zoom}:${panOffset.x}:${panOffset.y}`}
        targetLabel={copy.textEditor.targetLabel}
        onSelect={onSelectTextTarget}
      />

      <div className={styles.bottomTools} role="toolbar" aria-label={copy.title}>
        <div className={styles.toolbarPrimary}>
          <div className={styles.historyTools}>
            <HistoryButton action="undo" copy={copy} />
            <HistoryButton action="redo" copy={copy} />
          </div>
          <ToolbarTooltipButton type="button" className={styles.fitButton} onClick={fitCanvas} aria-label={copy.fitCanvas} aria-keyshortcuts="0" tooltip={`${copy.fitCanvas} · 0`}><EditorIcon name="fit" size={15} /><span>{copy.fitCanvas}</span></ToolbarTooltipButton>
          <button
            ref={previewButtonRef}
            type="button"
            className={styles.previewButton}
            aria-controls="editor-canvas-stage"
            aria-label={copy.preview}
            aria-pressed={previewOpen}
            onClick={(event) => {
              if (!previewOpen && event.detail === 0) event.currentTarget.focus();
              editorStore.getState().setUi({ previewOpen: !previewOpen });
            }}
          >
            <EditorIcon name="preview" size={15} /><span>{previewOpen ? copy.backToEditor : copy.preview}</span>
          </button>
        </div>
        <details
          ref={moreControlsRef}
          className={styles.toolbarMore}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || isImeComposing(event.nativeEvent) || !moreControlsRef.current?.open) return;
            if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
            event.preventDefault();
            event.stopPropagation();
            moreControlsRef.current.open = false;
            moreControlsSummaryRef.current?.focus();
          }}
        >
          <summary ref={moreControlsSummaryRef} aria-label={moreCanvasControlsLabel(locale)}>
            <span className={styles.moreToolsLabel} aria-hidden="true">{moreCanvasControlsLabel(locale)}</span>
            <span className={styles.moreToolsCompactLabel} aria-hidden="true">{compactMoreCanvasControlsLabel(locale)}</span>
          </summary>
          <div className={styles.toolbarMorePanel}>
            <div className={styles.zoomTools}>
              <ToolbarTooltipButton type="button" onClick={() => adjustZoom(-0.1)} aria-label={`${copy.canvasLabel}: ${copy.zoomOut}`} aria-keyshortcuts="-" tooltip={`${copy.canvasLabel}: ${copy.zoomOut} · -`}><EditorIcon name="zoom-out" size={15} /></ToolbarTooltipButton>
              <input type="range" min="0.55" max="1.5" step="0.05" value={zoom} onChange={(event) => editorStore.getState().setUi({ zoom: Number(event.currentTarget.value) })} aria-label={`${copy.canvasLabel}: ${copy.zoom}`} aria-valuetext={formatAccessiblePercent(locale, zoom * 100)} />
              <ToolbarTooltipButton type="button" onClick={() => adjustZoom(0.1)} aria-label={`${copy.canvasLabel}: ${copy.zoomIn}`} aria-keyshortcuts="+" tooltip={`${copy.canvasLabel}: ${copy.zoomIn} · +`}><EditorIcon name="zoom-in" size={15} /></ToolbarTooltipButton>
              <output aria-live="off" aria-hidden="true">{Math.round(zoom * 100)}%</output>
            </div>
            <div className={styles.toolbarMoreActions}>
              <div className={styles.libraryAction}><ProjectLibraryDialogTrigger /></div>
              <ToolbarTooltipButton type="button" className={`${styles.panToggle} ${panMode ? styles.panToggleActive : ''}`} aria-pressed={panMode} onClick={onTogglePan} aria-label={copy.panMode} tooltip={copy.panHint}><EditorIcon name="pan" size={16} /><span>{copy.panMode}</span></ToolbarTooltipButton>
              <button
                type="button"
                className={styles.safeAreaToggle}
                aria-pressed={safeAreaVisible}
                onClick={() => editorStore.getState().setUi({ safeAreaVisible: !safeAreaVisible })}
              >
                <EditorIcon name="safe-area" size={16} /><span>{copy.safeArea}</span>
              </button>
              <InlineConfirm
                triggerLabel={copy.reset}
                triggerClassName={styles.resetButton}
                triggerContent={resetTriggerContent}
                prompt={copy.resetCardPrompt}
                cancelLabel={copy.cancel}
                confirmLabel={copy.confirmReset}
                onConfirm={resetCard}
              />
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

const MemoEditorCanvas = memo(EditorCanvas);

function HistoryButton({ action, copy }: { action: 'undo' | 'redo'; copy: EditorCopy }) {
  const disabled = useEditorStore((state) => action === 'undo' ? state.history.past.length === 0 : state.history.future.length === 0);
  const label = action === 'undo' ? copy.undo : copy.redo;
  const shortcut = action === 'undo' ? 'Ctrl/Cmd+Z' : 'Ctrl/Cmd+Shift+Z';
  const keyshortcuts = action === 'undo' ? 'Control+Z Meta+Z' : 'Control+Shift+Z Meta+Shift+Z';
  return <ToolbarTooltipButton type="button" onClick={() => editorStore.getState()[action]()} disabled={disabled} aria-label={label} aria-keyshortcuts={keyshortcuts} tooltip={`${label} · ${shortcut}`}><EditorIcon name={action} size={16} /></ToolbarTooltipButton>;
}

export function EditorWorkspace() {
  profileRender('EditorWorkspace');
  profileRender('ToolRail.subtree');
  const router = useRouter();
  const { locale } = useI18n();
  const copy = useMemo(() => getEditorCopy(locale), [locale]);
  const activePanel = useEditorStore((state) => state.ui.activePanel);
  const activeTask = TASK_FOR_PANEL[activePanel];
  const inspectorOpen = useEditorStore((state) => state.ui.inspectorOpen);
  const previewOpen = useEditorStore((state) => state.ui.previewOpen);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const imageSource = useEditorStore((state) => state.image.src);
  const [focusedField, setFocusedField] = useState('');
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textCategory, setTextCategory] = useState<CardTextCategory>('identity');
  const [pendingTextFocusId, setPendingTextFocusId] = useState<string | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [imageDragHintPhase, setImageDragHintPhase] = useState<ImageDragHintPhase>('idle');
  const imageDragHintPhaseRef = useRef<ImageDragHintPhase>('idle');
  const imageDragHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [inputCompactMode, setInputCompactMode] = useState(false);
  const [mobileFocusTask, setMobileFocusTask] = useState<EditorTaskId | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pendingMobileFocusTask = useRef<EditorTaskId | null>(null);

  const dispatchImageDragHint = useCallback((event: ImageDragHintEvent) => {
    const currentPhase = imageDragHintPhaseRef.current;
    const nextPhase = transitionImageDragHint(currentPhase, event);
    if (nextPhase === currentPhase) return;
    imageDragHintPhaseRef.current = nextPhase;
    setImageDragHintPhase(nextPhase);

    if (nextPhase === 'visible') {
      if (imageDragHintTimeout.current) clearTimeout(imageDragHintTimeout.current);
      imageDragHintTimeout.current = setTimeout(() => {
        imageDragHintTimeout.current = null;
        const beforeTimeout = imageDragHintPhaseRef.current;
        const afterTimeout = transitionImageDragHint(beforeTimeout, 'timeout');
        if (afterTimeout === beforeTimeout) return;
        imageDragHintPhaseRef.current = afterTimeout;
        setImageDragHintPhase(afterTimeout);
      }, IMAGE_DRAG_HINT_DURATION_MS);
    } else if (nextPhase === 'finished') {
      if (imageDragHintTimeout.current) clearTimeout(imageDragHintTimeout.current);
      imageDragHintTimeout.current = null;
    }
  }, []);

  const onSuccessfulUpload = useCallback(() => {
    dispatchImageDragHint('successful-upload');
    dispatchImageDragHint('canvas-available');
  }, [dispatchImageDragHint]);

  const dismissImageDragHint = useCallback(() => {
    dispatchImageDragHint('image-drag');
  }, [dispatchImageDragHint]);

  useEffect(() => {
    if (imageDragHintPhase !== 'pending') return;
    if (isSampleArtworkSource(imageSource, SAMPLE_ARTWORK_SOURCES)) {
      dispatchImageDragHint('sample-reset');
      return;
    }
    dispatchImageDragHint('canvas-available');
  }, [dispatchImageDragHint, imageDragHintPhase, imageSource]);

  const closeInspector = useCallback(() => {
    const state = editorStore.getState();
    state.setUi({ inspectorOpen: false });
    const task = TASK_FOR_PANEL[state.ui.activePanel];
    setMobileFocusTask(task);
    if (isMobileViewport) {
      setKeyboardOpen(false);
      setInputCompactMode(false);
    }
    const inspector = document.getElementById('editor-inspector');
    if (document.activeElement instanceof HTMLElement && inspector?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (isMobileViewport) pendingMobileFocusTask.current = task;
    else requestAnimationFrame(() => document.getElementById(`editor-task-tab-desktop-${task}`)?.focus());
  }, [isMobileViewport]);

  const selectTextItemFromList = useCallback((item: CardTextItem) => {
    setSelectedTextId(item.id);
    setTextCategory(getEditorTextCategory(item));
  }, []);

  const openTask = useCallback((task: EditorTaskId) => {
    setMobileFocusTask(task);
    editorStore.getState().setUi({ activePanel: TASK_PANEL[task], inspectorOpen: true });
  }, []);

  const selectTextTarget = useCallback((item: CardTextItem) => {
    selectTextItemFromList(item);
    setPendingTextFocusId(item.id);
    openTask('information');
  }, [openTask, selectTextItemFromList]);

  useLayoutEffect(() => {
    if (!pendingTextFocusId || activeTask !== 'information' || !inspectorOpen) return;
    const focusTargetId = pendingTextFocusId;
    const focusFrames: number[] = [];
    let focusAttempts = 0;
    let cancelled = false;
    const maximumFocusAttempts = 3;

    const focusWithin = (container: HTMLElement | undefined) => {
      if (!container) return false;
      const focusable = container.matches('input, textarea, select, button')
        ? container
        : Array.from(container.querySelectorAll<HTMLElement>('input, textarea, select, button'))
          .find((element) => element.getClientRects().length > 0 && !('disabled' in element && element.disabled));
      if (!focusable) return false;
      focusable.focus({ preventScroll: true });
      return document.activeElement === focusable;
    };

    const scheduleFocusAttempt = () => {
      focusFrames.push(requestAnimationFrame(attemptFocus));
    };

    function attemptFocus() {
      if (cancelled) return;
      focusAttempts += 1;
      const inspector = document.getElementById('editor-inspector');
      const candidates = inspector
        ? Array.from(inspector.querySelectorAll<HTMLElement>('[data-card-text-editor-control]'))
        : [];
      const control = selectTextEditorControl(candidates, focusTargetId);
      if (control) {
        let details = control.closest('details');
        let openedDetails = false;
        while (details) {
          if (!details.open) {
            details.open = true;
            openedDetails = true;
          }
          details = details.parentElement?.closest('details') ?? null;
        }
        if (openedDetails && focusAttempts < maximumFocusAttempts) {
          scheduleFocusAttempt();
          return;
        }
        if (focusWithin(control)) {
          setPendingTextFocusId(null);
          return;
        }
      }

      if (focusAttempts < maximumFocusAttempts) {
        scheduleFocusAttempt();
        return;
      }

      const styleControl = inspector
        ? Array.from(inspector.querySelectorAll<HTMLElement>('[data-text-font-family]'))
          .find((candidate) => candidate.getAttribute('data-text-font-family') === focusTargetId)
        : undefined;
      if (styleControl) focusWithin(styleControl);
      setPendingTextFocusId(null);
    }

    scheduleFocusAttempt();

    return () => {
      cancelled = true;
      for (const frame of focusFrames) cancelAnimationFrame(frame);
    };
  }, [activeTask, inspectorOpen, pendingTextFocusId]);

  const requestScreenshotUpload = useCallback(() => {
    openTask('photo');
  }, [openTask]);

  const togglePan = useCallback(() => setPanMode((value) => !value), []);

  useEffect(() => {
    const state = editorStore.getState();
    state.hydrate();
    const hydrated = editorStore.getState();
    const entryPanel = getEditorEntryPanel(hydrated.character, hydrated.ui.activePanel);
    if (entryPanel !== hydrated.ui.activePanel) hydrated.setUi({ activePanel: entryPanel });
    const mobileViewport = window.matchMedia('(max-width: 900px)');
    const applyViewport = (matches: boolean) => {
      setIsMobileViewport(matches);
      editorStore.getState().setUi({ inspectorOpen: !matches });
    };
    applyViewport(mobileViewport.matches);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      applyViewport(event.matches);
    };
    mobileViewport.addEventListener('change', handleViewportChange);
    const persist = () => editorStore.getState().persistNow();
    const onVisibility = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (imageDragHintTimeout.current) clearTimeout(imageDragHintTimeout.current);
      imageDragHintTimeout.current = null;
      mobileViewport.removeEventListener('change', handleViewportChange);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
      persist();
    };
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    if (!isMobileViewport) {
      page.style.removeProperty('--editor-viewport-bottom');
      page.style.removeProperty('--editor-mobile-sheet-height');
      page.style.removeProperty('--editor-mobile-dock-height');
      return;
    }

    const viewport = window.visualViewport;
    let viewportStateFrame = 0;
    const syncViewport = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportBottom = (viewport?.offsetTop ?? 0) + viewportHeight;
      const viewportReducedForKeyboard = Boolean(viewport && window.innerHeight - viewportHeight > 140);
      const compactHeight = viewportReducedForKeyboard || viewportHeight < 600;
      const workspace = page.querySelector<HTMLElement>(`.${styles.workspace}`);
      const inspector = page.querySelector<HTMLElement>(`.${styles.inspector}`);
      const focusedElement = document.activeElement;
      const focusedEditorField = Boolean(
        inspector
          && focusedElement instanceof HTMLElement
          && inspector.contains(focusedElement)
          && focusedElement.matches('input, textarea, select'),
      );
      const hasKeyboard = viewportReducedForKeyboard && focusedEditorField;
      const useInputCompactMode = hasKeyboard || (viewportHeight < 600 && focusedEditorField);
      const workspaceStyle = workspace ? window.getComputedStyle(workspace) : null;
      const verticalPadding = workspaceStyle
        ? (Number.parseFloat(workspaceStyle.paddingTop) || 0) + (Number.parseFloat(workspaceStyle.paddingBottom) || 0)
        : 16;
      const appHeaderHeight = Number.parseFloat(window.getComputedStyle(page).getPropertyValue('--app-header-height')) || 56;
      const workspaceOffset = workspace
        ? workspace.getBoundingClientRect().top - page.getBoundingClientRect().top
        : 0;
      const visibleWorkspaceHeight = Math.max(0, viewportBottom - appHeaderHeight - workspaceOffset);
      const workspaceContentHeight = Math.max(0, visibleWorkspaceHeight - verticalPadding);
      const dockHeight = useInputCompactMode ? 0 : 60;
      const toolbarHeight = compactHeight ? 0 : 48;
      const minimumStageHeight = useInputCompactMode ? 0 : compactHeight ? 48 : 150;
      const sheetGap = 8;
      const maxSheetHeight = Math.max(76, workspaceContentHeight - dockHeight - toolbarHeight - minimumStageHeight - sheetGap - 6);
      const preferredSheetHeight = Math.round(viewportHeight * (useInputCompactMode ? 0.54 : compactHeight ? 0.46 : 0.48));
      const sheetHeight = Math.min(preferredSheetHeight, maxSheetHeight);

      page.style.setProperty('--editor-viewport-bottom', `${Math.round(viewportBottom)}px`);
      page.style.setProperty('--editor-mobile-sheet-height', `${sheetHeight}px`);
      page.style.setProperty('--editor-mobile-dock-height', `${dockHeight}px`);
      // Keep the sheet inside the visual viewport and reserve card space outside compact input mode.
      if (viewportStateFrame) cancelAnimationFrame(viewportStateFrame);
      viewportStateFrame = requestAnimationFrame(() => {
        viewportStateFrame = 0;
        setKeyboardOpen(hasKeyboard);
        setCompactViewport(compactHeight);
        setInputCompactMode(useInputCompactMode);
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    page.addEventListener('focusin', syncViewport);
    page.addEventListener('focusout', syncViewport);
    return () => {
      if (viewportStateFrame) cancelAnimationFrame(viewportStateFrame);
      window.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      page.removeEventListener('focusin', syncViewport);
      page.removeEventListener('focusout', syncViewport);
    };
  }, [activeTask, isMobileViewport]);

  useEffect(() => {
    const task = pendingMobileFocusTask.current;
    if (!task || inspectorOpen || inputCompactMode) return;
    pendingMobileFocusTask.current = null;
    requestAnimationFrame(() => document.getElementById(`editor-task-tab-mobile-${task}`)?.focus());
  }, [inputCompactMode, inspectorOpen]);

  const exportCard = useCallback(() => {
    editorStore.getState().persistNow();
    router.push('/export');
  }, [router]);

  function handleTaskTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, task: EditorTaskId, nav: 'desktop' | 'mobile') {
    let nextIndex = -1;
    const currentIndex = TASK_IDS.indexOf(task);
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TASK_IDS.length - 1;
    else if (nav === 'mobile' && event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TASK_IDS.length;
    else if (nav === 'mobile' && event.key === 'ArrowLeft') nextIndex = (currentIndex + TASK_IDS.length - 1) % TASK_IDS.length;
    else if (nav === 'desktop' && event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % TASK_IDS.length;
    else if (nav === 'desktop' && event.key === 'ArrowUp') nextIndex = (currentIndex + TASK_IDS.length - 1) % TASK_IDS.length;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTask = TASK_IDS[nextIndex];
    if (nav === 'mobile') {
      setMobileFocusTask(nextTask);
      requestAnimationFrame(() => document.getElementById(`editor-task-tab-mobile-${nextTask}`)?.focus());
      return;
    }
    openTask(nextTask);
    requestAnimationFrame(() => document.getElementById(`editor-task-tab-${nav}-${nextTask}`)?.focus());
  }

  function activateTaskTab(task: EditorTaskId, nav: 'desktop' | 'mobile') {
    if (nav === 'mobile') {
      setMobileFocusTask(task);
      const state = editorStore.getState();
      const activation = getEditorTaskActivation(task, state.ui.activePanel, state.ui.inspectorOpen, true);
      if (!activation.inspectorOpen) {
        closeInspector();
        return;
      }
      state.setUi(activation);
      return;
    }
    openTask(task);
  }

  function renderTaskTabs(nav: 'desktop' | 'mobile') {
    const isMobileDock = nav === 'mobile';
    return (
      <nav
        className={isMobileDock ? styles.mobileTaskTabs : styles.toolNav}
        role={isMobileDock ? 'toolbar' : 'tablist'}
        aria-label={copy.workspaceLabel}
        aria-orientation={isMobileDock ? 'horizontal' : 'vertical'}
        data-active-task={activeTask}
        data-inspector-open={inspectorOpen}
      >
        {TASK_IDS.map((task, index) => {
          const isSelected = activeTask === task && (!isMobileDock || inspectorOpen);
          return (
            <button
              type="button"
              key={task}
              id={`editor-task-tab-${nav}-${task}`}
              role={isMobileDock ? undefined : 'tab'}
              className={`${styles.toolButton} ${isSelected ? styles.toolButtonActive : ''}`}
              aria-controls="editor-inspector"
              aria-selected={isMobileDock ? undefined : isSelected}
              aria-expanded={isMobileDock ? isSelected : undefined}
              aria-label={copy.tasks[task]}
              tabIndex={isMobileDock
                ? ((mobileFocusTask ?? activeTask) === task ? 0 : -1)
                : (activeTask === task ? 0 : -1)}
              onKeyDown={(event) => handleTaskTabKeyDown(event, task, nav)}
              onClick={() => activateTaskTab(task, nav)}
            >
              <span className={styles.toolButtonIcon} aria-hidden="true"><EditorIcon name={TASK_ICONS[task]} /></span>
              <span className={styles.toolButtonLabel}>{copy.tasks[task]}</span>
              <small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div
      ref={pageRef}
      className={`${styles.page} ${previewOpen ? styles.previewMode : ''} ${!inspectorOpen && !previewOpen ? styles.inspectorClosed : ''}`}
      data-active-task={activeTask}
      data-keyboard-open={keyboardOpen ? 'true' : 'false'}
      data-compact-viewport={compactViewport ? 'true' : 'false'}
      data-input-compact-mode={inputCompactMode ? 'true' : 'false'}
    >
      <h1 className={styles.srOnly}>{copy.title}</h1>

      {saveStatus === 'error' && (
        <div className={styles.saveErrorNotice} role="alert">
          <p>{copy.saveErrorRecovery}</p>
          <button type="button" className={styles.saveErrorExportButton} onClick={exportCard}>
            {copy.saveErrorExportAction}<EditorIcon name="export" size={14} />
          </button>
        </div>
      )}

      <div className={styles.workspace}>
        {!previewOpen && (
          <aside className={styles.leftSidebar} aria-label={copy.title}>
            <div className={styles.sidebarHeader}><span>{copy.workspaceLabel}</span><small>XIV / ATELIER</small></div>
            {renderTaskTabs('desktop')}
          </aside>
        )}

        <Profiler id="EditorCanvas" onRender={profileCommit}><MemoEditorCanvas
          copy={copy}
          locale={locale}
          focusedField={focusedField}
          contentTextEditing={activeTask === 'information'}
          textCategory={textCategory}
          selectedTextId={selectedTextId}
          onSelectTextTarget={selectTextTarget}
          panMode={panMode}
          onTogglePan={togglePan}
          onRequestScreenshot={requestScreenshotUpload}
          onEscapeClose={closeInspector}
          showImageDragHint={imageDragHintPhase === 'visible'}
          onImageDragStart={dismissImageDragHint}
        /></Profiler>

        {!previewOpen && renderTaskTabs('mobile')}

        {!previewOpen && (
          <EditorBoundary resetKey={`${activeTask}-${locale}`}><MemoEditorInspector
            copy={copy}
            locale={locale}
            activeTask={activeTask}
            isMobileViewport={isMobileViewport}
            isOpen={inspectorOpen}
            selectedTextId={selectedTextId}
            textCategory={textCategory}
            onSelectTextCategory={setTextCategory}
            onSelectTextItem={selectTextItemFromList}
            onFocusField={setFocusedField}
            onClose={closeInspector}
            onSuccessfulUpload={onSuccessfulUpload}
          /></EditorBoundary>
        )}
      </div>
    </div>
  );
}

