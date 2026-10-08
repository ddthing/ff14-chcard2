'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { CardPreview, loadCardPreviewFonts } from '@/components/editor/card-preview';
import { FFXIVAttribution } from '@/components/ffxiv';
import type { CardRatio } from '@/components/cards/types';
import { getJob, localizeFfxivLabel } from '@/data/ffxiv';
import { resolveJobIcon } from '@/lib/ffxiv-assets';
import { conerSample } from '@/data/samples/coner';
import { useI18n, type Locale } from '@/lib/i18n';
import {
  CARD_EXPORT_SCALES,
  createCardExportSnapshot,
  downloadCardBlob,
  getCardExportLogicalDimensions,
  getCardExportSize,
  renderCardBlob,
  withCardRatio,
  CardExportError,
  type CardExportErrorCode,
  type CardExportSnapshot,
  type CardExportFormat,
  type CardExportProgress,
  type CardExportScale,
} from '@/lib/card-export';
import { useEditorStore } from '@/store/editor-store';
import { profileCount, profileStart } from '@/lib/performance-profile';
import styles from './export.module.css';

const MemoizedCardPreview = memo(CardPreview);
const mainRatioClasses: Record<CardRatio, string> = {
  '1:1': styles.mainRatio_1_1,
  '4:5': styles.mainRatio_4_5,
  '3:4': styles.mainRatio_3_4,
  '9:16': styles.mainRatio_9_16,
  '16:9': styles.mainRatio_16_9,
};
const printRatioClasses: Record<CardRatio, string> = {
  '1:1': styles.printRatio_1_1,
  '4:5': styles.printRatio_4_5,
  '3:4': styles.printRatio_3_4,
  '9:16': styles.printRatio_9_16,
  '16:9': styles.printRatio_16_9,
};

