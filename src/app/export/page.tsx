'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { CardPreview, loadCardPreviewFonts } from '@/components/editor/card-preview';
import { FFXIVAttribution } from '@/components/ffxiv';
import type { CardRatio } from '@/components/cards/types';
import { getJob, localizeFfxivLabel } from '@/data/ffxiv';
import { resolveJobIcon } from '@/lib/ffxiv-assets';
import { prepareCardForPrint } from '@/lib/card-print';
import { conerSample } from '@/data/samples/coner';
import { useI18n, type Locale } from '@/lib/i18n';
import {
  CARD_EXPORT_SCALES,
  createCardExportSnapshot,
  downloadCardBlob,
  getCardExportFilename,
  getCardExportLogicalDimensions,
  getCardExportSize,
  renderCardBlob,
  waitForCardAssets,
  withCardRatio,
  CardExportError,
  type CardExportErrorCode,
  type CardExportSnapshot,
  type CardExportSize,
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
const resultRatioClasses: Record<CardRatio, string> = {
  '1:1': styles.resultRatio_1_1,
  '4:5': styles.resultRatio_4_5,
  '3:4': styles.resultRatio_3_4,
  '9:16': styles.resultRatio_9_16,
  '16:9': styles.resultRatio_16_9,
};

interface ExportDownload {
  snapshot: CardExportSnapshot;
  blob: Blob;
  size: CardExportSize;
  filename: string;
  renderDurationMs: number;
}

interface ActivePrintOperation {
  controller: AbortController;
  printInvoked: boolean;
}

type ResultBitmapStatus = 'loading' | 'ready' | 'error';

interface ResultBitmapState {
  blob: Blob;
  source: string;
  status: ResultBitmapStatus;
}

function ResultBitmapPreview({
  blob,
  width,
  height,
  alt,
  loadingLabel,
  errorLabel,
  className,
}: {
  blob: Blob;
  width: number;
  height: number;
  alt: string;
  loadingLabel: string;
  errorLabel: string;
  className: string;
}) {
  const [bitmap, setBitmap] = useState<ResultBitmapState | null>(null);
  const currentBitmap = bitmap?.blob === blob ? bitmap : null;
  const isLoading = !currentBitmap || currentBitmap.status === 'loading';
  const isError = currentBitmap?.status === 'error';

  useEffect(() => {
    let source: string | null = null;
    let isCurrent = true;
    const commitBitmap = (nextBitmap: ResultBitmapState) => {
      queueMicrotask(() => {
        if (isCurrent) setBitmap(nextBitmap);
      });
    };
    try {
      source = URL.createObjectURL(blob);
    } catch {
      commitBitmap({ blob, source: '', status: 'error' });
    }
    if (source) {
      commitBitmap({ blob, source, status: 'loading' });
    }

    return () => {
      isCurrent = false;
      if (source) URL.revokeObjectURL(source);
    };
  }, [blob]);

  const updateBitmapStatus = useCallback((source: string, status: ResultBitmapStatus) => {
    setBitmap((current) => current?.source === source ? { ...current, status } : current);
  }, []);

  return (
    <div
      className={`${className} ${styles.resultBitmapFrame}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      aria-busy={isLoading}
    >
      {isLoading && <p className={styles.resultBitmapPlaceholder} role="status">{loadingLabel}</p>}
      {isError && <p className={`${styles.resultBitmapPlaceholder} ${styles.resultBitmapError}`} role="alert">{errorLabel}</p>}
      {currentBitmap?.source && !isError && (
        <Image
          className={`${styles.resultBitmap} ${currentBitmap.status === 'ready' ? styles.resultBitmapReady : ''}`}
          src={currentBitmap.source}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          onLoad={() => updateBitmapStatus(currentBitmap.source, 'ready')}
          onError={() => updateBitmapStatus(currentBitmap.source, 'error')}
        />
      )}
    </div>
  );
}

const copy = {
  ko: {
    eyebrow: '내보내기',
    title: '완성 카드를 확인하세요.',
    intro: '카드 비율과 파일 형식, 출력 크기를 선택하세요.',
    resultEyebrow: '완성된 카드',
    resultTitle: '다운로드를 요청했어요.',
    downloadNotice: '브라우저에 다운로드를 요청했어요. 파일은 브라우저의 다운로드 목록에서 확인하세요.',
    resultPreviewLoading: '완성된 카드 이미지를 표시하고 있어요…',
    resultPreviewFailed: '이미지 미리보기를 표시하지 못했어요. 파일을 다시 다운로드할 수 있어요.',
    exportLabel: '카드 저장',
    resolution: '해상도',
    format: '파일 형식',
    ratioLabel: '카드 비율',
    download: '카드 다운로드',
    redownload: '다시 다운로드',
    redownloadStatus: '같은 파일을 다시 다운로드하도록 요청했어요.',
    retryDownload: '다운로드 다시 시도',
    retryPng: 'PNG로 다시 시도',
    retryLower: '{scale}×로 다시 시도',
    retrySame: '다시 시도',
    cancelExport: '내보내기 취소',
    cancelled: '내보내기를 취소했어요. 편집 내용은 그대로 있어요.',
    preview: '완성 카드 미리보기',
    sample: 'Coner 예시 스크린샷 · 미리보기 이미지입니다.',
    local: '내 스크린샷 · 이 기기에만 저장됩니다.',
    quality: '카드만 내보내며 편집 도구는 이미지에 포함되지 않습니다.',
    capped: '메모리 사용을 줄이기 위해 출력 크기를 제한했습니다.',
    pdf: '브라우저에서 인쇄',
    pdfHint: '브라우저 인쇄 창에서 PDF로 저장을 선택할 수 있어요.',
    printPreparing: '인쇄용 카드와 글꼴을 준비하고 있어요…',
    printFailed: '인쇄 미리보기를 준비하지 못했어요. 다시 시도해 주세요.',
    edit: '계속 편집',
    createNew: '새 카드 만들기',
    template: '템플릿',
    layout: '레이아웃',
    ratio: '비율',
    level: '레벨',
    cardDetails: '카드 정보',
    job: '직업',
    world: '월드',
    fileSize: '파일 크기',
    resultFormat: '형식',
    resultDimensions: '픽셀 크기',
    otherRatios: '다른 비율 미리보기',
    otherRatiosHint: '같은 정보와 이미지를 사용해 구도에 맞게 다시 배치합니다.',
    preparing: '내보내기를 준비하고 있어요…',
    fonts: '글꼴과 카드 이미지를 준비하고 있어요…',
    image: '이미지를 확인하고 있어요…',
    render: '고해상도 카드를 만들고 있어요…',
    downloadStatus: '다운로드를 준비했어요.',
    exportProgress: '내보내기 진행 상황',
    success: '{format} 다운로드를 브라우저에 요청했어요 · {width} × {height} px',
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
    idCard: '모험가 기록',
    cinematic: '시네마틱',
    editorial: '에디토리얼',
    pixel: '픽셀',
    current: '선택됨',
    previewLabel: '미리보기',
  },
  en: {
    eyebrow: 'Export',
    title: 'Review your finished card.',
    intro: 'Choose a card ratio, file type, and output size.',
    resultEyebrow: 'Finished card',
    resultTitle: 'Download requested.',
    downloadNotice: 'Your browser was asked to download this file. Check your browser’s download list for its status.',
    resultPreviewLoading: 'Preparing the exported image preview…',
    resultPreviewFailed: 'The image preview could not be displayed. You can still download the file again.',
    exportLabel: 'Save your card',
    resolution: 'Resolution',
    format: 'File format',
    ratioLabel: 'Card ratio',
    download: 'Download card',
    redownload: 'Download again',
    redownloadStatus: 'The same file was requested again.',
    retryDownload: 'Retry download',
    retryPng: 'Retry as PNG',
    retryLower: 'Retry at {scale}×',
    retrySame: 'Try again',
    cancelExport: 'Cancel export',
    cancelled: 'Export cancelled. Your draft is still here.',
    preview: 'Finished card preview',
    sample: 'Coner sample screenshot · shown for preview.',
    local: 'Your screenshot · stored on this device.',
    quality: 'Only the card is exported. Editor controls are left out.',
    capped: 'Output dimensions were capped to reduce memory use.',
    pdf: 'Print from browser',
    pdfHint: 'In the browser print dialog, choose Save as PDF if you need a PDF.',
    printPreparing: 'Preparing the card and type for printing…',
    printFailed: 'The print preview could not be prepared. Please try again.',
    edit: 'Continue editing',
    createNew: 'Create a new card',
    template: 'Template',
    layout: 'Layout',
    ratio: 'Ratio',
    level: 'Level',
    cardDetails: 'Card details',
    job: 'Job',
    world: 'World',
    fileSize: 'File size',
    resultFormat: 'Format',
    resultDimensions: 'Pixel size',
    otherRatios: 'Other ratio previews',
    otherRatiosHint: 'The same character and image are rearranged to fit each composition.',
    preparing: 'Preparing export…',
    fonts: 'Preparing type and card artwork…',
    image: 'Checking card images…',
    render: 'Rendering your high resolution card…',
    downloadStatus: 'Preparing your download…',
    exportProgress: 'Export progress',
    success: '{format} download requested by your browser · {width} × {height} px',
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
    idCard: 'Adventurer Record',
    cinematic: 'Cinematic',
    editorial: 'Editorial',
    pixel: 'px',
    current: 'CURRENT',
    previewLabel: 'PREVIEW',
  },
  ja: {
    eyebrow: '書き出し',
    title: '完成したカードを確認しましょう。',
    intro: 'カードの比率、ファイル形式、出力サイズを選択してください。',
    resultEyebrow: '完成したカード',
    resultTitle: 'ダウンロードをリクエストしました。',
    downloadNotice: 'ブラウザーにファイルのダウンロードをリクエストしました。状態はダウンロード一覧で確認できます。',
    resultPreviewLoading: '書き出したカード画像を表示しています…',
    resultPreviewFailed: '画像プレビューを表示できませんでした。ファイルは再ダウンロードできます。',
    exportLabel: 'カードを保存',
    resolution: '解像度',
    format: 'ファイル形式',
    ratioLabel: 'カードの比率',
    download: 'カードをダウンロード',
    redownload: 'もう一度ダウンロード',
    redownloadStatus: '同じファイルのダウンロードを再度リクエストしました。',
    retryDownload: 'ダウンロードを再試行',
    retryPng: 'PNGで再試行',
    retryLower: '{scale}×で再試行',
    retrySame: 'もう一度試す',
    cancelExport: '書き出しをキャンセル',
    cancelled: '書き出しをキャンセルしました。編集内容は保持されています。',
    preview: '完成カードのプレビュー',
    sample: 'Conerのサンプルスクリーンショット · プレビュー用の画像です。',
    local: 'あなたのスクリーンショット · この端末に保存されます。',
    quality: 'カードのみを書き出します。エディターの操作画面は含まれません。',
    capped: 'メモリ使用量を抑えるため出力サイズを制限しました。',
    pdf: 'ブラウザーで印刷',
    pdfHint: 'ブラウザーの印刷画面で「PDFに保存」を選べます。',
    printPreparing: '印刷用のカードと文字を準備しています…',
    printFailed: '印刷プレビューを準備できませんでした。もう一度お試しください。',
    edit: '編集を続ける',
    createNew: '新しいカードを作成',
    template: 'テンプレート',
    layout: 'レイアウト',
    ratio: '比率',
    level: 'レベル',
    cardDetails: 'カード情報',
    job: 'ジョブ',
    world: 'ワールド',
    fileSize: 'ファイルサイズ',
    resultFormat: '形式',
    resultDimensions: 'ピクセルサイズ',
    otherRatios: '別の比率でプレビュー',
    otherRatiosHint: '同じ情報と画像を使い、構成に合わせて配置し直します。',
    preparing: '書き出しを準備しています…',
    fonts: '文字とカード画像を準備しています…',
    image: '画像を確認しています…',
    render: '高解像度カードを作成しています…',
    downloadStatus: 'ダウンロードを準備しました。',
    exportProgress: '書き出しの進行状況',
    success: 'ブラウザーに{format}のダウンロードをリクエストしました · {width} × {height} px',
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
    idCard: '冒険者の記録',
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

function getExportErrorAction(error: unknown): 'format' | 'resolution' | 'download' | 'retry' {
  if (!(error instanceof CardExportError)) return 'retry';
  if (error.code === 'webp-unsupported') return 'format';
  if (error.code === 'render-timeout' || error.code === 'render-failed' || error.code === 'size-mismatch') return 'resolution';
  if (error.code === 'download-failed') return 'download';
  return 'retry';
}

function getPrintErrorMessage(error: unknown, labels: typeof copy.ko): string {
  const exportMessage = getExportErrorMessage(error, labels);
  return exportMessage === labels.failed ? labels.printFailed : exportMessage;
}

function getLowerExportScale(scale: CardExportScale): CardExportScale | null {
  const index = CARD_EXPORT_SCALES.indexOf(scale);
  return index > 0 ? CARD_EXPORT_SCALES[index - 1] : null;
}

function formatExportSuccess(record: ExportDownload, labels: typeof copy.ko): string {
  return labels.success
    .replace('{format}', record.snapshot.format.toUpperCase())
    .replace('{width}', record.size.width.toLocaleString(record.snapshot.locale))
    .replace('{height}', record.size.height.toLocaleString(record.snapshot.locale));
}

function formatBlobSize(bytes: number, locale: Locale): string {
  if (bytes < 1_000) return `${bytes.toLocaleString(locale)} B`;
  const unitSize = bytes < 1_000_000 ? 1_000 : 1_000_000;
  const unit = unitSize === 1_000 ? 'KB' : 'MB';
  return `${(bytes / unitSize).toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;
}

export default function ExportPage() {
  const { locale } = useI18n();
  const character = useEditorStore((state) => state.character);
  const design = useEditorStore((state) => state.design);
  const image = useEditorStore((state) => state.image);
  const isHydrated = useEditorStore((state) => state.isHydrated);
  const hydrate = useEditorStore((state) => state.hydrate);
  const updateDesign = useEditorStore((state) => state.updateDesign);
  const [format, setFormat] = useState<CardExportFormat>('png');
  const [scale, setScale] = useState<CardExportScale>(2);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<CardExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<'format' | 'resolution' | 'download' | 'retry' | null>(null);
  const [status, setStatus] = useState('');
  const [exportSnapshot, setExportSnapshot] = useState<CardExportSnapshot | null>(null);
  const [result, setResult] = useState<ExportDownload | null>(null);
  const [retryExport, setRetryExport] = useState<ExportDownload | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<CardExportSnapshot | null>(null);
  const [printPreparing, setPrintPreparing] = useState(false);
  const [printStatus, setPrintStatus] = useState('');
  const [printError, setPrintError] = useState<string | null>(null);
  const viewSnapshot = exportSnapshot ?? result?.snapshot ?? null;
  const text = copy[viewSnapshot?.locale ?? locale];
  const exportSurfaceRef = useRef<HTMLDivElement>(null);
  const printSurfaceRef = useRef<HTMLDivElement>(null);
  const activeExportRef = useRef<{ controller: AbortController } | null>(null);
  const activePrintRef = useRef<ActivePrintOperation | null>(null);
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
      activePrintRef.current?.controller.abort();
      activePrintRef.current = null;
    };
  }, []);

  const finishPrint = useCallback((operation: ActivePrintOperation | null, errorMessage?: string) => {
    if (!operation || activePrintRef.current !== operation) return;
    activePrintRef.current = null;
    operation.controller.abort();
    if (!mountedRef.current) return;
    setPrintSnapshot(null);
    setPrintPreparing(false);
    setPrintStatus('');
    if (errorMessage !== undefined) setPrintError(errorMessage);
  }, []);

  useEffect(() => {
    const clearPrintCard = () => finishPrint(activePrintRef.current);
    window.addEventListener('afterprint', clearPrintCard);
    return () => window.removeEventListener('afterprint', clearPrintCard);
  }, [finishPrint]);

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
  const viewData = viewSnapshot?.data ?? data;
  const viewRenderData = viewSnapshot?.data ?? renderData;
  const viewLocale = viewSnapshot?.locale ?? locale;
  const viewFormat = viewSnapshot?.format ?? format;
  const viewScale = viewSnapshot?.scale ?? scale;
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
  const dimensions = result?.size ?? getCardExportSize(viewData.design.ratio, viewScale);
  const logicalDimensions = getCardExportLogicalDimensions(viewData.design.ratio);
  const sampleArtwork = Object.values(conerSample.screenshots).some((screenshot) => viewData.imageUrl === screenshot.optimized);
  const metadata = [
    [text.job, jobLabel],
    [text.world, worldLabel],
    [text.level, viewData.character.level ? String(viewData.character.level) : ''],
  ].filter(([, value]) => value.trim());
  const requestPrint = useCallback(async () => {
    if (activePrintRef.current) return;

    const operation: ActivePrintOperation = {
      controller: new AbortController(),
      printInvoked: false,
    };
    activePrintRef.current = operation;
    const { signal } = operation.controller;
    const isCurrent = () => mountedRef.current && activePrintRef.current === operation && !signal.aborted;
    const printLocale = viewLocale;

    try {
      const snapshot = createCardExportSnapshot(viewRenderData, printLocale, viewFormat, viewScale);
      flushSync(() => {
        setPrintSnapshot(snapshot);
        setPrintPreparing(true);
        setPrintStatus(copy[printLocale].printPreparing);
        setPrintError(null);
      });

      const node = printSurfaceRef.current?.querySelector<HTMLElement>('article') ?? null;
      node?.querySelectorAll<HTMLImageElement>('img').forEach((asset) => { asset.loading = 'eager'; });
      await prepareCardForPrint({
        node,
        signal,
        loadFonts: () => loadCardPreviewFonts(snapshot.data, snapshot.locale, { signal, source: 'export' }),
        waitForAssets: (assetNode, assetSignal) => {
          assetNode.querySelectorAll<HTMLImageElement>('img').forEach((asset) => { asset.loading = 'eager'; });
          return waitForCardAssets(assetNode, { signal: assetSignal });
        },
        print: () => {
          operation.printInvoked = true;
          setPrintStatus('');
          window.print();
        },
      });
    } catch (caught) {
      if (isCurrent()) finishPrint(operation, getPrintErrorMessage(caught, copy[printLocale]));
    } finally {
      if (activePrintRef.current === operation && !operation.printInvoked) finishPrint(operation);
    }
  }, [finishPrint, viewFormat, viewLocale, viewRenderData, viewScale]);

  const handleDownload = useCallback(async (overrides: { format?: CardExportFormat; scale?: CardExportScale } = {}) => {
    if (activeExportRef.current) return;
    const operationStartedAt = performance.now();
    const exportFormat = overrides.format ?? format;
    const exportScale = overrides.scale ?? scale;
    profileCount('export.page.calls');
    const finishExportTiming = profileStart('export.page.total', {
      format: exportFormat,
      scale: exportScale,
      ratio: renderData.design.ratio,
    });
    const operation = { controller: new AbortController() };
    activeExportRef.current = operation;
    const { signal } = operation.controller;
    const isCurrent = () => mountedRef.current && activeExportRef.current === operation && !signal.aborted;

    try {
      const finishSnapshotTiming = profileStart('export.page.snapshot');
      const snapshot = createCardExportSnapshot(renderData, locale, exportFormat, exportScale);
      finishSnapshotTiming();
      // Commit the immutable job into the hidden export surface before reading
      // it. The app header may change locale while this render is in flight.
      const finishMountTiming = profileStart('export.page.hiddenSurfaceCommit');
      flushSync(() => {
        setResult(null);
        setRetryExport(null);
        setExportSnapshot(snapshot);
        setError(null);
        setErrorAction(null);
        setExporting(true);
        setProgress(null);
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
          setStatus(getStageLabel(nextProgress.stage, copy[snapshot.locale]));
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
      const download: ExportDownload = {
        snapshot,
        blob: rendered.blob,
        size: rendered.size,
        filename: getCardExportFilename(snapshot.data.character.name, snapshot.data.design.ratio, snapshot.scale, snapshot.format),
        renderDurationMs: performance.now() - operationStartedAt,
      };
      try {
        downloadCardBlob(download.blob, snapshot.data, snapshot.format, snapshot.scale);
      } catch (caught) {
        if (isCurrent()) setRetryExport(download);
        throw caught;
      } finally {
        finishDispatchTiming();
      }
      setResult(download);
      setRetryExport(null);
      setProgress({ stage: 'download', progress: 1 });
      setStatus(formatExportSuccess(download, copy[snapshot.locale]));
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

  const clearExportFeedback = useCallback(() => {
    setError(null);
    setErrorAction(null);
    setProgress(null);
    setStatus('');
    setRetryExport(null);
    setPrintError(null);
    setPrintStatus('');
  }, []);

  const dispatchStoredExport = useCallback((download: ExportDownload) => {
    const labels = copy[download.snapshot.locale];
    const isRedownload = result !== null;
    try {
      downloadCardBlob(download.blob, download.snapshot.data, download.snapshot.format, download.snapshot.scale);
      setResult(download);
      setRetryExport(null);
      setError(null);
      setErrorAction(null);
      setProgress(null);
      setStatus(isRedownload ? labels.redownloadStatus : formatExportSuccess(download, labels));
    } catch (caught) {
      setError(getExportErrorMessage(caught, labels));
      setErrorAction('download');
      setStatus('');
    }
  }, [result]);

  const handlePrimaryAction = useCallback(() => {
    if (result) {
      dispatchStoredExport(result);
      return;
    }
    if (errorAction === 'format') {
      setFormat('png');
      void handleDownload({ format: 'png' });
      return;
    }
    if (errorAction === 'resolution') {
      const lowerScale = getLowerExportScale(scale);
      if (lowerScale !== null) {
        setScale(lowerScale);
        void handleDownload({ scale: lowerScale });
        return;
      }
    }
    if (errorAction === 'download' && retryExport) {
      dispatchStoredExport(retryExport);
      return;
    }
    void handleDownload();
  }, [dispatchStoredExport, errorAction, handleDownload, result, retryExport, scale]);

  const updateFormat = useCallback((nextFormat: CardExportFormat) => {
    setFormat(nextFormat);
    clearExportFeedback();
  }, [clearExportFeedback]);

  const updateScale = useCallback((nextScale: CardExportScale) => {
    setScale(nextScale);
    clearExportFeedback();
  }, [clearExportFeedback]);

  const updateRatio = useCallback((ratio: CardRatio) => {
    updateDesign('ratio', ratio);
    clearExportFeedback();
  }, [clearExportFeedback, updateDesign]);

  const cancelExport = useCallback(() => {
    const activeExport = activeExportRef.current;
    if (!activeExport || activeExport.controller.signal.aborted) return;
    activeExport.controller.abort();
    setError(null);
    setErrorAction(null);
    setProgress(null);
    setStatus(text.cancelled);
  }, [text]);

  if (!isHydrated) {
    return <div className={styles.loadingState} role="status">{text.preparing}</div>;
  }

  const renderBaseStyle = { '--export-card-width': `${logicalDimensions.width}px` } as CSSProperties;
  const printLogicalDimensions = getCardExportLogicalDimensions(printSnapshot?.data.design.ratio ?? viewData.design.ratio);
  const printBaseStyle = {
    '--export-card-width': `${printLogicalDimensions.width}px`,
    '--export-card-height': `${printLogicalDimensions.height}px`,
  } as CSSProperties;
  const lowerScale = errorAction === 'resolution' ? getLowerExportScale(scale) : null;
  const primaryLabel = result
    ? text.redownload
    : exporting
      ? text.preparing
      : errorAction === 'format'
        ? text.retryPng
        : errorAction === 'resolution'
          ? lowerScale === null ? text.retrySame : text.retryLower.replace('{scale}', String(lowerScale))
          : errorAction === 'download'
            ? text.retryDownload
            : errorAction === 'retry'
              ? text.retrySame
              : `${text.download} · ${viewFormat.toUpperCase()} ${viewScale}×`;

  return (
    <div className={styles.page} data-export-state={result ? 'complete' : exporting ? 'rendering' : error ? 'error' : 'ready'} data-export-render-ms={result ? Math.round(result.renderDurationMs) : undefined}>
      <div className={styles.content}>
        {result ? (
          <header className={`${styles.hero} ${styles.resultHero}`}>
            <p className={styles.eyebrow}><span />{text.resultEyebrow}</p>
            <div className={styles.resultHeading}>
              <span className={styles.successMark} aria-hidden="true">✓</span>
              <div>
                <h1 className={styles.title}>{text.resultTitle}</h1>
                <p className={styles.fileName}>{result.filename}</p>
              </div>
            </div>
            {!error && <p className={styles.visuallyHidden} role="status">{status || formatExportSuccess(result, text)}</p>}
          </header>
        ) : (
          <header className={styles.hero}>
            <p className={styles.eyebrow}><span />{text.eyebrow}</p>
            <h1 className={styles.title}>{text.title}</h1>
            <p className={styles.intro}>{text.intro}</p>
          </header>
        )}

        <div className={styles.workspace}>
          <section className={styles.previewPanel} aria-label={text.preview}>
            <div className={styles.previewHeader}>
              <span>{text.preview}</span>
              <span>{viewData.design.ratio}</span>
            </div>
            <div className={`${styles.previewStage} ${result ? styles.resultStage : ''}`}>
              {result ? (
                <ResultBitmapPreview
                  blob={result.blob}
                  width={dimensions.width}
                  height={dimensions.height}
                  alt={previewSummary}
                  loadingLabel={text.resultPreviewLoading}
                  errorLabel={text.resultPreviewFailed}
                  className={`${styles.resultCard} ${resultRatioClasses[viewData.design.ratio]}`}
                />
              ) : (
                <div role="img" aria-label={previewSummary}>
                <MemoizedCardPreview
                  key={`${viewData.design.template}-${viewData.design.layoutVariant}-${viewData.design.ratio}`}
                  data={viewRenderData}
                  className={`${styles.mainCard} ${mainRatioClasses[viewData.design.ratio]}`}
                  locale={viewLocale}
                />
                </div>
              )}
            </div>
            {result ? (
              <div className={styles.resultSummary}>
                <strong>{viewFormat.toUpperCase()} · {dimensions.width.toLocaleString(viewLocale)} × {dimensions.height.toLocaleString(viewLocale)} {text.pixel} · {viewData.design.ratio}</strong>
                <span>{formatBlobSize(result.blob.size, viewLocale)}</span>
                <p>{text.downloadNotice}</p>
              </div>
            ) : (
              <div className={styles.previewFooter}>
                <div className={styles.previewIdentity}>
                  <strong>{viewData.character.name}</strong>
                  <span>{jobLabel} · {worldLabel}</span>
                </div>
                <div className={styles.previewDimensions}>
                  <span>{sampleArtwork ? text.sample : text.local}</span>
                  <strong>{dimensions.width.toLocaleString(viewLocale)} × {dimensions.height.toLocaleString(viewLocale)} {text.pixel}</strong>
                  {dimensions.capped && <span>{text.capped}</span>}
                </div>
              </div>
            )}
          </section>

          {result ? (
            <aside className={`${styles.exportPanel} ${styles.resultPanel}`} aria-labelledby="export-result-title">
              <p className={styles.sectionLabel}>{text.resultEyebrow}</p>
              <h2 className={styles.resultName} id="export-result-title">{viewData.character.name}</h2>
              <dl className={styles.resultDetails}>
                <div><dt>{text.resultFormat}</dt><dd>{viewFormat.toUpperCase()}</dd></div>
                <div><dt>{text.resultDimensions}</dt><dd>{dimensions.width.toLocaleString(viewLocale)} × {dimensions.height.toLocaleString(viewLocale)} {text.pixel}</dd></div>
                <div><dt>{text.ratio}</dt><dd>{viewData.design.ratio}</dd></div>
                <div><dt>{text.fileSize}</dt><dd>{formatBlobSize(result.blob.size, viewLocale)}</dd></div>
              </dl>
              {dimensions.capped && <p className={styles.cappedNote}>{text.capped}</p>}
              {error && <p id="export-feedback" className={`${styles.statusText} ${styles.errorText}`} role="alert">{error}</p>}
              <div className={styles.mobileActionArea}>
                <button className={styles.downloadButton} type="button" onClick={handlePrimaryAction} disabled={printPreparing} aria-busy={printPreparing} aria-describedby={error ? 'export-feedback' : undefined}>
                  <span>{error ? text.retryDownload : text.redownload}</span>
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
              <p className={styles.note}>{text.downloadNotice}</p>
              <div className={styles.resultActions}>
                <Link className={styles.resultAction} href="/editor">{text.edit}</Link>
                <Link className={styles.resultAction} href="/create">{text.createNew}</Link>
              </div>
              <div className={styles.printActions}>
                <button type="button" className={styles.pdfButton} onClick={requestPrint} disabled={printPreparing} aria-busy={printPreparing}>{text.pdf}</button>
                {printPreparing && <p className={styles.printStatus} role="status" aria-live="polite">{printStatus}</p>}
                {printError && <p className={`${styles.statusText} ${styles.errorText}`} role="alert">{printError}</p>}
                <p className={styles.note}>{text.pdfHint}</p>
              </div>
              <FFXIVAttribution locale={viewLocale} className={styles.rightsNote} officialAssetsUsed={officialAssetsUsed} service={viewData.character.service === 'korea' ? 'KOREA' : 'GLOBAL'} />
            </aside>
          ) : (
            <aside className={styles.exportPanel} aria-labelledby="export-settings-label" aria-busy={exporting}>
              <p className={styles.sectionLabel} id="export-settings-label">{text.exportLabel}</p>
              <h2 className={styles.characterName} id="export-settings-title">{viewData.character.name}</h2>
              <p className={styles.identity}>{activeTemplate}<span>·</span>{viewData.design.ratio}</p>

              <fieldset className={styles.optionGroup} disabled={exporting || printPreparing} aria-describedby={errorAction === 'format' ? 'export-feedback' : undefined}>
                <legend className={styles.controlLabel}><span>{text.format}</span><span>{viewFormat.toUpperCase()}</span></legend>
                <div className={styles.segmented} data-count="2">
                  {(['png', 'webp'] as const).map((value) => (
                    <label key={value} className={viewFormat === value ? styles.selectedChoice : undefined}>
                      <input className={styles.choiceInput} type="radio" name="export-format" value={value} checked={viewFormat === value} onChange={() => updateFormat(value)} />
                      <span>{value.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.optionGroup} disabled={exporting || printPreparing} aria-describedby={errorAction === 'resolution' ? 'export-feedback' : 'export-dimensions'}>
                <legend className={styles.controlLabel}><span>{text.resolution}</span><span>{viewScale}×</span></legend>
                <div className={styles.segmented} data-count={CARD_EXPORT_SCALES.length}>
                  {CARD_EXPORT_SCALES.map((value) => (
                    <label key={value} className={viewScale === value ? styles.selectedChoice : undefined}>
                      <input className={styles.choiceInput} type="radio" name="export-scale" value={value} checked={viewScale === value} onChange={() => updateScale(value)} />
                      <span>{value}×</span>
                    </label>
                  ))}
                </div>
                <p className={styles.dimensions} id="export-dimensions">
                  <span>{text.pixel} · {viewData.design.ratio}</span>
                  <strong>{dimensions.width.toLocaleString(viewLocale)} × {dimensions.height.toLocaleString(viewLocale)}</strong>
                </p>
                {dimensions.capped && <p className={styles.cappedNote}>{text.capped}</p>}
              </fieldset>

              <fieldset className={`${styles.optionGroup} ${styles.ratioGroup}`} disabled={exporting || printPreparing} aria-describedby="export-ratio-hint">
                <legend className={styles.controlLabel}>{text.ratioLabel}</legend>
                <div className={styles.segmented} data-count="5">
                  {(['1:1', '4:5', '3:4', '9:16', '16:9'] as const).map((value) => (
                    <label key={value} className={viewData.design.ratio === value ? styles.selectedChoice : undefined}>
                      <input className={styles.choiceInput} type="radio" name="export-ratio" value={value} checked={viewData.design.ratio === value} onChange={() => updateRatio(value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.ratioHint} id="export-ratio-hint">{text.otherRatiosHint}</p>
              </fieldset>

              <details className={styles.metadataDetails}>
                <summary>{text.cardDetails}</summary>
                <dl className={styles.metadataList}>
                  <div><dt>{text.template}</dt><dd>{activeTemplate}</dd></div>
                  {metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
              </details>

              {(exporting || error || status) && (
                <div className={styles.feedback}>
                  {exporting && progress && <div className={styles.progressTrack} role="progressbar" aria-label={text.exportProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress * 100)}><div className={styles.progressBar} style={{ width: `${Math.max(5, progress.progress * 100)}%` }} /></div>}
                  <p id="export-feedback" className={`${styles.statusText} ${error ? styles.errorText : ''}`} role={error ? 'alert' : 'status'}>{error || status}</p>
                  {error && <p className={styles.attemptDetails}>{viewFormat.toUpperCase()} · {viewScale}× · {dimensions.width.toLocaleString(viewLocale)} × {dimensions.height.toLocaleString(viewLocale)} {text.pixel}</p>}
                </div>
              )}
              <div className={styles.mobileActionArea}>
                <button className={styles.downloadButton} type="button" onClick={handlePrimaryAction} disabled={exporting || printPreparing} aria-busy={exporting || printPreparing} aria-describedby={error ? 'export-feedback' : undefined}>
                  <span>{primaryLabel}</span>
                  <span aria-hidden="true">{exporting ? '…' : error ? '↻' : '↓'}</span>
                </button>
                {exporting && <button className={styles.cancelButton} type="button" onClick={cancelExport} disabled={status === text.cancelled}>{text.cancelExport}</button>}
              </div>
              <div className={styles.smallActions}>
                <button type="button" className={styles.pdfButton} onClick={requestPrint} disabled={exporting || printPreparing} aria-busy={printPreparing}>{text.pdf}</button>
                <Link className={styles.editLink} href="/editor">← {text.edit}</Link>
              </div>
              {printPreparing && <p className={styles.printStatus} role="status" aria-live="polite">{printStatus}</p>}
              {printError && <p className={`${styles.statusText} ${styles.errorText}`} role="alert">{printError}</p>}
              <p className={styles.note}>{text.pdfHint}</p>
              <p className={styles.note}>{text.quality}</p>
              <FFXIVAttribution locale={viewLocale} className={styles.rightsNote} officialAssetsUsed={officialAssetsUsed} service={viewData.character.service === 'korea' ? 'KOREA' : 'GLOBAL'} />
            </aside>
          )}
        </div>

      </div>

      {exportSnapshot && (
        <div ref={exportSurfaceRef} className={styles.exportSurface} aria-hidden="true" style={renderBaseStyle}>
          <div className={styles.renderFrame}>
            <MemoizedCardPreview data={exportSnapshot.data} className={styles.renderCard} locale={exportSnapshot.locale} />
          </div>
        </div>
      )}

      {printSnapshot && (
        <div ref={printSurfaceRef} className={`${styles.printOnly} ${styles.printPreparation}`} aria-hidden="true" style={printBaseStyle}>
          <MemoizedCardPreview data={printSnapshot.data} className={`${styles.printCard} ${printRatioClasses[printSnapshot.data.design.ratio]}`} locale={printSnapshot.locale} />
        </div>
      )}

    </div>
  );
}
