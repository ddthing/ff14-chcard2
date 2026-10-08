export type AppLocale = 'ko' | 'en' | 'ja';

export type EditorFieldKey =
  | 'name' | 'service' | 'region' | 'world' | 'dataCenter' | 'freeCompany' | 'job' | 'level'
  | 'race' | 'clan' | 'grandCompany' | 'languages' | 'playStyles' | 'bio';

export interface EditorCopy {
  title: string;
  subtitle: string;
  sections: Record<'screenshot' | 'character' | 'information' | 'template' | 'style' | 'effects', string>;
  undo: string;
  redo: string;
  reset: string;
  resetCardPrompt: string;
  cancel: string;
  confirmReset: string;
  template: string;
  masterLabel: string;
  experimentalLabel: string;
  experimentalHint: string;
  saved: string;
  saving: string;
  saveError: string;
  saveErrorCompact: string;
  saveErrorRecovery: string;
  saveErrorExportAction: string;
  hydrating: string;
  zoom: string;
  zoomIn: string;
  zoomOut: string;
  fitCanvas: string;
  uploadScreenshot: string;
  panMode: string;
  ratio: string;
  preview: string;
  backToEditor: string;
  closeInspector: string;
  export: string;
  safeArea: string;
  canvasLabel: string;
  workspaceLabel: string;
  cardPreviewSummary: (name: string, job: string, world: string) => string;
  imageValueLabel: (label: string) => string;
  panHint: string;
  templates: Record<'cinematic' | 'editorial' | 'id-card', string>;
  templateIntents: Record<'cinematic' | 'editorial' | 'id-card', string>;
  templateVariation: string;
  variationNames: Record<'a' | 'b' | 'c', string>;
  typography: string;
  typographyNames: Record<'editorial' | 'modern' | 'condensed' | 'classic' | 'clean', string>;
  typographyNameFallback: string;
  typographySpecimens: string;
  colors: string;
  colorModes: Record<'auto' | 'custom' | 'job', string>;
  colorNames: Record<'primary' | 'accent' | 'light' | 'dark', string>;
  jobTheme: string;
  jobThemeHint: string;
  jobMotif: string;
  jobMotifHint: string;
  jobIconColor: string;
  useFamilyAccent: string;
  image: string;
  uploadTitle: string;
  uploadDescription: string;
  chooseFile: string;
  uploading: string;
  dropToUpload: string;
  uploadSuccess: string;
  replaceImage: string;
  resetImage: string;
  sampleArtwork: string;
  sampleArtworkHint: string;
  sampleBadge: string;
  uploadedScreenshot: string;
  dragToReposition: string;
  fileTypes: string;
  privacy: string;
  uploadError: string;
  noImage: string;
  fields: Record<EditorFieldKey, string>;
  informationIntro: string;
  additionalCharacterDetails: string;
  placeholders: Record<'name' | 'world' | 'dataCenter' | 'freeCompany' | 'job' | 'race' | 'clan' | 'grandCompany' | 'bio', string>;
  picker: {
    search: string;
    searchPlaceholder: string;
    noResults: string;
    close: string;
    clear: string;
    all: string;
    roleFilter: string;
    categoryFilter: string;
    koreaNoDataCenter: string;
    selectedCount: (count: number, limit: number) => string;
    maxLanguages: number;
    maxPlayStyles: number;
  };
  languageOptions: Record<'KO' | 'EN' | 'JA' | 'FR' | 'DE' | 'ZH', string>;
  playStyleOptions: Record<'Story' | 'Glamour' | 'Raids' | 'Social' | 'Crafting' | 'Exploration' | 'PvP' | 'Frontline' | 'Duty finder', string>;
  imageControls: Record<'x' | 'y' | 'scale' | 'rotation' | 'brightness' | 'contrast' | 'saturation' | 'exposure', string>;
  moreImageAdjustments: string;
  worldSearchHint: string;
  worldFilters: string;
  worldLocationAuto: string;
  styleIntro: string;
  colorModesHint: string;
  resetCrop: string;
  effectsHint: string;
  grain: string;
  holographic: string;
  grainDescription: string;
  holographicDescription: string;
}