const copy = {
  ko: {
    eyebrow: '완성된 카드',
    titleStart: '모험가 카드가',
    titleEnd: '준비됐어요.',
    intro: '해상도와 파일 형식을 고른 뒤, 완성된 카드를 저장하세요.',
    exportLabel: '카드 저장',
    resolution: '해상도',
    format: '파일 형식',
    download: '카드 다운로드',
    preview: '완성 카드 미리보기',
    sample: 'Coner 예시 스크린샷 · 미리보기 이미지입니다.',
    local: '내 스크린샷 · 이 기기에만 저장됩니다.',
    quality: '카드만 내보내며 편집 도구는 이미지에 포함되지 않습니다.',
    capped: '메모리 사용을 줄이기 위해 출력 크기를 제한했습니다.',
    pdf: 'PDF로 인쇄',
    edit: '계속 편집',
    template: '템플릿',
    layout: '레이아웃',
    ratio: '비율',
    level: '레벨',
    otherRatios: '다른 비율 미리보기',
    otherRatiosHint: '같은 정보와 이미지를 사용해 구도에 맞게 다시 배치합니다.',
    preparing: '내보내기를 준비하고 있어요…',
    fonts: '글꼴과 카드 이미지를 준비하고 있어요…',
    image: '이미지를 확인하고 있어요…',
    render: '고해상도 카드를 만들고 있어요…',
    downloadStatus: '다운로드를 준비했어요.',
    exportProgress: '내보내기 진행 상황',
    success: '{format} 카드 이미지 다운로드를 시작했어요 · {width} × {height} px',
    failed: '내보내기에 실패했어요. 다시 시도해 주세요.',
    fontTimeout: '글꼴을 준비하는 데 시간이 오래 걸려요. 연결을 확인하고 다시 시도해 주세요.',
    fontFailed: '일부 글꼴을 불러오지 못했어요. 다시 시도해 주세요.',
    imageTimeout: '카드 이미지를 불러오는 데 시간이 오래 걸려요. 다시 시도해 주세요.',
    imageFailed: '카드 이미지를 읽지 못했어요. 이미지를 다시 선택하거나 다시 시도해 주세요.',
    opticalTimeout: '카드 글자 배치를 마치지 못했어요. 다시 시도해 주세요.',
    rendererTimeout: '내보내기 도구를 준비하는 데 시간이 오래 걸려요. 다시 시도해 주세요.',
    rendererFailed: '내보내기 도구를 불러오지 못했어요. 다시 시도해 주세요.',
    renderTimeout: '카드 이미지 생성 시간이 초과됐어요. 낮은 해상도로 다시 시도해 주세요.',
    renderFailed: '카드 이미지를 만들지 못했어요. 낮은 해상도로 다시 시도해 주세요.',
    webpUnsupported: '이 브라우저에서 WebP를 만들 수 없어요. PNG를 선택해 주세요.',
    sizeMismatch: '생성된 카드 크기를 확인하지 못했어요. 낮은 해상도로 다시 시도해 주세요.',
    downloadFailed: '다운로드를 시작하지 못했어요. 다시 시도해 주세요.',
    idCard: '어드벤처러 ID',
    cinematic: '시네마틱',
    editorial: '에디토리얼',
    pixel: '픽셀',
    current: '선택됨',
    previewLabel: '미리보기',
  },
  en: {
    eyebrow: 'Your finished card',
    titleStart: 'YOUR CARD IS',
    titleEnd: 'READY TO KEEP.',
    intro: 'Choose a size and file type, then save the finished card.',
    exportLabel: 'Save your card',
    resolution: 'Resolution',
    format: 'File format',
    download: 'Download card',
    preview: 'Finished card preview',
    sample: 'Coner sample screenshot · shown for preview.',
    local: 'Your screenshot · stored on this device.',
    quality: 'Only the card is exported. Editor controls are left out.',
    capped: 'Output dimensions were capped to reduce memory use.',
    pdf: 'Print as PDF',
    edit: 'Continue editing',
    template: 'Template',
    layout: 'Layout',
    ratio: 'Ratio',
    level: 'Level',
    otherRatios: 'Other ratio previews',
    otherRatiosHint: 'The same character and image are rearranged to fit each composition.',
    preparing: 'Preparing export…',
    fonts: 'Preparing type and card artwork…',
    image: 'Checking card images…',
    render: 'Rendering your high resolution card…',
    downloadStatus: 'Preparing your download…',
    exportProgress: 'Export progress',
    success: '{format} card download started · {width} × {height} px',
    failed: 'Export failed. Please try again.',
    fontTimeout: 'Fonts took too long to load. Check your connection and try again.',
    fontFailed: 'Some card fonts could not be loaded. Please try again.',
    imageTimeout: 'Card images took too long to load. Please try again.',
    imageFailed: 'A card image could not be decoded. Re-select the image or try again.',
    opticalTimeout: 'Card typography did not finish laying out. Please try again.',
    rendererTimeout: 'The export tool took too long to load. Please try again.',
    rendererFailed: 'The export tool could not be loaded. Please try again.',
    renderTimeout: 'Card rendering timed out. Try a lower resolution.',
    renderFailed: 'The card image could not be created. Try a lower resolution.',
    webpUnsupported: 'This browser could not create WebP. Choose PNG instead.',
    sizeMismatch: 'The card image dimensions could not be verified. Try a lower resolution.',
    downloadFailed: 'The download could not be started. Please try again.',
    idCard: 'Adventurer ID',
    cinematic: 'Cinematic',
    editorial: 'Editorial',
    pixel: 'px',
    current: 'CURRENT',
    previewLabel: 'PREVIEW',
  },
  ja: {
    eyebrow: '完成したカード',
    titleStart: '冒険者カードが',
    titleEnd: '完成しました。',
    intro: '解像度とファイル形式を選び、完成したカードを保存します。',
    exportLabel: 'カードを保存',
    resolution: '解像度',
    format: 'ファイル形式',
    download: 'カードをダウンロード',
    preview: '完成カードのプレビュー',
    sample: 'Conerのサンプルスクリーンショット · プレビュー用の画像です。',
    local: 'あなたのスクリーンショット · この端末に保存されます。',
    quality: 'カードのみを書き出します。エディターの操作画面は含まれません。',
    capped: 'メモリ使用量を抑えるため出力サイズを制限しました。',
    pdf: 'PDFで印刷',
    edit: '編集を続ける',
    template: 'テンプレート',
    layout: 'レイアウト',
    ratio: '比率',
    level: 'レベル',
    otherRatios: '別の比率でプレビュー',
    otherRatiosHint: '同じ情報と画像を使い、構成に合わせて配置し直します。',
    preparing: '書き出しを準備しています…',
    fonts: '文字とカード画像を準備しています…',
    image: '画像を確認しています…',
    render: '高解像度カードを作成しています…',
    downloadStatus: 'ダウンロードを準備しました。',
    exportProgress: '書き出しの進行状況',
    success: '{format}カード画像のダウンロードを開始しました · {width} × {height} px',
    failed: '書き出しに失敗しました。もう一度お試しください。',
    fontTimeout: 'フォントの読み込みに時間がかかっています。接続を確認して再試行してください。',
    fontFailed: '一部のフォントを読み込めませんでした。もう一度お試しください。',
    imageTimeout: 'カード画像の読み込みに時間がかかっています。もう一度お試しください。',
    imageFailed: 'カード画像を読み取れませんでした。画像を選び直して再試行してください。',
    opticalTimeout: 'カードの文字配置が完了しませんでした。もう一度お試しください。',
    rendererTimeout: '書き出し機能の準備に時間がかかっています。再試行してください。',
    rendererFailed: '書き出し機能を読み込めませんでした。もう一度お試しください。',
    renderTimeout: 'カード画像の生成がタイムアウトしました。解像度を下げて再試行してください。',
    renderFailed: 'カード画像を作成できませんでした。解像度を下げて再試行してください。',
    webpUnsupported: 'このブラウザーでは WebP を作成できません。PNG を選んでください。',
    sizeMismatch: '生成したカードのサイズを確認できませんでした。解像度を下げて再試行してください。',
    downloadFailed: 'ダウンロードを開始できませんでした。もう一度お試しください。',
    idCard: 'アドベンチャラー ID',
    cinematic: 'シネマティック',
    editorial: 'エディトリアル',
    pixel: 'px',
    current: '選択中',
    previewLabel: 'プレビュー',
  },
} satisfies Record<Locale, Record<string, string>>;

