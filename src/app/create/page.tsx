'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CardPreview } from '@/components/editor/card-preview';
import { getUploadErrorMessage } from '@/components/editor/editor-errors';
import {
  hasFileTransfer,
  transitionUploadInteractionState,
  updateFileDragDepth,
  type UploadInteractionState,
} from '@/components/editor/editor-interaction';
import { registerUploadCancellation } from '@/components/editor/upload-session';
import { FFXIVAttribution } from '@/components/ffxiv';
import { useI18n } from '@/lib/i18n';
import { ImageProcessingError, isImageProcessingCancelled, prepareImageFile } from '@/lib/image-processing';
import { demoAdventurerData, getConerSample, type AdventurerCardData } from '@/components/cards/types';
import { EditorIcon } from '@/components/editor/editor-icon';
import { normalizeCardData } from '@/store/editor-persistence';
import { editorStore } from '@/store/editor-store';
import { getSampleConfirmationFocusTarget, hasNonSampleDraft } from './create-draft';
import { createEntryCopy } from './create.copy';
import styles from './create.module.css';

const canonicalSample = getConerSample('cinematic', '4:5');
const normalizedDefaultSample = normalizeCardData(demoAdventurerData);
const masterCodes = { cinematic: 'C2', editorial: 'E2', 'id-card': 'I3' } as const;