type RouteCopy = {
  templatesEyebrow: string;
  templatesTitle: string;
  templatesIntro: string;
  useTemplate: string;
  preview: string;
  cinematic: string;
  editorial: string;
  idCard: string;
  cinematicDesc: string;
  editorialDesc: string;
  idCardDesc: string;
  createEyebrow: string;
  createTitle: string;
  createIntro: string;
  characterName: string;
  world: string;
  job: string;
  level: string;
  startEditing: string;
  editor: string;
  savedLocally: string;
  savingLocally: string;
  saveFailed: string;
  saveAndExport: string;
  back: string;
  screenshot: string;
  character: string;
  information: string;
  style: string;
  effect: string;
  template: string;
  ratio: string;
  accent: string;
  choosePhoto: string;
  photoHint: string;
  zoom: string;
  undo: string;
  redo: string;
  exportEyebrow: string;
  exportTitle: string;
  exportIntro: string;
  printPdf: string;
  exportNote: string;
  continueEditing: string;
  namePlaceholder: string;
  worldPlaceholder: string;
  jobPlaceholder: string;
  bio: string;
  bioPlaceholder: string;
  uploadError: string;
  screenshotPrivacy: string;
  imageScale: string;
  imagePosition: string;
  portrait: string;
  center: string;
  rightFocus: string;
  leftFocus: string;
  effectsIntro: string;
  grainEffect: string;
  holographicEffect: string;
  grainDescription: string;
  holographicDescription: string;
};