function getStageLabel(stage: CardExportProgress['stage'], labels: typeof copy.ko) {
  switch (stage) {
    case 'fonts': return labels.fonts;
    case 'image': return labels.image;
    case 'render': return labels.render;
    case 'download': return labels.downloadStatus;
  }
}

function getCardAccessibleSummary(locale: Locale, name: string, job: string, world: string, ratio: CardRatio) {
  const identity = [name, job, world]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' · ');
  switch (locale) {
    case 'ko': return [identity, `${ratio} 모험가 카드`].filter(Boolean).join(' · ');
    case 'ja': return [identity, `${ratio}の冒険者カード`].filter(Boolean).join(' · ');
    case 'en': return [identity, `${ratio} adventurer card`].filter(Boolean).join(' · ');
  }
}

function getExportErrorMessage(error: unknown, labels: typeof copy.ko): string {
  if (!(error instanceof CardExportError)) return labels.failed;
  const messages: Partial<Record<CardExportErrorCode, string>> = {
    'font-timeout': labels.fontTimeout,
    'font-load-failed': labels.fontFailed,
    'image-timeout': labels.imageTimeout,
    'image-failed': labels.imageFailed,
    'optical-timeout': labels.opticalTimeout,
    'asset-timeout': labels.imageTimeout,
    'renderer-timeout': labels.rendererTimeout,
    'renderer-load-failed': labels.rendererFailed,
    'render-timeout': labels.renderTimeout,
    'render-failed': labels.renderFailed,
    'webp-unsupported': labels.webpUnsupported,
    'size-mismatch': labels.sizeMismatch,
    'download-failed': labels.downloadFailed,
  };
  return messages[error.code] ?? labels.failed;
}

