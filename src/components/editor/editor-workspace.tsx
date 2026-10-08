'use client';

import { useRouter } from 'next/navigation';
import {
  memo,
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '@/lib/i18n';
import { MASTER_CARD_CONFIG, MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { getJobTheme } from '@/lib/job-themes';
import { getJob, LANGUAGES, PLAY_STYLES } from '@/data/ffxiv';
import { prepareImageFile, ImageProcessingError, isImageProcessingCancelled } from '@/lib/image-processing';
import { EditorBoundary } from './editor-boundary';
import { getUploadErrorMessage } from './editor-errors';
import { committedLevel, isImeComposing, validLevelInput } from './editor-input';
import { cancelPendingEditorUploads, registerUploadCancellation } from './upload-session';
import { PERFORMANCE_PROFILING_ENABLED, profileCommit, profileRender, profileTiming } from '@/lib/performance-profile';
import { detectTypographyScript, getTypographyFontFamily, TYPOGRAPHY_SPECIMENS, type TypographyPresetId, type TypographyScript } from '@/lib/typography-presets';
import { loadTypographyFonts } from '@/data/fonts/load-fonts';
import { CardPreview } from '@/components/editor/card-preview';
import { getEditorCopy, type EditorCopy } from '@/components/editor/copy';
import { formatAccessibleImageControlValue, formatAccessiblePercent } from '@/components/editor/editor-accessibility';
import { EditorIcon, type EditorIconName } from '@/components/editor/editor-icon';
import { ToolbarTooltipButton } from '@/components/editor/toolbar-tooltip-button';
import { InlineConfirm } from '@/components/editor/inline-confirm';
import { resolveEditorKeyboardAction } from '@/components/editor/editor-keyboard';
import { FFXIVAttribution } from '@/components/ffxiv/ffxiv-attribution';
import { GrandCompanyPicker, JobPicker, RaceClanPicker, WorldPicker } from '@/components/editor/ffxiv-pickers';
import { demoAdventurerCards, demoAdventurerData, type AdventurerCardData, type AdventurerCardTemplate, type CardRatio } from '@/components/cards/types';
import { RatioPicker } from '@/components/editor/ratio-picker';
import {
  isSampleArtworkSource,
  transitionImageDragHint,
  type ImageDragHintEvent,
  type ImageDragHintPhase,
} from '@/components/editor/editor-ux';
import {
  hasFileTransfer,
  INSPECTOR_CLOSE_FALLBACK_MS,
  canBeginCanvasDrag,
  isBrowserZoomWheelGesture,
  isCanvasDragPointer,
  isEditorShortcutSuppressed,
  shouldRetainInspectorForExit,
  tryReleasePointerCapture,
  trySetPointerCapture,
  transitionUploadInteractionState,
  updateFileDragDepth,
  type UploadInteractionState,
} from '@/components/editor/editor-interaction';
import type { Locale } from '@/lib/types';
import { editorStore, useEditorStore, type EditorImageState, type EditorPanelId } from '@/store/editor-store';
import { FFXIV_OFFICIAL_ASSETS_ENABLED } from '@/lib/ffxiv-assets';
import styles from '@/app/editor/editor.module.css';

const PANEL_IDS: EditorPanelId[] = ['screenshot', 'character', 'information', 'template', 'style', 'effects'];
const PANEL_ICONS: Record<EditorPanelId, EditorIconName> = {
  screenshot: 'screenshot',
  character: 'character',
  information: 'information',
  template: 'template',
  style: 'style',
  effects: 'effects',
};
const CARD_TEMPLATES = MASTER_TEMPLATE_ORDER;
const SAMPLE_ARTWORK_SOURCES = new Set([
  demoAdventurerData.imageUrl,
  ...Object.values(demoAdventurerCards).map((card) => card.imageUrl),
]);
const TYPOGRAPHY_IDS: TypographyPresetId[] = ['editorial', 'modern', 'condensed', 'classic', 'clean'];
const COLOR_KEYS = ['primary', 'accent', 'light', 'dark'] as const;
const BASIC_IMAGE_CONTROL_KEYS = ['x', 'y', 'scale'] as const;
const ADVANCED_IMAGE_CONTROL_KEYS = ['rotation', 'brightness', 'contrast', 'saturation', 'exposure'] as const;
const IMAGE_DRAG_HINT_DURATION_MS = 3200;
const SCREENSHOT_INPUT_ID = 'editor-screenshot-file';
const SCREENSHOT_HELP_ID = 'editor-screenshot-help';
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

function CharacterInput({
  field,
  value,
  copy,
  onUpdate,
  onFocusField,
}: {
  field: TextFieldKey;
  value: string | number;
  copy: EditorCopy;
  onUpdate: (field: TextFieldKey, value: string) => void;
  onFocusField: (field: string) => void;
}) {
  const label = copy.fields[field];
  profileRender(`CharacterInput.${field}`);
  const placeholder = field === 'level' ? undefined : copy.placeholders[field];
  const isLevel = field === 'level';
  const [editingValue, setEditingValue] = useState<string | null>(null);
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
      if (isLevel) commit(String(committedLevel(editingValue ?? String(value), editorStore.getState().character.level)));
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
      latestComposition.current = String(value);
      setEditingValue(String(value));
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
    <label className={`${styles.field} ${field === 'bio' ? styles.bioField : ''}`}>
      <span>{label}</span>
      {field === 'bio' ? <><textarea data-editor-field={field} rows={4} maxLength={120} value={editingValue ?? value}
        placeholder={placeholder} aria-label={label} {...handlers}/><small>{String(editingValue ?? value).length} / 120</small></> : <input
        type={isLevel ? 'number' : 'text'}
        data-editor-field={field}
        min={isLevel ? 1 : undefined}
        max={isLevel ? 100 : undefined}
        maxLength={isLevel ? undefined : 48}
        inputMode={isLevel ? 'numeric' : undefined}
        autoComplete="off"
        value={editingValue ?? value}
        placeholder={placeholder}
        aria-label={label}
        {...handlers}
      />}
    </label>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={styles.fieldGrid}>{children}</div>;
}

function EditorInspector({
  copy,
  activePanel,
  onFocusField,
  onClose,
  onSuccessfulUpload,
  headingRef,
  locale,
  isOpen,
}: {
  copy: EditorCopy;
  activePanel: EditorPanelId;
  onFocusField: (field: string) => void;
  onClose: () => void;
  onSuccessfulUpload: () => void;
  headingRef: { current: HTMLHeadingElement | null };
  locale: Locale;
  isOpen: boolean;
}) {
  const character = useEditorStore((state) => state.character);
  const design = useEditorStore((state) => state.design);
  const image = useEditorStore((state) => state.image);
  const isSampleArtwork = isSampleArtworkSource(image.src, SAMPLE_ARTWORK_SOURCES);
  const isHydrated = useEditorStore((state) => state.isHydrated);
  const [uploadError, setUploadError] = useState('');
  const [uploadState, setUploadState] = useState<UploadInteractionState>('idle');
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadToken = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const uploadDragDepth = useRef(0);
  const uploadSuccessTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const copyForPanel = copy.sections[activePanel];
  profileRender('EditorInspector');
  if (activePanel === 'template') profileRender('TemplatePicker.subtree');
  if (activePanel === 'style') profileRender('TypographyPicker.subtree');

  useEffect(() => {
    let frame = 0;
    const revealFocusedInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inspector = inspectorRef.current;
        const input = document.activeElement;
        if (!inspector || !(input instanceof HTMLElement) || !inspector.contains(input) || !input.matches('input, textarea, select')) return;
        const body = inspector.querySelector<HTMLElement>(`.${styles.inspectorBody}`);
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
    SCREENSHOT_HELP_ID,
    SCREENSHOT_TYPES_ID,
    SCREENSHOT_STATUS_ID,
    ...(uploadError ? [SCREENSHOT_ERROR_ID] : []),
  ].join(' ');

  function getControlValue(key: ImageControlKey): number {
    return image[key];
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
  const localeScript: TypographyScript = locale === 'ko' ? 'korean' : locale === 'ja' ? 'japanese' : 'latin';
  const nameScript = detectTypographyScript(character.name, localeScript);
  const specimenName = character.name || copy.typographyNameFallback;

  useEffect(() => {
    if (activePanel !== 'style') return;
    const textByScript = {
      korean: `${TYPOGRAPHY_SPECIMENS.korean} ${nameScript === 'korean' ? character.name : ''}`,
      japanese: `${TYPOGRAPHY_SPECIMENS.japanese} ${nameScript === 'japanese' ? character.name : ''}`,
    };
    void loadTypographyFonts(design.typographyPreset, ['korean', 'japanese'], textByScript).catch(() => undefined);
  }, [activePanel, character.name, design.typographyPreset, nameScript]);

  return (
    <aside ref={inspectorRef} id="editor-inspector" className={styles.inspector} aria-label={copyForPanel}
      data-state={isOpen ? 'open' : 'closing'} aria-hidden={!isOpen} inert={!isOpen}>
      <div className={styles.sheetHandle} aria-hidden="true"><span /></div>
      <div className={styles.inspectorHead}>
        <div className={styles.inspectorTitle}>
          <span className={styles.inspectorIcon}><EditorIcon name={PANEL_ICONS[activePanel]} /></span>
          <div><span className={styles.panelIndex}>{String(PANEL_IDS.indexOf(activePanel) + 1).padStart(2, '0')} / 06</span><h2 ref={headingRef} tabIndex={-1}>{copyForPanel}</h2></div>
        </div>
        <button className={styles.closeInspector} type="button" onClick={onClose} aria-label={copy.closeInspector}><EditorIcon name="close" size={16} /></button>
      </div>

      <div className={styles.inspectorBody}>
        {activePanel === 'screenshot' && (
          <>
            <div
              className={`${styles.uploadZone} ${uploadState === 'drag-over' ? styles.uploadZoneActive : ''}`}
              data-state={uploadState}
              onDragEnter={onFileDragEnter}
              onDragOver={onFileDragOver}
              onDragLeave={onFileDragLeave}
              onDrop={onDrop}
            >
              <span className={styles.uploadSymbol}><EditorIcon name="upload" size={21} /></span>
              <strong aria-live={uploadState === 'drag-over' ? 'polite' : undefined}>
                {uploadState === 'drag-over' ? copy.dropToUpload : isSampleArtwork ? copy.uploadTitle : copy.replaceImage}
              </strong>
              <span className={styles.uploadSubcopy} id={SCREENSHOT_HELP_ID}>{copy.uploadDescription}</span>
              <button
                type="button"
                className={styles.uploadButton}
                onClick={() => {
                  if (uploadState === 'processing') return;
                  fileInput.current?.click();
                }}
                aria-disabled={uploadState === 'processing'}
                aria-label={`${isSampleArtwork ? copy.chooseFile : copy.replaceImage} · ${copy.uploadScreenshot}`}
                aria-controls={SCREENSHOT_INPUT_ID}
                aria-describedby={screenshotDescriptionIds}
              >
                {isSampleArtwork ? copy.chooseFile : copy.replaceImage}
              </button>
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
              <span className={styles.fileTypes} id={SCREENSHOT_TYPES_ID}>{copy.fileTypes}</span>
            </div>
            {isSampleArtwork && (
              <div className={styles.sampleNotice}>
                <span className={styles.sampleDot} aria-hidden="true" />
                <div><strong>{copy.sampleArtwork}</strong><p>{copy.sampleArtworkHint}</p></div>
              </div>
            )}
            {!isSampleArtwork && (
              <div className={styles.currentImage}>
                <span className={styles.currentImageMark} aria-hidden="true">✓</span>
                <span title={image.fileName ?? copy.uploadedScreenshot}>{image.fileName ?? copy.uploadedScreenshot}</span>
              </div>
            )}
            <p className={styles.privacyNote}>{copy.privacy}</p>
            {uploadError && <p className={styles.errorMessage} id={SCREENSHOT_ERROR_ID} role="alert" aria-atomic="true">{getUploadErrorMessage(uploadError, locale)}</p>}
            <details className={`${styles.sectionRule} ${styles.disclosure}`} open>
              <summary className={styles.sectionHeading}><div><span>02</span><h3>{copy.image}</h3></div></summary>
              <div className={styles.imageControlList}>
                <button type="button" className={styles.imageResetButton} aria-label={`${copy.image}: ${copy.resetImage}`} onClick={resetImageAdjustments}>{copy.resetImage}</button>
                {BASIC_IMAGE_CONTROL_KEYS.map(renderImageControl)}
                <details className={styles.disclosure}>
                  <summary>{copy.moreImageAdjustments}</summary>
                  <div className={styles.imageControlList}>{ADVANCED_IMAGE_CONTROL_KEYS.map(renderImageControl)}</div>
                </details>
              </div>
            </details>
          </>
        )}

        {activePanel === 'character' && (
          <div className={styles.formSection}>
            <p className={styles.panelIntro}>{copy.subtitle}</p>
            <FieldGrid>
              <CharacterInput field="name" value={character.name} copy={copy} onUpdate={updateText} onFocusField={onFocusField} />
              <JobPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={() => onFocusField('')} />
            </FieldGrid>
            <section className={styles.editorGroup} aria-label={copy.fields.world}>
              <WorldPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={() => onFocusField('')} />
            </section>
            <details className={styles.disclosure}>
              <summary>{copy.additionalCharacterDetails}</summary>
              <div className={styles.fieldGrid}>
                <CharacterInput field="level" value={character.level} copy={copy} onUpdate={updateText} onFocusField={onFocusField} />
                <RaceClanPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={() => onFocusField('')} />
              </div>
            </details>
          </div>
        )}

        {activePanel === 'information' && (
          <div className={styles.formSection}>
            <p className={styles.panelIntro}>{copy.informationIntro}</p>
            <FieldGrid>
              <CharacterInput field="freeCompany" value={character.freeCompany} copy={copy} onUpdate={updateText} onFocusField={onFocusField} />
              <GrandCompanyPicker character={character} copy={copy} locale={locale} onFocusField={onFocusField} onBlurField={() => onFocusField('')} />
            </FieldGrid>
            <div className={styles.chipField}>
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
            <div className={styles.chipField}>
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
            <CharacterInput field="bio" value={character.bio} copy={copy} onUpdate={updateText} onFocusField={onFocusField}/>
            <FFXIVAttribution
              className={styles.privacyNote}
              locale={locale}
              officialAssetsUsed={FFXIV_OFFICIAL_ASSETS_ENABLED}
              service={character.service === 'korea' ? 'KOREA' : 'GLOBAL'}
            />
          </div>
        )}

        {activePanel === 'template' && (
          <div className={`${styles.formSection} ${styles.templatePanel}`}>
            <section className={`${styles.editorGroup} ${styles.masterTemplateGrid}`} aria-label={copy.template}>
              <div className={styles.sectionHeading}><div><span>01</span><h3>{copy.template}</h3></div></div>
              <div className={styles.templateChoices}>
                {CARD_TEMPLATES.map((template) => {
                  const selected = design.template === template && design.layoutVariant === MASTER_CARD_CONFIG[template].layout;
                  return (
                    <div key={template} className={styles.templateChoice} data-selected={selected}>
                      <MasterTemplateProof template={template} locale={locale} />
                      <button type="button" className={styles.templateChoiceAction} aria-label={`${copy.template}: ${getTemplateLabel(copy, template)}`} aria-pressed={selected} onClick={() => {
                        selectMasterTemplate(template);
                        if (window.matchMedia('(max-width: 900px)').matches) onClose();
                      }}>
                        <span className={styles.templateChoiceName}>{getTemplateLabel(copy, template)}</span>
                        <span className={styles.templateIntent}>{copy.templateIntents[template]}</span>
                        <span className={styles.masterTemplateBadge}>{copy.masterLabel}</span>
                        <span className={styles.selectedMark} aria-hidden="true">{selected ? '✓' : ''}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <details className={`${styles.disclosure} ${styles.experimentalDisclosure}`}>
              <summary>{copy.experimentalLabel}</summary>
              <p className={styles.panelIntro}>{copy.experimentalHint}</p>
              <div className={styles.variationChoices} aria-label={copy.templateVariation}>
                {(['b', 'c'] as const).map((variant) => (
                  <button type="button" key={variant} className={styles.variationChoice} aria-pressed={design.layoutVariant === variant} onClick={() => editorStore.getState().updateDesign('layoutVariant', variant)}>
                    <span>{copy.variationNames[variant]}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}

        {activePanel === 'style' && (
          <div className={styles.formSection}>
            <p className={styles.panelIntro}>{copy.styleIntro}</p>
            <section className={styles.editorGroup} aria-label={copy.typography}>
              <div className={styles.sectionHeading}><div><span>01</span><h3>{copy.typography}</h3></div></div>
              <div className={styles.typeChoices}>
                {TYPOGRAPHY_IDS.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={styles.typeChoice}
                    aria-label={`${copy.typographyNames[preset]} · ${specimenName}`}
                    aria-pressed={design.typographyPreset === preset}
                    onClick={() => editorStore.getState().updateDesign('typographyPreset', preset)}
                  >
                    <span className={styles.typeChoiceHead}>
                      <span className={styles.typeSample} aria-hidden="true">Aa</span>
                      <strong>{copy.typographyNames[preset]}</strong>
                      {design.typographyPreset === preset && <span className={styles.typeSelectedMark} aria-hidden="true">✓</span>}
                    </span>
                    <span className={styles.typeCurrentName} style={{ fontFamily: getTypographyFontFamily(preset, 'display', nameScript) }}>{specimenName}</span>
                  </button>
                ))}
              </div>
              <details className={styles.typeSpecimenDisclosure}>
                <summary>{copy.typographySpecimens}</summary>
                <div className={styles.typeSpecimenList}>
                  {TYPOGRAPHY_IDS.map((preset) => (
                    <div className={styles.typeSpecimenGroup} key={preset}>
                      <strong>{copy.typographyNames[preset]}</strong>
                      {([
                        ['EN', 'latin'],
                        ['KO', 'korean'],
                        ['JA', 'japanese'],
                      ] as const).map(([label, script]) => (
                        <span className={styles.typeSpecimenRow} key={script}>
                          <i>{label}</i>
                          <span style={{ fontFamily: getTypographyFontFamily(preset, 'display', script) }}>{TYPOGRAPHY_SPECIMENS[script]}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </section>

            <details className={`${styles.editorGroup} ${styles.disclosure}`}>
              <summary className={styles.sectionHeading}><div><span>02</span><h3>{copy.colors}</h3></div></summary>
              <div className={styles.modeChoices} role="group" aria-label={copy.colors}>
                {(['auto', 'custom', 'job'] as const).map((mode) => (
                  <button type="button" key={mode} aria-pressed={design.colorMode === mode} onClick={() => editorStore.getState().updateDesign('colorMode', mode)}>{copy.colorModes[mode]}</button>
                ))}
              </div>
              <p className={styles.panelIntro}>{copy.colorModesHint}</p>
              {design.colorMode === 'auto' && (
                <div className={styles.autoPalette}>
                  <div className={styles.paletteSwatches}>
                    {COLOR_KEYS.map((key) => <span key={key} title={`${copy.colorNames[key]} ${design.palette[key]}`} style={{ backgroundColor: design.palette[key] }} />)}
                  </div>
                  <p>{copy.colorModes.auto} · {isSampleArtwork ? copy.sampleArtwork : image.fileName ?? copy.uploadedScreenshot}</p>
                </div>
              )}
              {design.colorMode === 'custom' && (
                <div className={styles.paletteControls}>
                  {COLOR_KEYS.map((key: ColorKey) => (
                    <label className={styles.colorControl} key={key}>
                      <span>{copy.colorNames[key]}</span>
                      <input
                        type="color"
                        value={design.palette[key]}
                        aria-label={copy.colorNames[key]}
                        onInput={(event) => updatePaletteColor(key, event.currentTarget.value)}
                        onChange={(event) => updatePaletteColor(key, event.currentTarget.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
              {design.colorMode === 'job' && (
                <div className={styles.jobThemePreview}>
                  <span className={styles.jobCrest} style={{ '--job-accent': activeJobTheme.accent, '--job-secondary': activeJobTheme.secondary } as CSSProperties} aria-hidden="true">✦</span>
                  <span><strong>{jobRecord?.localizedName[locale] ?? character.job}</strong><small>{copy.jobThemeHint}</small></span>
                  <div className={styles.jobSwatches} aria-label={copy.jobTheme}>
                    <i style={{ backgroundColor: activeJobTheme.accent }} /><i style={{ backgroundColor: activeJobTheme.secondary }} />
                  </div>
                </div>
              )}
            </details>

            <section className={styles.editorGroup} aria-label={copy.jobMotif}>
              <button
                type="button"
                className={styles.effectRow}
                aria-pressed={design.jobMotifVisible !== false}
                onClick={() => editorStore.getState().updateDesign('jobMotifVisible', design.jobMotifVisible === false)}
              >
                <span className={styles.effectIcon} aria-hidden="true">✦</span>
                <span><strong>{copy.jobMotif}</strong><small>{copy.jobMotifHint}</small></span>
                <i className={styles.switchTrack} aria-hidden="true"><b /></i>
              </button>
              <div className={styles.paletteControls}>
                <label className={styles.colorControl}>
                  <span>{copy.jobIconColor}</span>
                  <input
                    type="color"
                    value={design.jobIconColor ?? design.palette.accent}
                    aria-label={copy.jobIconColor}
                    onInput={(event) => editorStore.getState().updateDesign('jobIconColor', event.currentTarget.value)}
                    onChange={(event) => editorStore.getState().updateDesign('jobIconColor', event.currentTarget.value)}
                  />
                </label>
                <div className={styles.modeChoices} style={{ gridTemplateColumns: '1fr' }}>
                  <button
                    type="button"
                    aria-label={copy.useFamilyAccent}
                    disabled={!design.jobIconColor}
                    onClick={() => editorStore.getState().updateDesign('jobIconColor', null)}
                  >{copy.useFamilyAccent}</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activePanel === 'effects' && (
          <div className={styles.formSection}>
            <p className={styles.panelIntro}>{copy.effectsHint}</p>
            {(['grain', 'holographic'] as const).map((effect) => {
              const selected = design.effects.includes(effect);
              return (
                <button
                  type="button"
                  className={styles.effectRow}
                  key={effect}
                  aria-pressed={selected}
                  onClick={() => editorStore.getState().updateDesign('effects', selected ? design.effects.filter((item) => item !== effect) : [...design.effects, effect])}
                >
                  <span className={styles.effectIcon} aria-hidden="true">{effect === 'grain' ? '∴' : '✧'}</span>
                  <span><strong>{effect === 'grain' ? copy.grain : copy.holographic}</strong><small>{effect === 'grain' ? copy.grainDescription : copy.holographicDescription}</small></span>
                  <i className={styles.switchTrack} aria-hidden="true"><b /></i>
                </button>
              );
            })}
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
  highlightField,
  panMode,
  onTogglePan,
  onExport,
  onRequestScreenshot,
  onEscapeClose,
  showImageDragHint,
  onImageDragStart,
}: {
  copy: EditorCopy;
  locale: Locale;
  highlightField: string;
  panMode: boolean;
  onTogglePan: () => void;
  onExport: () => void;
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
  const changeRatio = useCallback((ratio: CardRatio) => {
    editorStore.getState().updateDesign('ratio', ratio);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardFrameRef = useRef<HTMLDivElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<
    | { kind: 'pan'; pointerId: number; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'image'; pointerId: number; startX: number; startY: number; originX: number; originY: number; width: number; height: number }
    | null
  >(null);
  const fallbackPointerCleanupRef = useRef<(() => void) | null>(null);
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
      if (event.code === 'Space' && !isTyping) {
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

  const movePointer = useCallback((event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>) => {
    const drag = dragRef.current;
    if (!drag || !isCanvasDragPointer(drag.pointerId, event.pointerId)) return;
    if (drag.kind === 'pan') {
      setPanOffset({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY });
    } else {
      const x = drag.originX - ((event.clientX - drag.startX) / drag.width) * 100;
      const y = drag.originY - ((event.clientY - drag.startY) / drag.height) * 100;
      editorStore.getState().setImage({ x, y }, { groupId: 'canvas-image-drag' });
    }
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => movePointer(event), [movePointer]);

  const finishPointerDrag = useCallback((pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || !isCanvasDragPointer(drag.pointerId, pointerId)) return;
    if (drag.kind === 'image') editorStore.getState().endImageAdjustmentGroup();
    dragRef.current = null;
    setIsDragging(false);
    tryReleasePointerCapture(stageRef.current, pointerId);
    fallbackPointerCleanupRef.current?.();
    fallbackPointerCleanupRef.current = null;
  }, []);

  const onPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => finishPointerDrag(event.pointerId), [finishPointerDrag]);

  const attachPointerFallback = useCallback((pointerId: number) => {
    fallbackPointerCleanupRef.current?.();
    const onFallbackMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (event.target instanceof Node && stageRef.current?.contains(event.target)) return;
      movePointer(event);
    };
    const onFallbackEnd = (event: PointerEvent) => {
      if (event.pointerId === pointerId) finishPointerDrag(pointerId);
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
    fallbackPointerCleanupRef.current?.();
    fallbackPointerCleanupRef.current = null;
    if (dragRef.current?.kind === 'image') editorStore.getState().endImageAdjustmentGroup();
    dragRef.current = null;
  }, []);

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
    <section className={`${styles.canvasColumn} ${previewOpen ? styles.canvasPreviewMode : ''}`} aria-label={`${copy.canvasLabel}: ${copy.cardPreviewSummary(character.name, summaryJob, character.world)}`}>
      <div className={styles.canvasHeading}>
        <div>
          <span className={styles.canvasEyebrow}>{copy.canvasLabel}</span>
          <span className={styles.canvasTitle}>
            {character.name || copy.sections.character}<i aria-hidden="true">·</i>{getTemplateLabel(copy, design.template)}
          </span>
        </div>
        <div className={styles.canvasHeadingActions}>
          <button type="button" className={`${styles.canvasTool} ${safeAreaVisible ? styles.canvasToolActive : ''}`} aria-pressed={safeAreaVisible} onClick={() => editorStore.getState().setUi({ safeAreaVisible: !safeAreaVisible })}>
            <EditorIcon name="safe-area" size={15} />{copy.safeArea}
          </button>
          <span className={styles.canvasStatus}><i aria-hidden="true" />{copy.preview}</span>
        </div>
      </div>
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
          <MemoCardPreview data={cardData} className={styles.canvasCard} highlightField={highlightField} />
          {safeAreaVisible && <div className={styles.safeAreaGuide} aria-hidden="true" />}
        </div>
        {showImageDragHint && <span className={styles.stageDragHint} role="status" aria-live="polite">{copy.dragToReposition}</span>}
        {isSampleArtwork && (
          <div className={styles.stageUploadActions}>
            <span className={styles.stageSampleBadge}>{copy.sampleBadge}</span>
            <button type="button" className={styles.stageUpload} onClick={onRequestScreenshot}>
              <EditorIcon name="upload" size={15} />{copy.uploadScreenshot}
            </button>
          </div>
        )}
        <span className={styles.stageLabel}>{design.ratio} · {Math.round(zoom * 100)}%</span>
        <span className={styles.stageTip} aria-hidden="true">{copy.panHint}</span>
      </div>

      <div className={styles.bottomTools} role="toolbar" aria-label={copy.title}>
        <div className={styles.toolbarUtilityGroup}>
          <div className={styles.historyTools}>
            <HistoryButton action="undo" copy={copy} />
            <HistoryButton action="redo" copy={copy} />
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
          <div className={styles.zoomTools}>
            <ToolbarTooltipButton type="button" onClick={() => adjustZoom(-0.1)} aria-label={`${copy.canvasLabel}: ${copy.zoomOut}`} aria-keyshortcuts="-" tooltip={`${copy.canvasLabel}: ${copy.zoomOut} · -`}><EditorIcon name="zoom-out" size={15} /></ToolbarTooltipButton>
            <input type="range" min="0.55" max="1.5" step="0.05" value={zoom} onChange={(event) => editorStore.getState().setUi({ zoom: Number(event.currentTarget.value) })} aria-label={`${copy.canvasLabel}: ${copy.zoom}`} aria-valuetext={formatAccessiblePercent(locale, zoom * 100)} />
            <ToolbarTooltipButton type="button" onClick={() => adjustZoom(0.1)} aria-label={`${copy.canvasLabel}: ${copy.zoomIn}`} aria-keyshortcuts="+" tooltip={`${copy.canvasLabel}: ${copy.zoomIn} · +`}><EditorIcon name="zoom-in" size={15} /></ToolbarTooltipButton>
            <output aria-live="off" aria-hidden="true">{Math.round(zoom * 100)}%</output>
          </div>
        </div>
        <div className={styles.toolbarViewGroup}>
          <ToolbarTooltipButton type="button" className={styles.fitButton} onClick={fitCanvas} aria-label={copy.fitCanvas} aria-keyshortcuts="0" tooltip={`${copy.fitCanvas} · 0`}><EditorIcon name="fit" size={15} /><span>{copy.fitCanvas}</span></ToolbarTooltipButton>
          <ToolbarTooltipButton type="button" className={`${styles.panToggle} ${panMode ? styles.panToggleActive : ''}`} aria-pressed={panMode} onClick={onTogglePan} aria-label={copy.panMode} tooltip={copy.panHint}><EditorIcon name="pan" size={16} /></ToolbarTooltipButton>
          <RatioPicker label={copy.ratio} value={design.ratio} onChange={changeRatio} />
        </div>
        <div className={styles.toolbarOutputGroup}>
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
            <EditorIcon name="preview" size={15} />{previewOpen ? copy.backToEditor : copy.preview}
          </button>
          <button type="button" className={styles.exportButton} onClick={onExport}>{copy.export}<EditorIcon name="export" size={15} /></button>
        </div>
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
  const inspectorOpen = useEditorStore((state) => state.ui.inspectorOpen);
  const previewOpen = useEditorStore((state) => state.ui.previewOpen);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const imageSource = useEditorStore((state) => state.image.src);
  const [highlightField, setHighlightField] = useState('');
  const [panMode, setPanMode] = useState(false);
  const [imageDragHintPhase, setImageDragHintPhase] = useState<ImageDragHintPhase>('idle');
  const imageDragHintPhaseRef = useRef<ImageDragHintPhase>('idle');
  const imageDragHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolButtonRefs = useRef(new Map<EditorPanelId, HTMLButtonElement>());
  const inspectorHeadingRef = useRef<HTMLHeadingElement>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const inspectorCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!isMobileViewport || previewOpen || (!inspectorOpen && !isInspectorClosing)) {
      dispatchImageDragHint('canvas-available');
    }
  }, [dispatchImageDragHint, inspectorOpen, isInspectorClosing, isMobileViewport, previewOpen]);

  const dismissImageDragHint = useCallback(() => {
    dispatchImageDragHint('image-drag');
  }, [dispatchImageDragHint]);

  useEffect(() => {
    if (imageDragHintPhase !== 'pending') return;
    if (isSampleArtworkSource(imageSource, SAMPLE_ARTWORK_SOURCES)) {
      dispatchImageDragHint('sample-reset');
      return;
    }
    if (!isMobileViewport || previewOpen || (!inspectorOpen && !isInspectorClosing)) {
      dispatchImageDragHint('canvas-available');
    }
  }, [dispatchImageDragHint, imageDragHintPhase, imageSource, inspectorOpen, isInspectorClosing, isMobileViewport, previewOpen]);

  const closeInspector = useCallback(() => {
    const state = editorStore.getState();
    if (inspectorCloseTimer.current) clearTimeout(inspectorCloseTimer.current);
    inspectorCloseTimer.current = null;
    const shouldRetain = shouldRetainInspectorForExit({
      wasOpen: state.ui.inspectorOpen,
      isMobile: isMobileViewport,
      previewOpen: state.ui.previewOpen,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    setIsInspectorClosing(shouldRetain);
    state.setUi({ inspectorOpen: false });
    toolButtonRefs.current.get(state.ui.activePanel)?.focus();
    if (shouldRetain) {
      inspectorCloseTimer.current = setTimeout(() => {
        inspectorCloseTimer.current = null;
        setIsInspectorClosing(false);
      }, INSPECTOR_CLOSE_FALLBACK_MS);
    }
  }, [isMobileViewport]);

  const openInspector = useCallback((panel: EditorPanelId) => {
    if (inspectorCloseTimer.current) clearTimeout(inspectorCloseTimer.current);
    inspectorCloseTimer.current = null;
    setIsInspectorClosing(false);
    editorStore.getState().setUi({ activePanel: panel, inspectorOpen: true });
  }, []);

  const requestScreenshotUpload = useCallback(() => {
    openInspector('screenshot');
  }, [openInspector]);

  const togglePan = useCallback(() => setPanMode((value) => !value), []);

  useEffect(() => {
    const state = editorStore.getState();
    state.hydrate();
    const mobileViewport = window.matchMedia('(max-width: 900px)');
    const applyViewport = (matches: boolean) => {
      setIsMobileViewport(matches);
      if (!matches) {
        if (inspectorCloseTimer.current) clearTimeout(inspectorCloseTimer.current);
        inspectorCloseTimer.current = null;
        setIsInspectorClosing(false);
      }
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
      if (inspectorCloseTimer.current) clearTimeout(inspectorCloseTimer.current);
      if (imageDragHintTimeout.current) clearTimeout(imageDragHintTimeout.current);
      inspectorCloseTimer.current = null;
      imageDragHintTimeout.current = null;
      mobileViewport.removeEventListener('change', handleViewportChange);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
      persist();
    };
  }, []);

  const exportCard = useCallback(() => {
    editorStore.getState().persistNow();
    router.push('/export');
  }, [router]);

  return (
    <div className={`${styles.page} ${previewOpen ? styles.previewMode : ''}`}>
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
            <div className={styles.sidebarHeader}><span>{copy.workspaceLabel}</span><small>XIV · 01</small></div>
            <nav className={styles.toolNav} aria-label={copy.title}>
              {PANEL_IDS.map((id, index) => (
                <button
                  type="button"
                  key={id}
                  className={`${styles.toolButton} ${activePanel === id ? styles.toolButtonActive : ''}`}
                  ref={(node) => {
                    if (node) toolButtonRefs.current.set(id, node);
                    else toolButtonRefs.current.delete(id);
                  }}
                  aria-controls={!previewOpen && inspectorOpen ? 'editor-inspector' : undefined}
                  aria-pressed={activePanel === id}
                  aria-expanded={activePanel === id && inspectorOpen}
                  aria-label={copy.sections[id]}
                  onClick={(event) => {
                    editorStore.getState().setUi({ activePanel: id, inspectorOpen: true });
                    if (event.detail === 0) requestAnimationFrame(() => inspectorHeadingRef.current?.focus());
                  }}
                >
                  <span className={styles.toolButtonIcon}><EditorIcon name={PANEL_ICONS[id]} /></span>
                  <span className={styles.toolButtonLabel}>{copy.sections[id]}</span>
                  <small>{String(index + 1).padStart(2, '0')}</small>
                </button>
              ))}
            </nav>
            <div className={styles.sidebarFoot}><span className={styles.railLine} /><span>ADVENTURER<br />CARD STUDIO</span></div>
          </aside>
        )}

        <Profiler id="EditorCanvas" onRender={profileCommit}><MemoEditorCanvas
          copy={copy}
          locale={locale}
          highlightField={highlightField}
          panMode={panMode}
          onTogglePan={togglePan}
          onExport={exportCard}
          onRequestScreenshot={requestScreenshotUpload}
          onEscapeClose={closeInspector}
          showImageDragHint={imageDragHintPhase === 'visible'}
          onImageDragStart={dismissImageDragHint}
        /></Profiler>

        {!previewOpen && (inspectorOpen || isInspectorClosing) && (
          <EditorBoundary resetKey={`${activePanel}-${locale}`}><MemoEditorInspector
            copy={copy}
            locale={locale}
            activePanel={activePanel}
            isOpen={inspectorOpen}
            onFocusField={setHighlightField}
            onClose={closeInspector}
            onSuccessfulUpload={onSuccessfulUpload}
            headingRef={inspectorHeadingRef}
          /></EditorBoundary>
        )}
      </div>
    </div>
  );
}

