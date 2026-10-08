import type { Locale } from '@/lib/types';
export const homeCopy = {
  ko: {
    title: '모험을 간직하는\n또 하나의 방식.', description: 'FFXIV 스크린샷을 나만의 모험자 카드로.', create: '카드 만들기', explore: '템플릿 둘러보기',
    stack: '카드 디자인 미리보기', previous: '이전 디자인', next: '다음 디자인', current: '선택한 디자인',
    compareTitle: '한 장의 스크린샷,\n새로운 이야기.', compareDescription: '경계선을 움직여 스크린샷이 카드가 되는 순간을 만나보세요.', screenshot: '스크린샷', card: '완성된 카드', compare: '완성된 카드 표시 비율',
    worldsTitle: '같은 모험.\n서로 다른 세 가지 시선.', cinematic: '시네마틱', editorial: '에디토리얼', identity: '아이덴티티', cinematicText: '빛과 풍경이 이야기를 이끄는 한 장면.', editorialText: '대담한 글자와 인물의 만남.', identityText: '이름, 월드, 그리고 나만의 기록.',
    workflowTitle: '당신의 순간에서,\n당신의 카드까지.', workflowText: '사진을 고르고, 이야기를 담고, 원하는 모습으로 저장하세요.', steps: ['스크린샷 선택', '이야기 담기', '디자인 고르기', '카드 저장'],
    discoveryTitle: '어떤 모습으로\n기억하고 싶나요?', discoveryText: '세 가지 마스터 디자인에서 시작해 보세요.',
    detailTitle: '가까이 볼수록,\n더 선명한 개성.', detailText: '필름의 결, 종이와 잉크, 정돈된 기록. 작은 차이가 카드의 인상을 만듭니다.', detailLabel: '카드 디테일', materials: ['사진과 필름', '종이와 잉크', '매트한 카드지'],
    finalTitle: '다음 모험도,\n당신답게.', finalText: '스크린샷 한 장이면 충분합니다.', alt: '에오르제아의 풍경 속 모험자 Coner', portraitAlt: '붉은 후드를 쓴 모험자 Coner',
  },
  en: {
    title: 'Your adventure.\nWorth keeping.', description: 'Turn your FFXIV screenshot into a designed adventurer card.', create: 'Create your card', explore: 'Explore templates',
    stack: 'Card design preview', previous: 'Previous design', next: 'Next design', current: 'Selected design',
    compareTitle: 'A screenshot.\nA new story.', compareDescription: 'Move the divider to see your screenshot become a card.', screenshot: 'Screenshot', card: 'Finished card', compare: 'Finished card visibility',
    worldsTitle: 'One adventure.\nThree points of view.', cinematic: 'Cinematic', editorial: 'Editorial', identity: 'Identity', cinematicText: 'A scene led by light and landscape.', editorialText: 'Bold type meets a character of your own.', identityText: 'Your name, your world, your record.',
    workflowTitle: 'From your moment\nto your card.', workflowText: 'Choose a screenshot, add your story, then save it your way.', steps: ['Choose a screenshot', 'Add your story', 'Find your design', 'Save your card'],
    discoveryTitle: 'How will you\nremember it?', discoveryText: 'Find your starting point in three master designs.',
    detailTitle: 'Look closer.\nFeel the difference.', detailText: 'Photographic grain, paper and ink, a collected record. Small details give each card its character.', detailLabel: 'Card detail', materials: ['Photographic film', 'Paper and ink', 'Matte card stock'],
    finalTitle: 'Your next adventure.\nMade yours.', finalText: 'All it takes is a screenshot.', alt: 'Coner in an Eorzean landscape', portraitAlt: 'Coner wearing a red hood',
  },
  ja: {
    title: '冒険を残す、\nもうひとつのかたち。', description: 'FFXIVのスクリーンショットを、あなただけの冒険者カードに。', create: 'カードをつくる', explore: 'テンプレートを見る',
    stack: 'カードデザインのプレビュー', previous: '前のデザイン', next: '次のデザイン', current: '選択中のデザイン',
    compareTitle: '一枚の写真から、\n新しい物語へ。', compareDescription: '境界線を動かして、写真がカードになる瞬間を。', screenshot: 'スクリーンショット', card: '完成したカード', compare: '完成したカードの表示割合',
    worldsTitle: 'ひとつの冒険。\n三つのまなざし。', cinematic: 'シネマティック', editorial: 'エディトリアル', identity: 'アイデンティティ', cinematicText: '光と風景が物語を描く一場面。', editorialText: '大胆な文字と、あなたらしい姿。', identityText: '名前、ワールド、あなたの記録。',
    workflowTitle: 'あなたの瞬間を、\nあなたの一枚に。', workflowText: '写真を選び、物語を添えて、好きなかたちで保存。', steps: ['写真を選ぶ', '物語を添える', 'デザインを選ぶ', 'カードを保存'],
    discoveryTitle: 'どんなかたちで\n覚えていたい？', discoveryText: '三つのマスターデザインから始めましょう。',
    detailTitle: '近づくほど、\n感じる個性。', detailText: 'フィルムの粒子、紙とインク、整った記録。小さな違いがカードの表情をつくります。', detailLabel: 'カードのディテール', materials: ['写真とフィルム', '紙とインク', 'マットなカード紙'],
    finalTitle: '次の冒険も、\nあなたらしく。', finalText: 'スクリーンショット一枚から。', alt: 'エオルゼアの風景の中の冒険者Coner', portraitAlt: '赤いフードをかぶったConer',
  },
} satisfies Record<Locale, object>;