function getExportErrorAction(error: unknown): 'format' | 'resolution' | 'download' {
  if (!(error instanceof CardExportError)) return 'download';
  if (error.code === 'webp-unsupported') return 'format';
  if (error.code === 'render-timeout' || error.code === 'render-failed' || error.code === 'size-mismatch') return 'resolution';
  return 'download';
}

export default function ExportPage() {
  const { locale } = useI18n();
  const character = useEditorStore((state) => state.character);
  const design = useEditorStore((state) => state.design);
  const image = useEditorStore((state) => state.image);
  const isHydrated = useEditorStore((state) => state.isHydrated);
  const hydrate = useEditorStore((state) => state.hydrate);
  const [format, setFormat] = useState<CardExportFormat>('png');
  const [scale, setScale] = useState<CardExportScale>(2);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<CardExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<'format' | 'resolution' | 'download' | null>(null);
  const [status, setStatus] = useState('');
  const [exportSnapshot, setExportSnapshot] = useState<CardExportSnapshot | null>(null);
  const text = copy[exportSnapshot?.locale ?? locale];
  const exportSurfaceRef = useRef<HTMLDivElement>(null);
  const activeExportRef = useRef<{ controller: AbortController } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const activeExport = activeExportRef.current;
      activeExportRef.current = null;
      activeExport?.controller.abort();
    };
  }, []);

  const data = useMemo(() => ({
    character,
    design,
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
  const renderData = useMemo(() => withCardRatio(data, data.design.ratio), [data]);
  const viewData = exportSnapshot?.data ?? data;
  const viewRenderData = exportSnapshot?.data ?? renderData;
  const viewLocale = exportSnapshot?.locale ?? locale;
  const viewFormat = exportSnapshot?.format ?? format;
  const viewScale = exportSnapshot?.scale ?? scale;
  const job = getJob(viewData.character.jobId ?? viewData.character.job);
  const jobLabel = localizeFfxivLabel('job', viewData.character.jobId ?? viewData.character.job, viewLocale);
  const worldLabel = localizeFfxivLabel('world', viewData.character.worldId ?? viewData.character.world, viewLocale);
  const previewSummary = getCardAccessibleSummary(viewLocale, viewData.character.name, jobLabel, worldLabel, viewData.design.ratio);
  const isMasterLayout = (viewData.design.layoutVariant ?? 'a') === 'a';
  const jobIconUsage = viewData.design.template === 'id-card'
    ? isMasterLayout ? 'cardMedium' : 'micro'
    : viewData.design.template === 'editorial' && !isMasterLayout ? 'cardDisplay' : 'cardSmall';
  const officialAssetsUsed = Boolean(
    viewData.design.jobMotifVisible !== false &&
    resolveJobIcon({ jobId: job?.id, usage: jobIconUsage }),
  );
  const activeTemplate = viewData.design.template === 'id-card'
    ? text.idCard
    : viewData.design.template === 'editorial' ? text.editorial : text.cinematic;
  const dimensions = getCardExportSize(viewData.design.ratio, viewScale);
  const logicalDimensions = getCardExportLogicalDimensions(viewData.design.ratio);
  const sampleArtwork = Object.values(conerSample.screenshots).some((screenshot) => viewData.imageUrl === screenshot.optimized);
  const renderedProgress = progress?.progress ?? (exporting ? 0.04 : 0);
  const handleDownload = useCallback(async () => {
    if (activeExportRef.current) return;
    profileCount('export.page.calls');
    const finishExportTiming = profileStart('export.page.total', {
      format,
      scale,
      ratio: renderData.design.ratio,
    });
    const operation = { controller: new AbortController() };
    activeExportRef.current = operation;
    const { signal } = operation.controller;
    const isCurrent = () => mountedRef.current && activeExportRef.current === operation && !signal.aborted;

    try {
      const finishSnapshotTiming = profileStart('export.page.snapshot');
      const snapshot = createCardExportSnapshot(renderData, locale, format, scale);
      finishSnapshotTiming();
      // Commit the immutable job into the hidden export surface before reading
      // it. The app header may change locale while this render is in flight.
      const finishMountTiming = profileStart('export.page.hiddenSurfaceCommit');
      flushSync(() => {
        setExportSnapshot(snapshot);
        setError(null);
        setErrorAction(null);
        setExporting(true);
        setProgress({ stage: 'fonts', progress: 0.04 });
        setStatus(text.preparing);
      });
      const node = exportSurfaceRef.current?.querySelector<HTMLElement>('article');
      finishMountTiming();
      if (!node) throw new CardExportError('render-failed');

      const finishFontsTiming = profileStart('export.page.fontsReady', { locale: snapshot.locale });
      try {
        await loadCardPreviewFonts(snapshot.data, snapshot.locale, { signal, source: 'export' });
      } finally {
        finishFontsTiming();
      }
      if (!isCurrent()) return;

      const finishRenderTiming = profileStart('export.page.render');
      let rendered: Awaited<ReturnType<typeof renderCardBlob>>;
      try {
        rendered = await renderCardBlob(node, snapshot.data, snapshot.format, snapshot.scale, (nextProgress) => {
          if (!isCurrent()) return;
          setProgress(nextProgress);
          setStatus(getStageLabel(nextProgress.stage, text));
        }, { signal });
      } finally {
        finishRenderTiming();
      }
      if (!isCurrent()) return;

      profileCount('export.blob.created');
      profileCount('export.blob.bytes', rendered.blob.size);
      const finishDispatchTiming = profileStart('export.page.downloadDispatch', {
        format: snapshot.format,
        scale: snapshot.scale,
        bytes: rendered.blob.size,
      });
      try {
        downloadCardBlob(rendered.blob, snapshot.data, snapshot.format, snapshot.scale);
      } finally {
        finishDispatchTiming();
      }
      setProgress({ stage: 'download', progress: 1 });
      setStatus(text.success
        .replace('{format}', snapshot.format.toUpperCase())
        .replace('{width}', rendered.size.width.toLocaleString())
        .replace('{height}', rendered.size.height.toLocaleString()));
    } catch (caught) {
      if (isCurrent()) {
        setError(getExportErrorMessage(caught, text));
        setErrorAction(getExportErrorAction(caught));
        setStatus('');
      }
    } finally {
      if (activeExportRef.current === operation) {
        activeExportRef.current = null;
        if (mountedRef.current) {
          setExportSnapshot(null);
          setExporting(false);
        }
      }
      finishExportTiming();
    }
  }, [format, locale, renderData, scale, text]);

  if (!isHydrated) {
    return <div className={styles.loadingState} role="status">{text.preparing}</div>;
  }

  const renderBaseStyle = { '--export-card-width': `${logicalDimensions.width}px` } as CSSProperties;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}><span />{text.eyebrow}</p>
            <h1 className={styles.title}>
              {text.titleStart}
              <span>{text.titleEnd}</span>
            </h1>
            <p className={styles.intro}>{text.intro}</p>
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.previewPanel} aria-label={text.preview}>
            <div className={styles.previewHeader}>
              <span>{text.preview}</span>
              <span>{viewData.design.ratio}</span>
            </div>
            <div className={styles.previewStage} role="img" aria-label={previewSummary}>
              <div aria-hidden="true">
                <MemoizedCardPreview key={`${viewData.design.template}-${viewData.design.layoutVariant}-${viewData.design.ratio}`} data={viewRenderData} className={`${styles.mainCard} ${mainRatioClasses[viewData.design.ratio]}`} locale={viewLocale} />
              </div>
            </div>
            <div className={styles.previewFooter}>
              <div className={styles.previewIdentity}>
                <strong>{viewData.character.name}</strong>
                <span>{jobLabel} · {worldLabel}</span>
              </div>
              <div className={styles.previewDimensions}>
                <span>{sampleArtwork ? text.sample : text.local}</span>
                <strong>{dimensions.width.toLocaleString()} × {dimensions.height.toLocaleString()} {text.pixel}</strong>
              </div>
            </div>
          </section>

          <aside className={styles.exportPanel} aria-labelledby="export-settings-label">
            <p className={styles.sectionLabel} id="export-settings-label">{text.exportLabel}</p>
            <h2 className={styles.characterName} id="export-settings-title">{viewData.character.name}</h2>
            <p className={styles.identity}>{activeTemplate}<span>·</span>{viewData.design.ratio}</p>

            <div className={styles.optionGroup}>
              <div className={styles.controlLabel}><span id="export-format-label">{text.format}</span><span>{viewFormat.toUpperCase()}</span></div>
              <div className={styles.segmented} data-count="2" role="group" aria-labelledby="export-format-label" aria-describedby={errorAction === 'format' ? 'export-feedback' : undefined}>
                {(['png', 'webp'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={viewFormat === value}
                    className={viewFormat === value ? styles.selected : undefined}
                    disabled={exporting}
                    onClick={() => setFormat(value)}
                  >{value.toUpperCase()}</button>
                ))}
              </div>
            </div>

            <div className={styles.optionGroup}>
              <div className={styles.controlLabel}><span id="export-resolution-label">{text.resolution}</span><span>{viewScale}×</span></div>
              <div className={styles.segmented} data-count={CARD_EXPORT_SCALES.length} role="group" aria-labelledby="export-resolution-label" aria-describedby={errorAction === 'resolution' ? 'export-feedback' : 'export-dimensions'}>
                {CARD_EXPORT_SCALES.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={viewScale === value}
                    className={viewScale === value ? styles.selected : undefined}
                    disabled={exporting}
                    onClick={() => setScale(value)}
                  >{value}×</button>
                ))}
              </div>
              <p className={styles.dimensions} id="export-dimensions">
                <span>{text.pixel}</span>
                <strong>{dimensions.width.toLocaleString()} × {dimensions.height.toLocaleString()}</strong>
              </p>
              {dimensions.capped && <p className={styles.cappedNote}>{text.capped}</p>}
            </div>

            <button className={styles.downloadButton} type="button" onClick={handleDownload} aria-disabled={exporting} aria-busy={exporting} aria-describedby={error ? 'export-feedback' : undefined}>
              <span>{`${text.download} · ${viewFormat.toUpperCase()} ${viewScale}×`}</span>
              <span aria-hidden="true">{exporting ? '…' : '↓'}</span>
            </button>
            {(exporting || error || status) && (
              <>
                {exporting && <div className={styles.progressTrack} role="progressbar" aria-label={text.exportProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(renderedProgress * 100)}><div className={styles.progressBar} style={{ width: `${Math.max(5, renderedProgress * 100)}%` }} /></div>}
                <p id="export-feedback" className={`${styles.statusText} ${error ? styles.errorText : ''}`} data-feedback={progress?.stage === 'download' && !exporting ? 'success' : undefined} role={error ? 'alert' : 'status'}>{error || status}</p>
              </>
            )}
            <div className={styles.smallActions}>
              <button type="button" className={styles.pdfButton} onClick={() => window.print()}>{text.pdf}</button>
              <Link className={styles.editLink} href="/editor">← {text.edit}</Link>
            </div>
            <p className={styles.note}>{text.quality}</p>
            <FFXIVAttribution locale={viewLocale} className={styles.rightsNote} officialAssetsUsed={officialAssetsUsed} service={viewData.character.service === 'korea' ? 'KOREA' : 'GLOBAL'} />
          </aside>
        </div>

      </div>

      <div ref={exportSurfaceRef} className={styles.exportSurface} aria-hidden="true" style={renderBaseStyle}>
        <div className={styles.renderFrame}>
          <MemoizedCardPreview data={viewRenderData} className={styles.renderCard} locale={viewLocale} />
        </div>
      </div>

      <div className={styles.printOnly} aria-hidden="true">
        <MemoizedCardPreview data={viewRenderData} className={`${styles.printCard} ${printRatioClasses[viewData.design.ratio]}`} locale={viewLocale} />
      </div>

    </div>
  );
}
