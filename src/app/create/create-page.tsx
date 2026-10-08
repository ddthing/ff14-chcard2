'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CardPreview } from '@/components/editor/card-preview';
import type { AdventurerCardData, AdventurerCardTemplate } from '@/components/cards/types';
import { demoAdventurerData, getConerSample } from '@/components/cards/types';
import { getUploadErrorMessage } from '@/components/editor/editor-errors';
import {
  hasFileTransfer,
  transitionUploadInteractionState,
  updateFileDragDepth,
  type UploadInteractionState,
} from '@/components/editor/editor-interaction';
import { EditorIcon } from '@/components/editor/editor-icon';
import { registerUploadCancellation } from '@/components/editor/upload-session';
import { FFXIVAttribution } from '@/components/ffxiv';
import { conerSample } from '@/data/samples/coner';
import { useI18n } from '@/lib/i18n';
import { ImageProcessingError, isImageProcessingCancelled, prepareImageFile, type PreparedImage } from '@/lib/image-processing';
import { normalizeCardData } from '@/store/editor-persistence';
import { editorStore } from '@/store/editor-store';
import { getSampleConfirmationFocusTarget, getUploadConfirmationFocusTarget, hasNonSampleDraft, type UploadConfirmationExit } from './create-draft';
import { createEntryCopy } from './create.copy';
import styles from './create.module.css';

type SampleRole = 'portrait' | 'landscape';
const normalizedDefaultSample = normalizeCardData(demoAdventurerData);