const copy: Record<AppLocale, RouteCopy> = {
  ko: {
    templatesEyebrow: '카드 스타일',
    templatesTitle: '모험을 담을 프레임을 고르세요.',
    templatesIntro: '같은 순간도 어떤 레이아웃을 고르느냐에 따라 다른 이야기가 됩니다.',
    useTemplate: '이 스타일로 시작',
    preview: '미리보기',
    cinematic: '시네마틱',
    editorial: '에디토리얼',
    idCard: '어드벤처러 ID',
    cinematicDesc: '스크린샷을 크게 담고, 여백에 캐릭터의 서사를 얹습니다.',
    editorialDesc: '잡지 표지처럼 이름과 모험을 우아하게 구성합니다.',
    idCardDesc: '월드와 직업 정보를 정돈된 프로필 카드로 보여줍니다.',
    createEyebrow: '새 카드',
    createTitle: '먼저 모험가를 소개해 주세요.',
    createIntro: '기본 정보는 언제든 에디터에서 바꿀 수 있어요.',
    characterName: '캐릭터 이름',
    world: '월드',
    job: '주 직업',
    level: '레벨',
    startEditing: '에디터에서 계속',
    editor: '카드 에디터',
    savedLocally: '이 브라우저에 저장됨',
    savingLocally: '저장 중…',
    saveFailed: '저장 공간이 부족해요. 더 작은 이미지를 선택해 주세요.',
    saveAndExport: '저장하고 내보내기',
    back: '뒤로',
    screenshot: '스크린샷',
    character: '캐릭터',
    information: '추가 정보',
    style: '스타일',
    effect: '효과',
    template: '템플릿',
    ratio: '비율',
    accent: '포인트 컬러',
    choosePhoto: '스크린샷 선택',
    photoHint: 'JPG, PNG · 최대 12MB',
    zoom: '확대',
    undo: '실행 취소',
    redo: '다시 실행',
    exportEyebrow: '완성',
    exportTitle: '공유할 준비가 됐어요.',
    exportIntro: '인쇄 창에서 PDF로 저장하거나 카드 미리보기를 확인하세요.',
    printPdf: 'PDF로 저장',
    exportNote: '인쇄 대화상자에서 “PDF로 저장”을 선택하면 현재 비율 그대로 저장됩니다.',
    continueEditing: '계속 편집',
    namePlaceholder: '예: Coner',
    worldPlaceholder: '예: Tonberry',
    jobPlaceholder: '예: Bard',
    bio: '한 줄 소개',
    bioPlaceholder: '모험을 한 문장으로 남겨 보세요.',
    uploadError: '이미지를 불러오지 못했어요. 12MB 이하의 JPG 또는 PNG를 선택해 주세요.',
    screenshotPrivacy: '스크린샷은 이 기기에 보관되며 카드 이미지로 사용됩니다.',
    imageScale: '이미지 확대',
    imagePosition: '이미지 위치',
    portrait: '인물 중심',
    center: '가운데',
    rightFocus: '오른쪽 강조',
    leftFocus: '왼쪽 강조',
    effectsIntro: '마무리 효과는 절제해서 사용하면 더 잘 어울립니다.',
    grainEffect: '필름 입자',
    holographicEffect: '홀로그램 빛',
    grainDescription: '인쇄 질감처럼 고운 입자를 더합니다.',
    holographicDescription: '이미지에 은은한 색의 반사를 더합니다.',
  },
  en: {
    templatesEyebrow: 'Card styles',
    templatesTitle: 'Choose a frame for your adventure.',
    templatesIntro: 'One moment can tell a different story in a different layout.',
    useTemplate: 'Start with this style',
    preview: 'Preview',
    cinematic: 'Cinematic',
    editorial: 'Editorial',
    idCard: 'Adventurer ID',
    cinematicDesc: 'Let the screenshot lead, with your character story in the margins.',
    editorialDesc: 'An elegant cover layout for the name and story behind the portrait.',
    idCardDesc: 'A precise profile card for your world, job, and company.',
    createEyebrow: 'New card',
    createTitle: 'Start with your adventurer.',
    createIntro: 'You can change these details at any time in the editor.',
    characterName: 'Character name',
    world: 'World',
    job: 'Main job',
    level: 'Level',
    startEditing: 'Continue in editor',
    editor: 'Card editor',
    savedLocally: 'Saved in this browser',
    savingLocally: 'Saving…',
    saveFailed: 'Storage is full. Choose a smaller image to save this card.',
    saveAndExport: 'Save and export',
    back: 'Back',
    screenshot: 'Screenshot',
    character: 'Character',
    information: 'Additional info',
    style: 'Style',
    effect: 'Effects',
    template: 'Template',
    ratio: 'Aspect ratio',
    accent: 'Accent color',
    choosePhoto: 'Choose screenshot',
    photoHint: 'JPG or PNG · up to 12 MB',
    zoom: 'Zoom',
    undo: 'Undo',
    redo: 'Redo',
    exportEyebrow: 'Finished card',
    exportTitle: 'Ready to share.',
    exportIntro: 'Save a PDF from the print dialog or review your finished card.',
    printPdf: 'Save as PDF',
    exportNote: 'Choose “Save as PDF” in the print dialog to keep the current aspect ratio.',
    continueEditing: 'Continue editing',
    namePlaceholder: 'e.g. Coner',
    worldPlaceholder: 'e.g. Tonberry',
    jobPlaceholder: 'e.g. Bard',
    bio: 'Short introduction',
    bioPlaceholder: 'Describe your adventure in one line.',
    uploadError: 'Could not load that image. Choose a JPG or PNG under 12 MB.',
    screenshotPrivacy: 'Your screenshot stays on this device and becomes the artwork behind your card.',
    imageScale: 'Image scale',
    imagePosition: 'Image position',
    portrait: 'Portrait',
    center: 'Center',
    rightFocus: 'Right focus',
    leftFocus: 'Left focus',
    effectsIntro: 'Use a light touch to keep the finishing details in balance.',
    grainEffect: 'Fine grain',
    holographicEffect: 'Holographic light',
    grainDescription: 'Add a fine printed texture.',
    holographicDescription: 'Lay a subtle color foil over the image.',
  },
  ja: {
    templatesEyebrow: 'カードスタイル',
    templatesTitle: '冒険を飾るフレームを選ぶ。',
    templatesIntro: '同じ瞬間も、レイアウトによって違う物語になります。',
    useTemplate: 'このスタイルで始める',
    preview: 'プレビュー',
    cinematic: 'シネマティック',
    editorial: 'エディトリアル',
    idCard: 'アドベンチャラー ID',
    cinematicDesc: 'スクリーンショットを主役に、余白へキャラクターの物語を添えます。',
    editorialDesc: 'ポートレートと名前を雑誌の表紙のように優雅に配置します。',
    idCardDesc: 'ワールド、ジョブ、フリーカンパニーを整然と表示します。',
    createEyebrow: '新しいカード',
    createTitle: '冒険者の情報を入力してください。',
    createIntro: '入力した内容はエディターでいつでも変更できます。',
    characterName: 'キャラクター名',
    world: 'ワールド',
    job: 'メインジョブ',
    level: 'レベル',
    startEditing: 'エディターへ進む',
    editor: 'カードエディター',
    savedLocally: 'このブラウザーに保存済み',
    savingLocally: '保存中…',
    saveFailed: '保存容量が不足しています。小さい画像を選んでください。',
    saveAndExport: '保存してエクスポート',
    back: '戻る',
    screenshot: 'スクリーンショット',
    character: 'キャラクター',
    information: '追加情報',
    style: 'スタイル',
    effect: 'エフェクト',
    template: 'テンプレート',
    ratio: 'アスペクト比',
    accent: 'アクセントカラー',
    choosePhoto: 'スクリーンショットを選択',
    photoHint: 'JPG、PNG · 12MB以下',
    zoom: 'ズーム',
    undo: '元に戻す',
    redo: 'やり直す',
    exportEyebrow: '完成',
    exportTitle: 'シェアする準備ができました。',
    exportIntro: '印刷ダイアログからPDFに保存するか、完成したカードを確認できます。',
    printPdf: 'PDFで保存',
    exportNote: '印刷ダイアログで「PDFとして保存」を選ぶと、現在の比率で保存されます。',
    continueEditing: '編集を続ける',
    namePlaceholder: '例: Coner',
    worldPlaceholder: '例: Tonberry',
    jobPlaceholder: '例: Bard',
    bio: 'ひとこと紹介',
    bioPlaceholder: '冒険を一文で表現しましょう。',
    uploadError: '画像を読み込めませんでした。12MB以下のJPGまたはPNGを選んでください。',
    screenshotPrivacy: 'スクリーンショットはこの端末に保存され、カードの画像として使われます。',
    imageScale: '画像の拡大率',
    imagePosition: '画像の位置',
    portrait: '人物を中心',
    center: '中央',
    rightFocus: '右に寄せる',
    leftFocus: '左に寄せる',
    effectsIntro: '仕上げの効果は控えめにするとよく馴染みます。',
    grainEffect: 'フィルム粒子',
    holographicEffect: 'ホログラム光',
    grainDescription: '細かな印刷の質感を加えます。',
    holographicDescription: '画像に淡い色の反射を重ねます。',
  },
};

