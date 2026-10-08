import type { Locale } from '@/lib/types';

const messages = {
  ko: {
    invalid: '이미지를 읽지 못했습니다. 정상적인 PNG, JPG 또는 WebP 파일을 다시 선택해 주세요.',
    unsupported: '지원하지 않는 이미지 형식입니다. HEIC/HEIF 사진은 JPG로 변환하거나 JPG, PNG 또는 WebP 파일을 선택해 주세요.',
    processingUnavailable: '이 브라우저에서 이미지를 준비할 수 없습니다. JPG, PNG 또는 WebP 파일을 다시 선택하고, 문제가 계속되면 다른 최신 브라우저에서 시도해 주세요.',
    size: '이미지가 너무 큽니다. 24MB 이하 파일을 선택하거나 이미지 크기를 줄여 다시 시도해 주세요.',
    budget: '이 이미지를 브라우저에 저장하지 못했습니다. 더 작은 이미지를 선택해 주세요. 현재 카드는 유지됩니다.',
    processingTimeout: '이미지 처리 시간이 초과되었습니다. 현재 카드는 유지됩니다. 다시 시도해 주세요.',
    recovery: '이 도구를 표시하지 못했습니다. 현재 카드는 유지됩니다. 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  en: {
    invalid: 'The image could not be read. Choose a valid PNG, JPG, or WebP file and try again.',
    unsupported: 'This image format is not supported. Convert HEIC/HEIF photos to JPG, or choose a JPG, PNG, or WebP file.',
    processingUnavailable: 'This browser could not prepare the image. Choose a JPG, PNG, or WebP file, then try a current browser if the problem continues.',
    size: 'This image is too large. Choose a file below 24MB or reduce its dimensions and try again.',
    budget: 'This image could not be saved in the browser. Choose a smaller image. Your current card is kept.',
    processingTimeout: 'Image processing timed out. Your current card is kept. Please try again.',
    recovery: 'This tool could not be displayed. Your current card is kept. Please try again.',
    retry: 'Try again',
  },
  ja: {
    invalid: '画像を読み込めません。正常なPNG、JPG、WebPファイルを選び直してください。',
    unsupported: 'この画像形式には対応していません。HEIC/HEIFの写真はJPGに変換するか、JPG、PNG、WebPファイルを選んでください。',
    processingUnavailable: 'このブラウザーでは画像を処理できません。JPG、PNG、WebPを選び直し、解決しない場合は最新の別ブラウザーでお試しください。',
    size: '画像が大きすぎます。24MB以下のファイルを選ぶか、画像のサイズを小さくして再試行してください。',
    budget: '画像をブラウザーに保存できません。小さい画像を選んでください。現在のカードは保持されます。',
    processingTimeout: '画像の処理がタイムアウトしました。現在のカードは保持されます。もう一度お試しください。',
    recovery: 'このツールを表示できません。現在のカードは保持されます。再試行してください。',
    retry: '再試行',
  },
} as const;

export function getEditorRecoveryCopy(locale: Locale) { return messages[locale]; }
export function getUploadErrorMessage(code: string | undefined, locale: Locale): string {
  const copy = messages[locale];
  if (code === 'unsupported') return copy.unsupported;
  if (code === 'canvas-unavailable') return copy.processingUnavailable;
  if (code === 'input-too-large') return copy.size;
  if (code === 'storage-budget') return copy.budget;
  if (code === 'processing-timeout') return copy.processingTimeout;
  return copy.invalid;
}