export default function CreatePage({ initialTemplate }: { initialTemplate?: AdventurerCardTemplate }) {
  const router = useRouter();
  const { locale } = useI18n();
  const text = createEntryCopy[locale];
  const initialChoice = initialTemplate ?? 'cinematic';
  const [selectedTemplate, setSelectedTemplate] = useState<AdventurerCardTemplate>(initialChoice);
  const [activeSample, setActiveSample] = useState<SampleRole>('portrait');
  const [currentDraftData, setCurrentDraftData] = useState<AdventurerCardData | null>(null);
  const [confirmSample, setConfirmSample] = useState(false);
  const [pendingSample, setPendingSample] = useState<SampleRole | null>(null);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PreparedImage | null>(null);
  const [uploadState, setUploadState] = useState<UploadInteractionState>('idle');
  const [uploadError, setUploadError] = useState('');
  const [failedFileName, setFailedFileName] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseFileRef = useRef<HTMLButtonElement>(null);
  const continueToEditorRef = useRef<HTMLButtonElement>(null);
  const sampleTriggerRefs = useRef<Record<SampleRole, HTMLButtonElement | null>>({ portrait: null, landscape: null });
  const confirmSampleRef = useRef<HTMLButtonElement>(null);
  const confirmUploadRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingSample = useRef(false);
  const wasConfirmingUpload = useRef(false);
  const uploadConfirmationExit = useRef<UploadConfirmationExit | null>(null);
  const uploadToken = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const mounted = useRef(false);

  const templateNames: Record<AdventurerCardTemplate, string> = {
    cinematic: text.cinematic,
    editorial: text.editorial,
    'id-card': text.identity,
  };
  const photoReady = uploadState === 'success' && !confirmUpload;
  const showCardPreview = photoReady || Boolean(currentDraftData);
  const samplePreview = useMemo(() => getConerSample(selectedTemplate, '4:5', activeSample), [selectedTemplate, activeSample]);
  const previewData = useMemo(() => currentDraftData
    ? {
        ...currentDraftData,
        design: { ...currentDraftData.design, template: selectedTemplate },
      }
    : samplePreview, [currentDraftData, selectedTemplate, samplePreview]);
  const previewSummary = `${previewData.character.name} · ${templateNames[selectedTemplate]}`;

  useEffect(() => {
    const target = getSampleConfirmationFocusTarget(confirmSample, wasConfirmingSample.current);
    wasConfirmingSample.current = confirmSample;
    if (target === 'confirmation') confirmSampleRef.current?.focus();
    if (target === 'trigger') sampleTriggerRefs.current[activeSample]?.focus();
  }, [activeSample, confirmSample]);

  useEffect(() => {
    const wasConfirming = wasConfirmingUpload.current;
    const target = getUploadConfirmationFocusTarget(confirmUpload, wasConfirming, uploadConfirmationExit.current);
    wasConfirmingUpload.current = confirmUpload;
    if (target === 'confirmation') confirmUploadRef.current?.focus();
    if (target === 'trigger') chooseFileRef.current?.focus();
    if (target === 'continue') continueToEditorRef.current?.focus();
    if (!confirmUpload && wasConfirming) uploadConfirmationExit.current = null;
  }, [confirmUpload]);

  const cancelUpload = useCallback((resetFeedback = true) => {
    uploadToken.current += 1;
    uploadController.current?.abort();
    uploadController.current = null;
    dragDepth.current = 0;
    if (mounted.current && resetFeedback) {
      setUploadState((state) => transitionUploadInteractionState(state, 'cancel'));
      setUploadError('');
      setFailedFileName('');
      setPendingUpload(null);
      uploadConfirmationExit.current = 'cancelled';
      setConfirmUpload(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const updateDraftPresence = () => {
      const state = editorStore.getState();
      if (!state.isHydrated) return;
      const data = state.toCardData();
      const hasSavedWork = hasNonSampleDraft(data, normalizedDefaultSample);
      setCurrentDraftData(hasSavedWork ? data : null);
      if (!initialTemplate) setSelectedTemplate(data.design.template);
    };
    const unsubscribeDraft = editorStore.subscribe(updateDraftPresence);
    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (uploadController.current && state.image !== previous.image) cancelUpload();
    });
    const unregister = registerUploadCancellation(() => cancelUpload());
    editorStore.getState().hydrate();
    updateDraftPresence();

    return () => {
      mounted.current = false;
      unsubscribeDraft();
      unsubscribe();
      unregister();
      cancelUpload(false);
    };
  }, [cancelUpload, initialTemplate]);

  const applyPreparedUpload = useCallback((prepared: PreparedImage, fromConfirmation = false) => {
    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();
    if (store.design.template !== selectedTemplate) store.updateDesign('template', selectedTemplate);
    store.replaceUploadedImage({
      src: prepared.imageUrl,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
    }, prepared.palette);
    store.persistNow();
    setPendingUpload(null);
    setSelectedFileName(prepared.fileName);
    if (fromConfirmation) uploadConfirmationExit.current = 'accepted';
    setConfirmUpload(false);
    setConfirmSample(false);
    setUploadState((state) => transitionUploadInteractionState(state, 'success'));
  }, [selectedTemplate]);

  const acceptImage = useCallback(async (file?: File) => {
    if (!file || uploadController.current) return;

    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();

    const token = uploadToken.current + 1;
    uploadToken.current = token;
    const controller = new AbortController();
    uploadController.current = controller;
    setPendingUpload(null);
    setConfirmUpload(false);
    setConfirmSample(false);
    setUploadError('');
    setFailedFileName('');
    setSelectedFileName('');
    setUploadState((state) => transitionUploadInteractionState(state, 'processing'));

    try {
      const prepared = await prepareImageFile(file, { signal: controller.signal });
      if (uploadToken.current !== token || !mounted.current) return;

      uploadController.current = null;
      const currentStore = editorStore.getState();
      if (!currentStore.isHydrated) currentStore.hydrate();
      if (hasNonSampleDraft(currentStore.toCardData(), normalizedDefaultSample)) {
        setPendingUpload(prepared);
        uploadConfirmationExit.current = null;
        setConfirmUpload(true);
        setUploadState((state) => transitionUploadInteractionState(state, 'success'));
        return;
      }
      applyPreparedUpload(prepared);
    } catch (error) {
      if (uploadToken.current !== token || !mounted.current || isImageProcessingCancelled(error)) return;
      const code = error instanceof ImageProcessingError ? error.code : 'decode-failed';
      setFailedFileName(file.name);
      setUploadError(getUploadErrorMessage(code, locale));
      setUploadState((state) => transitionUploadInteractionState(state, 'error'));
    } finally {
      if (uploadToken.current === token) uploadController.current = null;
    }
  }, [applyPreparedUpload, locale]);

  const openSampleInEditor = () => {
    cancelUpload();
    setConfirmSample(false);
    const role = pendingSample ?? activeSample;
    const sample = getConerSample(selectedTemplate, '4:5', role);
    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();
    store.replaceCardData(sample, { recordHistory: false });
    store.persistNow();
    router.push('/editor');
  };

  const startWithSample = () => {
    cancelUpload();
    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();
    const role = activeSample;
    setPendingSample(role);
    if (hasNonSampleDraft(store.toCardData(), normalizedDefaultSample)) {
      setConfirmSample(true);
      return;
    }
    openSampleInEditor();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    void acceptImage(file);
  };

  const openFilePicker = () => {
    if (uploadState === 'processing') return;
    setPendingUpload(null);
    uploadConfirmationExit.current = 'cancelled';
    setConfirmUpload(false);
    setConfirmSample(false);
    setPendingSample(null);
    setUploadError('');
    setFailedFileName('');
    setSelectedFileName('');
    fileInputRef.current?.click();
  };

  const cancelPendingUpload = () => {
    setPendingUpload(null);
    uploadConfirmationExit.current = 'cancelled';
    setConfirmUpload(false);
    setUploadState((state) => transitionUploadInteractionState(state, 'cancel'));
  };

  const handleDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    if (uploadState === 'processing') return;
    dragDepth.current = updateFileDragDepth(dragDepth.current, 'enter');
    setUploadState((state) => transitionUploadInteractionState(state, 'file-enter'));
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepth.current = updateFileDragDepth(dragDepth.current, 'leave');
    if (dragDepth.current === 0 && uploadState === 'drag-over') {
      setUploadState((state) => transitionUploadInteractionState(state, 'file-leave'));
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFileTransfer(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepth.current = 0;
    if (uploadState === 'processing') return;
    if (uploadState === 'drag-over') setUploadState((state) => transitionUploadInteractionState(state, 'file-leave'));
    setPendingUpload(null);
    setConfirmUpload(false);
    void acceptImage(event.dataTransfer.files?.[0]);
  };

  const uploadStatus = uploadState === 'drag-over'
    ? text.dropActive
    : uploadState === 'processing'
      ? text.processing
      : uploadState === 'success'
        ? confirmUpload ? text.prepared : text.success
        : '';

  return (
    <div className={styles.page} lang={locale}>
      <div className={styles.content}>
        <nav className={styles.stepNav} aria-label={locale === 'ko' ? '카드 만들기' : locale === 'ja' ? 'カード作成' : 'Create a card'}>
          <Link className={styles.backLink} href="/"><span aria-hidden="true">←</span>{text.backHome}</Link>
          <Link className={styles.navAction} href={`/templates?template=${selectedTemplate}`}>{text.templatesLink}</Link>
        </nav>

        <header className={styles.introHeader}>
          <h1 className={styles.title}>{text.title}</h1>
          <p className={styles.intro}>{text.intro}</p>
        </header>

        <main className={styles.layout}>
          <section
            className={styles.uploadPanel}
            aria-labelledby="upload-title"
            data-state={uploadState}
            aria-busy={uploadState === 'processing'}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className={styles.uploadSymbol} aria-hidden="true" data-state={uploadState}>
              {uploadState === 'processing'
                ? <span className={styles.uploadSpinner} />
                : photoReady
                  ? <span className={styles.uploadSuccessMark}>✓</span>
                  : <EditorIcon name="upload" size={26} />}
            </span>
            <h2 id="upload-title">{confirmUpload ? text.confirmUploadTitle : photoReady ? text.photoReadyTitle : text.uploadTitle}</h2>
            <p className={styles.uploadDescription}>{photoReady ? text.photoReadyDescription : text.uploadDescription}</p>
            {uploadState !== 'processing' && !photoReady && !confirmUpload && (
              <p className={styles.dropPrompt}>{uploadState === 'drag-over' ? text.dropActive : text.dropIdle}</p>
            )}
            {!photoReady && !confirmUpload && <span className={styles.fileTypes}>{text.fileTypes}</span>}
            {!confirmUpload && (
              <button
                ref={chooseFileRef}
                className={photoReady ? styles.changePhotoButton : styles.chooseButton}
                type="button"
                disabled={uploadState === 'processing'}
                onClick={openFilePicker}
                aria-describedby="upload-guidance upload-status"
              >{uploadState === 'processing' ? text.processing : photoReady ? text.chooseAnotherPhoto : text.chooseFile}</button>
            )}
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={text.uploadTitle}
              tabIndex={-1}
              onChange={handleFileChange}
            />
            {uploadState === 'processing' && (
              <button className={styles.cancelUpload} type="button" onClick={() => cancelUpload()}>{text.cancelUpload}</button>
            )}
            <p className={styles.uploadGuidance} id="upload-guidance">{text.privacy}</p>
            <p className={styles.uploadStatus} id="upload-status" role="status" aria-live="polite" aria-atomic="true">{uploadStatus}</p>
            {photoReady && selectedFileName && (
              <p className={styles.selectedFile}><span>{text.fileSelected}</span><strong>{selectedFileName}</strong></p>
            )}
            {uploadError && (
              <p className={styles.uploadError} role="alert" aria-atomic="true">
                <strong>{failedFileName}</strong><span>{uploadError}</span>
              </p>
            )}
            {confirmUpload && pendingUpload && (
              <div className={styles.confirmPanel} role="group" aria-label={text.confirmUploadLabel}>
                <div className={styles.pendingPhoto}>
                  <span className={styles.pendingThumb} aria-hidden="true">
                    <Image src={pendingUpload.imageUrl} alt="" fill sizes="72px" />
                  </span>
                  <p>{text.confirmUploadMessage}<strong>{pendingUpload.fileName}</strong></p>
                </div>
                <button ref={confirmUploadRef} className={styles.confirmAction} type="button" onClick={() => applyPreparedUpload(pendingUpload, true)}>
                  {text.confirmUploadAction}<span aria-hidden="true">↗</span>
                </button>
                <button className={styles.cancelConfirm} type="button" onClick={cancelPendingUpload}>{text.cancelReplace}</button>
              </div>
            )}
            <div className={styles.uploadTips}>
              <p>{text.photoTipsTitle}</p>
              <ul>
                <li>{text.photoTipFocus}</li>
                <li>{text.photoTipLight}</li>
              </ul>
            </div>
          </section>

          <aside className={styles.previewPanel} aria-labelledby="preview-title" data-has-photo={showCardPreview} data-sample={activeSample}>
            <header className={styles.previewHeading}>
              <div>
                <p className={styles.eyebrow}>{showCardPreview ? text.previewLabel : text.samplePreviewLabel}</p>
                <h2 id="preview-title">{templateNames[selectedTemplate]}</h2>
              </div>
              {photoReady && <span className={styles.previewReady} aria-hidden="true">✓</span>}
            </header>

            <div className={styles.previewStage}>
              {showCardPreview ? (
                <div role="img" aria-label={previewSummary}>
                  <CardPreview data={previewData} locale={locale} className={styles.previewCard} />
                </div>
              ) : (
                <div className={styles.sampleArtwork} role="img" aria-label={text.samplePreviewLabel}>
                  <Image src={conerSample.screenshots[activeSample].optimized} alt="" fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 45vw, 36vw" />
                  <span>{text.samplePreviewLabel}</span>
                </div>
              )}
            </div>

            {photoReady && (
              <button ref={continueToEditorRef} className={styles.continueButton} type="button" onClick={() => router.push('/editor')}>
                {text.continueToEditor}<span aria-hidden="true">↗</span>
              </button>
            )}

            <section className={styles.sampleSection} aria-labelledby="sample-option-title">
              <header className={styles.sampleHeading}>
                <h3 id="sample-option-title">{text.sampleTitle}</h3>
                <p>{text.sampleDescription}</p>
              </header>
              <div className={styles.sampleChoices} role="group" aria-label={text.sampleTitle}>
                {(['portrait', 'landscape'] as const).map((role) => {
                  const active = activeSample === role;
                  const label = role === 'portrait' ? text.portraitSample : text.landscapeSample;
                  return (
                    <button
                      className={styles.sampleChoice}
                      type="button"
                      key={role}
                      data-role={role}
                      disabled={uploadState === 'processing' || confirmUpload}
                      aria-pressed={active}
                      aria-label={`${label}${active ? locale === 'ko' ? ' · 선택됨' : locale === 'ja' ? ' · 選択中' : ' · selected' : ''}`}
                      onClick={() => { setActiveSample(role); if (confirmSample) setPendingSample(role); }}
                      ref={(node) => { sampleTriggerRefs.current[role] = node; }}
                    >
                      <span className={styles.sampleThumb} aria-hidden="true">
                        <Image src={conerSample.screenshots[role].optimized} alt="" fill sizes="(max-width: 760px) 72px, 96px" />
                      </span>
                      <span>{label}</span>
                      <span className={styles.sampleMark} aria-hidden="true">{active ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
              {confirmSample ? (
                <div className={styles.sampleConfirm} role="group" aria-label={text.confirmLabel}>
                  <p>{text.confirmMessage}</p>
                  <button ref={confirmSampleRef} className={styles.sampleAction} type="button" onClick={openSampleInEditor}>
                    <span>{text.confirmReplace}</span><span aria-hidden="true">↗</span>
                  </button>
                  <button className={styles.cancelConfirm} type="button" onClick={() => { setConfirmSample(false); setPendingSample(null); }}>{text.cancelReplace}</button>
                </div>
              ) : (
                <button className={styles.sampleAction} type="button" disabled={uploadState === 'processing' || confirmUpload} onClick={startWithSample}>
                  <span>{text.sampleAction}</span><span aria-hidden="true">↗</span>
                </button>
              )}
            </section>

            {currentDraftData && !photoReady && uploadState !== 'processing' && !confirmUpload && (
              <Link className={styles.resumeLink} href="/editor">
                {text.resumeDraft}<span aria-hidden="true">↗</span>
              </Link>
            )}
          </aside>
        </main>

        <footer className={styles.siteFooter}>
          <FFXIVAttribution locale={locale} officialAssetsUsed service={currentDraftData?.character.service === 'korea' ? 'KOREA' : 'GLOBAL'} />
        </footer>
      </div>
    </div>
  );
}