export default function CreatePage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = createEntryCopy[locale];
  const [previewData, setPreviewData] = useState<AdventurerCardData>(canonicalSample);
  const previewTemplate = previewData.design.template;
  const previewTemplateName = {
    cinematic: text.cinematic,
    editorial: text.editorial,
    'id-card': text.identity,
  }[previewTemplate];
  const [hasExistingDraft, setHasExistingDraft] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [uploadState, setUploadState] = useState<UploadInteractionState>('idle');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmReplaceRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingSample = useRef(false);
  const uploadToken = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    const target = getSampleConfirmationFocusTarget(confirmSample, wasConfirmingSample.current);
    wasConfirmingSample.current = confirmSample;
    if (target === 'confirmation') confirmReplaceRef.current?.focus();
    if (target === 'trigger') sampleTriggerRef.current?.focus();
  }, [confirmSample]);

  const cancelUpload = useCallback((resetFeedback = true) => {
    uploadToken.current += 1;
    uploadController.current?.abort();
    uploadController.current = null;
    dragDepth.current = 0;
    if (mounted.current && resetFeedback) {
      setUploadState((state) => transitionUploadInteractionState(state, 'cancel'));
      setUploadError('');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unregister = registerUploadCancellation(() => cancelUpload());
    const updateDraftPresence = () => {
      const state = editorStore.getState();
      if (!state.isHydrated) return;
      setHasExistingDraft(hasNonSampleDraft(state.toCardData(), normalizedDefaultSample));
    };
    const unsubscribeDraft = editorStore.subscribe(updateDraftPresence);
    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (uploadController.current && state.image !== previous.image) cancelUpload();
    });
    editorStore.getState().hydrate();
    updateDraftPresence();

    return () => {
      mounted.current = false;
      unsubscribeDraft();
      unsubscribe();
      unregister();
      cancelUpload(false);
    };
  }, [cancelUpload]);

  const acceptImage = useCallback(async (file?: File) => {
    if (!file || uploadController.current) return;

    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();

    const token = uploadToken.current + 1;
    uploadToken.current = token;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploadError('');
    setUploadState((state) => transitionUploadInteractionState(state, 'processing'));

    try {
      const prepared = await prepareImageFile(file, { signal: controller.signal });
      if (uploadToken.current !== token || !mounted.current) return;

      // The editor owns the persisted image state; this entry only prepares it
      // and hands the same processed image into that established store action.
      uploadController.current = null;
      editorStore.getState().replaceUploadedImage({
        src: prepared.imageUrl,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
      }, prepared.palette);
      setPreviewData(editorStore.getState().toCardData());
      setUploadState((state) => transitionUploadInteractionState(state, 'success'));
      setConfirmSample(false);
    } catch (error) {
      if (uploadToken.current !== token || !mounted.current || isImageProcessingCancelled(error)) return;
      const code = error instanceof ImageProcessingError ? error.code : 'decode-failed';
      setUploadError(getUploadErrorMessage(code, locale));
      setUploadState((state) => transitionUploadInteractionState(state, 'error'));
    } finally {
      if (uploadToken.current === token) uploadController.current = null;
    }
  }, [locale]);

  const openSampleInEditor = () => {
    cancelUpload();
    setConfirmSample(false);
    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();
    editorStore.getState().replaceCardData(canonicalSample, { recordHistory: false });
    router.push('/editor');
  };

  const startWithSample = () => {
    const store = editorStore.getState();
    if (!store.isHydrated) store.hydrate();
    if (hasNonSampleDraft(editorStore.getState().toCardData(), normalizedDefaultSample)) {
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
    void acceptImage(event.dataTransfer.files?.[0]);
  };

  const uploadStatus = uploadState === 'drag-over'
    ? text.dropActive
    : uploadState === 'processing'
      ? text.processing
      : uploadState === 'success'
        ? text.success
        : '';

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.introHeader}>
          <p className={styles.eyebrow}><span aria-hidden="true" />{text.eyebrow}</p>
          <h1 className={styles.title}>
            {text.titleStart} <span>{text.titleEnd}</span>
          </h1>
          <p className={styles.intro}>{text.intro}</p>
        </header>

        <div className={styles.layout}>
          <section className={styles.entryOptions} aria-label={text.pathsLabel}>
            <section className={styles.sampleOption} aria-labelledby="sample-option-title">
              <div className={styles.sampleCopy}>
                <h2 id="sample-option-title">{text.sampleTitle}</h2>
                <p>{text.sampleDescription}</p>
              </div>
              {confirmSample ? (
                <div className={styles.sampleConfirm} role="group" aria-label={text.confirmLabel}>
                  <p id="sample-confirm-message">{text.confirmMessage}</p>
                  <button
                    ref={confirmReplaceRef}
                    className={styles.sampleButton}
                    type="button"
                    aria-describedby="sample-confirm-message"
                    onClick={openSampleInEditor}
                  >
                    <span>{text.confirmReplace}</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                  <button className={styles.cancelConfirm} type="button" onClick={() => setConfirmSample(false)}>{text.cancelReplace}</button>
                </div>
              ) : (
                <button ref={sampleTriggerRef} className={styles.sampleButton} type="button" onClick={startWithSample}>
                  <span>{text.sampleAction}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              )}
              {hasExistingDraft && (
                <Link className={styles.resumeLink} href="/editor">{text.resumeDraft}</Link>
              )}
            </section>

            <div className={styles.orDivider}><span>{text.or}</span></div>

            <section className={styles.uploadOption} aria-labelledby="upload-option-title">
              <div className={styles.uploadHeading}>
                <div>
                  <h2 id="upload-option-title">{text.uploadTitle}</h2>
                  <p>{text.uploadDescription}</p>
                </div>
              </div>

              <div
                className={styles.dropZone}
                data-state={uploadState}
                aria-busy={uploadState === 'processing'}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <span className={styles.uploadSymbol} aria-hidden="true">
                  <EditorIcon name="upload" size={24} />
                </span>
                <strong>{uploadState === 'drag-over' ? text.dropActive : text.dropIdle}</strong>
                <span className={styles.fileTypes}>{text.fileTypes}</span>
                <button
                  className={styles.chooseButton}
                  type="button"
                  disabled={uploadState === 'processing'}
                  onClick={() => fileInputRef.current?.click()}
                  aria-describedby="upload-guidance upload-status"
                >{text.chooseFile}</button>
                <input
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={text.uploadTitle}
                  tabIndex={-1}
                  onChange={handleFileChange}
                />
              </div>
              <p className={styles.uploadGuidance} id="upload-guidance">{text.privacy}</p>
              <p className={styles.uploadStatus} id="upload-status" role="status" aria-live="polite" aria-atomic="true">
                {uploadStatus}
              </p>
              {uploadState === 'success' && <button className={styles.continueButton} type="button" onClick={() => router.push('/editor')}>{text.continueToEditor}</button>}
              {uploadError && <p className={styles.uploadError} role="alert" aria-atomic="true">{uploadError}</p>}
            </section>

            <Link className={styles.templatesLink} href="/templates">
              {text.templatesLink}<span aria-hidden="true">→</span>
            </Link>
          </section>

          <figure className={styles.previewPanel} aria-label={text.previewLabel}>
            <div className={styles.previewHeader}>
              <span>{text.previewLabel}</span>
              <span aria-hidden="true">{previewData.design.ratio} · {masterCodes[previewTemplate]}</span>
            </div>
            <div className={styles.previewStage} role="img" aria-label={`${previewData.character.name} · ${previewTemplateName} · ${text.cardDescription}`}>
              <div className={styles.cardWrap} aria-hidden="true">
                <CardPreview data={previewData} className={styles.previewCard} locale={locale} />
              </div>
            </div>
            <figcaption className={styles.previewCaption}>
              <span><strong>{previewData.character.name}</strong> · {previewTemplateName}</span>
              <span>{text.masterPrefix} {masterCodes[previewTemplate]}</span>
            </figcaption>
          </figure>
        </div>

        <footer className={styles.siteFooter}>
          <FFXIVAttribution locale={locale} officialAssetsUsed service={previewData.character.service === 'korea' ? 'KOREA' : 'GLOBAL'} />
        </footer>
      </div>
    </div>
  );
}