const editorCopy: Record<AppLocale, Omit<EditorCopy, 'cardPreviewSummary' | 'imageValueLabel'>> = {
  ko: {
    title: '어드벤처 카드 에디터',
    subtitle: '모험가의 이야기를 다듬어 보세요.',
    sections: { screenshot: '스크린샷', character: '캐릭터', information: '추가 정보', template: '템플릿', style: '스타일', effects: '효과' },
    undo: '실행 취소', redo: '다시 실행', reset: '초기화', resetCardPrompt: '이미지·캐릭터 정보·디자인을 초기화할까요?', cancel: '취소', confirmReset: '초기화', template: '템플릿', masterLabel: '마스터', experimentalLabel: '실험', experimentalHint: '완성된 마스터 밖의 레이아웃 변형입니다.', saved: '이 브라우저에 저장됨', saving: '이 브라우저에 저장 중…', saveError: '브라우저 저장 실패', saveErrorCompact: '저장 안 됨', saveErrorRecovery: '현재 편집 내용은 이 화면에 남아 있어요. 새로고침하기 전에 카드를 내보내 주세요.', saveErrorExportAction: '카드 내보내기', hydrating: '저장된 카드를 불러오는 중…', zoom: '확대', zoomIn: '확대하기', zoomOut: '축소하기', fitCanvas: '캔버스 맞춤', uploadScreenshot: '스크린샷 업로드', panMode: '캔버스 이동', ratio: '비율', preview: '미리보기', backToEditor: '편집으로 돌아가기', closeInspector: '인스펙터 닫기', export: '내보내기', safeArea: '안전 영역', canvasLabel: '실시간 캔버스', workspaceLabel: '작업 도구', panHint: 'Space 또는 가운데 버튼을 누른 채 이동',
    templates: { cinematic: '시네마틱', editorial: '에디토리얼', 'id-card': '어드벤처러 ID' },
    templateIntents: { cinematic: '사진이 중심인 포스터', editorial: '이름이 만드는 잡지 표지', 'id-card': '정보를 정돈한 신분증' },
    templateVariation: '레이아웃', variationNames: { a: 'A · 마스터', b: 'B · 실험', c: 'C · 실험' },
    typography: '글꼴 프리셋', typographyNames: { editorial: '에디토리얼', modern: '모던', condensed: '콘덴스드', classic: '클래식', clean: '클린' }, typographyNameFallback: 'Coner', typographySpecimens: '다국어 글꼴 샘플',
    colors: '컬러 팔레트', colorModes: { auto: '자동', custom: '사용자 지정', job: '직업 테마' }, colorNames: { primary: '메인', accent: '포인트', light: '밝은색', dark: '어두운색' }, jobTheme: '직업 테마 사용', jobThemeHint: '선택한 직업의 포인트 컬러와 장식을 적용합니다.', jobMotif: '직업 문양', jobMotifHint: '카드에 선택한 직업의 문양을 표시합니다.', jobIconColor: '문양 색상', useFamilyAccent: '카드 포인트 색상 사용',
    image: '이미지 조절', uploadTitle: '스크린샷 업로드', uploadDescription: 'JPG, PNG 또는 WebP · 최대 24MB', chooseFile: '파일 선택', uploading: '이미지 준비 중…', dropToUpload: '여기에 놓아 업로드', uploadSuccess: '스크린샷을 추가했어요.', replaceImage: '이미지 바꾸기', resetImage: '조절 초기화', sampleArtwork: '예시 스크린샷', sampleArtworkHint: '제공된 게임 스크린샷입니다. 내 이미지를 업로드해 교체할 수 있어요.', sampleBadge: '예시', uploadedScreenshot: '내 스크린샷', dragToReposition: '드래그해 위치 조절', fileTypes: 'JPG · PNG · WebP', privacy: '이미지와 편집 내용은 이 브라우저에 저장됩니다.', uploadError: '이미지를 읽을 수 없습니다. 24MB 이하의 JPG, PNG 또는 WebP를 선택해 주세요.', noImage: '스크린샷을 선택하면 이곳에 표시됩니다.',
    fields: { name: '캐릭터 이름', service: '서비스', region: '지역', world: '월드', dataCenter: '데이터 센터', freeCompany: '자유부대', job: '직업', level: '레벨', race: '종족', clan: '부족', grandCompany: '총사령부', languages: '사용 언어', playStyles: '플레이 스타일', bio: '짧은 소개' },
    informationIntro: '카드에 넣고 싶은 정보만 추가해요.', additionalCharacterDetails: '캐릭터 상세 정보', placeholders: { name: '예: Coner', world: '예: Tonberry', dataCenter: '예: Elemental', freeCompany: '자유부대 이름', job: '예: Bard', race: '예: Miqo’te', clan: '예: Keeper of the Moon', grandCompany: '예: Maelstrom', bio: '모험을 한 문장으로 남겨 보세요.' },
    picker: { search: '옵션 검색', searchPlaceholder: '입력해 검색…', noResults: '검색 결과가 없습니다.', close: '선택창 닫기', clear: '선택 지우기', all: '전체', roleFilter: '역할', categoryFilter: '분류', koreaNoDataCenter: '한국 서비스는 데이터 센터 구분을 표시하지 않습니다.', selectedCount: (count, limit) => `${count} / ${limit} 선택`, maxLanguages: 4, maxPlayStyles: 5 },
    languageOptions: { KO: '한국어', EN: '영어', JA: '일본어', FR: '프랑스어', DE: '독일어', ZH: '중국어' },
    playStyleOptions: { Story: '스토리', Glamour: '글래머', Raids: '레이드', Social: '소셜', Crafting: '제작', Exploration: '탐험', PvP: 'PvP', Frontline: '전장', 'Duty finder': '임무 찾기' },
    imageControls: { x: '가로 위치', y: '세로 위치', scale: '확대', rotation: '회전', brightness: '밝기', contrast: '대비', saturation: '채도', exposure: '노출' },
    moreImageAdjustments: '세부 이미지 조절', worldSearchHint: '서비스나 데이터 센터를 몰라도 월드 이름으로 찾을 수 있어요.', worldFilters: '서비스와 지역 필터는 선택 사항이에요.', worldLocationAuto: '월드를 선택하면 서비스, 지역, 데이터 센터가 자동으로 채워져요.', styleIntro: '글자 모양과 카드 색상을 고릅니다.', colorModesHint: '자동은 스크린샷에 어울리는 색을 고르고, 사용자 지정은 직접 고르며, 직업 테마는 선택한 직업의 색과 장식을 적용해요.', resetCrop: '조절 초기화', effectsHint: '인쇄 질감이나 은은한 빛 반사를 더합니다.', grain: '필름 입자', holographic: '홀로그램 빛', grainDescription: '인쇄물 같은 잔잔한 질감을 더합니다.', holographicDescription: '빛을 받는 듯 은은한 색 반사를 더합니다.',
  },
  en: {
    title: 'Adventurer Card Editor',
    subtitle: 'Shape the story behind your character.',
    sections: { screenshot: 'Screenshot', character: 'Character', information: 'Additional info', template: 'Template', style: 'Style', effects: 'Effects' },
    undo: 'Undo', redo: 'Redo', reset: 'Reset', resetCardPrompt: 'Reset the image, character details and card settings?', cancel: 'Cancel', confirmReset: 'Reset', template: 'Template', masterLabel: 'Master', experimentalLabel: 'Experimental', experimentalHint: 'Layout variations beyond the approved masters.', saved: 'Saved in this browser', saving: 'Saving in this browser…', saveError: 'Could not save in this browser', saveErrorCompact: 'Not saved', saveErrorRecovery: 'Your latest edits are still on this screen. Export a copy before refreshing.', saveErrorExportAction: 'Export a copy', hydrating: 'Restoring saved card…', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fitCanvas: 'Fit canvas', uploadScreenshot: 'Upload screenshot', panMode: 'Pan canvas', ratio: 'Ratio', preview: 'Preview', backToEditor: 'Back to editor', closeInspector: 'Close inspector', export: 'Export', safeArea: 'Safe area', canvasLabel: 'Live canvas', workspaceLabel: 'Workspace', panHint: 'Hold Space or middle mouse to pan',
    templates: { cinematic: 'Cinematic', editorial: 'Editorial', 'id-card': 'Adventurer ID' },
    templateIntents: { cinematic: 'Image first', editorial: 'Typography first', 'id-card': 'Information first' },
    templateVariation: 'Layout', variationNames: { a: 'A · Master', b: 'B · Experimental', c: 'C · Experimental' },
    typography: 'Font presets', typographyNames: { editorial: 'Editorial', modern: 'Modern', condensed: 'Condensed', classic: 'Classic', clean: 'Clean' }, typographyNameFallback: 'Coner', typographySpecimens: 'Multilingual specimens',
    colors: 'Color palette', colorModes: { auto: 'Auto', custom: 'Custom', job: 'Job theme' }, colorNames: { primary: 'Primary', accent: 'Accent', light: 'Light', dark: 'Dark' }, jobTheme: 'Use job theme', jobThemeHint: 'Apply a restrained accent and detail for the selected job.', jobMotif: 'Job motif', jobMotifHint: 'Show the selected job glyph on the card.', jobIconColor: 'Motif color', useFamilyAccent: 'Use family accent',
    image: 'Image adjustment', uploadTitle: 'Upload your screenshot', uploadDescription: 'JPG, PNG or WebP · up to 24 MB', chooseFile: 'Choose file', uploading: 'Preparing image…', dropToUpload: 'Drop to upload', uploadSuccess: 'Screenshot added.', replaceImage: 'Replace image', resetImage: 'Reset adjustments', sampleArtwork: 'Sample screenshot', sampleArtworkHint: 'A supplied in-game screenshot. Upload your own to replace it.', sampleBadge: 'Sample', uploadedScreenshot: 'Your screenshot', dragToReposition: 'Drag to reposition', fileTypes: 'JPG · PNG · WebP', privacy: 'Your image and edits are saved in this browser.', uploadError: 'Could not read this image. Choose a JPG, PNG or WebP under 24 MB.', noImage: 'Choose a screenshot to see it here.',
    fields: { name: 'Character name', service: 'Service', region: 'Region', world: 'World', dataCenter: 'Data center', freeCompany: 'Free company', job: 'Job', level: 'Level', race: 'Race', clan: 'Clan', grandCompany: 'Grand company', languages: 'Languages', playStyles: 'Play styles', bio: 'Short bio' },
    informationIntro: 'Add only the details you want on the card.', additionalCharacterDetails: 'More character details', placeholders: { name: 'e.g. Coner', world: 'e.g. Tonberry', dataCenter: 'e.g. Elemental', freeCompany: 'Free company name', job: 'e.g. Bard', race: 'e.g. Miqo’te', clan: 'e.g. Keeper of the Moon', grandCompany: 'e.g. Maelstrom', bio: 'Describe your adventure in one line.' },
    picker: { search: 'Search options', searchPlaceholder: 'Type to search…', noResults: 'No matching options.', close: 'Close picker', clear: 'Clear selection', all: 'All', roleFilter: 'Role', categoryFilter: 'Category', koreaNoDataCenter: 'Data center grouping is not listed for the Korea service.', selectedCount: (count, limit) => `${count} / ${limit} selected`, maxLanguages: 4, maxPlayStyles: 5 },
    languageOptions: { KO: 'Korean', EN: 'English', JA: 'Japanese', FR: 'French', DE: 'German', ZH: 'Chinese' },
    playStyleOptions: { Story: 'Story', Glamour: 'Glamour', Raids: 'Raids', Social: 'Social', Crafting: 'Crafting', Exploration: 'Exploration', PvP: 'PvP', Frontline: 'Frontline', 'Duty finder': 'Duty finder' },
    imageControls: { x: 'Horizontal position', y: 'Vertical position', scale: 'Scale', rotation: 'Rotation', brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', exposure: 'Exposure' },
    moreImageAdjustments: 'More image adjustments', worldSearchHint: 'Search by world name, even if you do not know its service or data center.', worldFilters: 'Service and region filters are optional.', worldLocationAuto: 'Selecting a world fills in its service, region, and data center.', styleIntro: 'Choose the lettering and card colors.', colorModesHint: 'Auto matches the screenshot colors, Custom lets you pick colors, and Job uses accents from your selected job.', resetCrop: 'Reset adjustments', effectsHint: 'Add a subtle print texture or light reflection.', grain: 'Fine grain', holographic: 'Holographic light', grainDescription: 'Add a fine printed texture.', holographicDescription: 'Lay a restrained color reflection over the image.',
  },
  ja: {
    title: 'アドベンチャーカードエディター',
    subtitle: 'キャラクターの物語を整えましょう。',
    sections: { screenshot: 'スクリーンショット', character: 'キャラクター', information: '追加情報', template: 'テンプレート', style: 'スタイル', effects: 'エフェクト' },
    masterLabel: 'マスター', experimentalLabel: '実験', experimentalHint: 'マスター以外のレイアウトバリエーションです。', fitCanvas: 'キャンバスに合わせる', uploadScreenshot: 'スクリーンショットをアップロード',
    undo: '元に戻す', redo: 'やり直す', reset: 'リセット', resetCardPrompt: '画像・キャラクター情報・デザインを初期化しますか？', cancel: 'キャンセル', confirmReset: 'リセット', template: 'テンプレート', saved: 'このブラウザーに保存済み', saving: 'このブラウザーに保存中…', saveError: 'このブラウザーに保存できませんでした', saveErrorCompact: '未保存', saveErrorRecovery: '最新の編集内容はこの画面に残っています。再読み込みする前にカードをエクスポートしてください。', saveErrorExportAction: 'カードをエクスポート', hydrating: '保存したカードを復元中…', zoom: 'ズーム', zoomIn: '拡大', zoomOut: '縮小', panMode: 'キャンバスを移動', ratio: '比率', preview: 'プレビュー', backToEditor: '編集に戻る', closeInspector: 'インスペクターを閉じる', export: 'エクスポート', safeArea: 'セーフエリア', canvasLabel: 'ライブキャンバス', workspaceLabel: 'ワークスペース', panHint: 'Space または中ボタンを押して移動',
    templates: { cinematic: 'シネマティック', editorial: 'エディトリアル', 'id-card': 'アドベンチャー ID' },
    templateIntents: { cinematic: '写真を主役に', editorial: '文字でつくる表紙', 'id-card': '情報を整える ID' },
    templateVariation: 'レイアウト', variationNames: { a: 'A · マスター', b: 'B · 実験', c: 'C · 実験' },
    typography: 'フォントプリセット', typographyNames: { editorial: 'エディトリアル', modern: 'モダン', condensed: 'コンデンス', classic: 'クラシック', clean: 'クリーン' }, typographyNameFallback: 'Coner', typographySpecimens: '多言語フォント見本',
    colors: 'カラーパレット', colorModes: { auto: '自動', custom: 'カスタム', job: 'ジョブテーマ' }, colorNames: { primary: 'プライマリー', accent: 'アクセント', light: 'ライト', dark: 'ダーク' }, jobTheme: 'ジョブテーマを使う', jobThemeHint: '選択中のジョブに合わせた控えめな色と装飾を適用します。', jobMotif: 'ジョブモチーフ', jobMotifHint: '選択したジョブの紋章をカードに表示します。', jobIconColor: 'モチーフの色', useFamilyAccent: 'カードのアクセント色を使う',
    image: '画像の調整', uploadTitle: 'スクリーンショットをアップロード', uploadDescription: 'JPG、PNG、WebP · 24MB以下', chooseFile: 'ファイルを選択', uploading: '画像を準備中…', dropToUpload: 'ここにドロップしてアップロード', uploadSuccess: 'スクリーンショットを追加しました。', replaceImage: '画像を変更', resetImage: '調整をリセット', sampleArtwork: 'サンプルスクリーンショット', sampleArtworkHint: '提供されたゲーム内スクリーンショットです。ご自身の画像に差し替えられます。', sampleBadge: 'サンプル', uploadedScreenshot: '自分のスクリーンショット', dragToReposition: 'ドラッグして位置を調整', fileTypes: 'JPG · PNG · WebP', privacy: '画像と編集内容はこのブラウザーに保存されます。', uploadError: '画像を読み込めません。24MB以下のJPG、PNG、WebPを選んでください。', noImage: 'スクリーンショットを選択するとここに表示されます。',
    fields: { name: 'キャラクター名', service: 'サービス', region: '地域', world: 'ワールド', dataCenter: 'データセンター', freeCompany: 'フリーカンパニー', job: 'ジョブ', level: 'レベル', race: '種族', clan: '部族', grandCompany: 'グランドカンパニー', languages: '対応言語', playStyles: 'プレイスタイル', bio: 'ひとこと紹介' },
    informationIntro: 'カードに載せたい情報だけ追加できます。', additionalCharacterDetails: 'キャラクターの詳細', placeholders: { name: '例: Coner', world: '例: Tonberry', dataCenter: '例: Elemental', freeCompany: 'フリーカンパニー名', job: '例: Bard', race: '例: Miqo’te', clan: '例: Keeper of the Moon', grandCompany: '例: Maelstrom', bio: '冒険を一文で表現しましょう。' },
    picker: { search: '候補を検索', searchPlaceholder: '入力して検索…', noResults: '一致する候補がありません。', close: 'ピッカーを閉じる', clear: '選択を解除', all: 'すべて', roleFilter: 'ロール', categoryFilter: 'カテゴリー', koreaNoDataCenter: '韓国サービスにはデータセンター区分がありません。', selectedCount: (count, limit) => `${count} / ${limit} 件選択`, maxLanguages: 4, maxPlayStyles: 5 },
    languageOptions: { KO: '韓国語', EN: '英語', JA: '日本語', FR: 'フランス語', DE: 'ドイツ語', ZH: '中国語' },
    playStyleOptions: { Story: 'ストーリー', Glamour: 'ミラプリ', Raids: 'レイド', Social: '交流', Crafting: '製作', Exploration: '探索', PvP: 'PvP', Frontline: 'フロントライン', 'Duty finder': 'コンテンツルーレット' },
    imageControls: { x: '横位置', y: '縦位置', scale: '拡大', rotation: '回転', brightness: '明るさ', contrast: 'コントラスト', saturation: '彩度', exposure: '露出' },
    moreImageAdjustments: '画像の詳細調整', worldSearchHint: 'サービスやデータセンターが分からなくても、ワールド名で検索できます。', worldFilters: 'サービスと地域の絞り込みは任意です。', worldLocationAuto: 'ワールドを選ぶと、サービス・地域・データセンターが自動で入力されます。', styleIntro: '文字の形とカードの色を選びます。', colorModesHint: '自動はスクリーンショットに合う色を選び、カスタムは自分で選び、ジョブテーマは選択中のジョブ色を使います。', resetCrop: '調整をリセット', effectsHint: '印刷のような質感や淡い光の反射を加えます。', grain: 'フィルム粒子', holographic: 'ホログラム光', grainDescription: '細かな印刷の質感を加えます。', holographicDescription: '画像に淡い色の反射を重ねます。',
  },
};

const editorAccessibilityCopy: Record<AppLocale, Pick<EditorCopy, 'cardPreviewSummary' | 'imageValueLabel'>> = {
  ko: {
    cardPreviewSummary: (name, job, world) => ['카드 미리보기', ...(name ? [`캐릭터 ${name}`] : []), ...(job ? [`직업 ${job}`] : []), ...(world ? [`월드 ${world}`] : [])].join(' · '),
    imageValueLabel: (label) => `${label} 값`,
  },
  en: {
    cardPreviewSummary: (name, job, world) => ['Card preview', ...(name ? [`Character ${name}`] : []), ...(job ? [`Job ${job}`] : []), ...(world ? [`World ${world}`] : [])].join(' · '),
    imageValueLabel: (label) => `${label} value`,
  },
  ja: {
    cardPreviewSummary: (name, job, world) => ['カードプレビュー', ...(name ? [`キャラクター ${name}`] : []), ...(job ? [`ジョブ ${job}`] : []), ...(world ? [`ワールド ${world}`] : [])].join('・'),
    imageValueLabel: (label) => `${label}の値`,
  },
};

export function getEditorCopy(locale: string): EditorCopy {
  const resolvedLocale = (locale as AppLocale) in editorCopy ? (locale as AppLocale) : 'ko';
  return { ...editorCopy[resolvedLocale], ...editorAccessibilityCopy[resolvedLocale] };
}

export function getRouteCopy(locale: string): RouteCopy {
  return copy[(locale as AppLocale) in copy ? (locale as AppLocale) : 'ko'];
}

