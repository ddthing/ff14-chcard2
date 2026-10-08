"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/types";
import {
  getStoredLocale,
  LOCALE_CHANGE_EVENT,
  setStoredLocale,
  syncLocaleFromStorageEvent,
} from "@/lib/locale-preference";

export { SUPPORTED_LOCALES, type Locale };

type MessageTable = Record<string, string>;

export const messages: Record<Locale, MessageTable> = {
  ko: {
    "nav.home": "홈",
    "nav.templates": "템플릿",
    "nav.create": "카드 만들기",
    "nav.editor": "에디터",
    "nav.export": "내보내기",
    "nav.skipToContent": "본문으로 건너뛰기",
    "nav.language": "언어 선택",
    "nav.primary": "주요 메뉴",
    "header.brand": "XIV Adventurer Card 홈",
    "header.create": "카드 만들기",
    "home.hero.eyebrow": "에오르제아의 모험가 카드",
    "home.hero.title": "에오르제아의\n여정을 한 장에.",
    "home.hero.description": "가장 좋아하는 스크린샷을, 오래 간직하고 싶은 모험가 카드로.",
    "home.hero.create": "내 카드 만들기",
    "home.hero.explore": "템플릿 둘러보기",
    "home.gallery.eyebrow": "카드 템플릿",
    "home.gallery.title": "하나의 모험, 세 가지 시선.",
    "home.gallery.description": "당신의 스크린샷과 캐릭터에 어울리는 스타일을 골라보세요.",
    "home.gallery.cinematic": "시네마틱",
    "home.gallery.cinematicDescription": "영화의 한 장면처럼, 스크린샷을 가장 빛나는 순간으로.",
    "home.gallery.editorial": "에디토리얼",
    "home.gallery.editorialDescription": "이름과 여정을 여백 있게 담아낸 에디토리얼.",
    "home.gallery.id": "모험가 기록",
    "home.gallery.idDescription": "월드와 자유부대까지, 모험가의 정보를 한눈에.",
    "home.gallery.viewAll": "모든 템플릿 보기",
    "home.ratio.eyebrow": "하나의 카드, 다양한 프레임",
    "home.ratio.title": "어디에나 어울리는 모험.",
    "home.ratio.description": "같은 캐릭터와 스크린샷을 원하는 비율에 맞춰 다시 구성해보세요.",
    "home.ratio.name.square": "정사각형",
    "home.ratio.name.feed": "피드",
    "home.ratio.name.portrait": "포스터",
    "home.ratio.name.story": "스토리",
    "home.ratio.name.wide": "와이드",
    "home.ratio.cta": "내 카드 만들기",
  },
  en: {
    "nav.home": "Home",
    "nav.templates": "Templates",
    "nav.create": "Create a card",
    "nav.editor": "Editor",
    "nav.export": "Export",
    "nav.skipToContent": "Skip to content",
    "nav.language": "Choose language",
    "nav.primary": "Primary navigation",
    "header.brand": "XIV Adventurer Card home",
    "header.create": "Create a card",
    "home.hero.eyebrow": "A CHARACTER CARD FOR FFXIV",
    "home.hero.title": "Your Eorzea,\nbeautifully kept.",
    "home.hero.description": "Turn a favorite screenshot into a portrait of the adventurer behind it.",
    "home.hero.create": "Create your card",
    "home.hero.explore": "Explore templates",
    "home.gallery.eyebrow": "THE CARD COLLECTION",
    "home.gallery.title": "One adventure. Three perspectives.",
    "home.gallery.description": "Find the visual language that fits your screenshot and character.",
    "home.gallery.cinematic": "Cinematic",
    "home.gallery.cinematicDescription": "A frame worthy of the moments you want to remember.",
    "home.gallery.editorial": "Editorial",
    "home.gallery.editorialDescription": "A quiet, magazine-like portrait of your character.",
    "home.gallery.id": "Adventurer Record",
    "home.gallery.idDescription": "A guild record of your life in Eorzea.",
    "home.gallery.viewAll": "View all templates",
    "home.ratio.eyebrow": "BUILT FOR EVERY FRAME",
    "home.ratio.title": "The right shape for every story.",
    "home.ratio.description": "Recompose the same character and screenshot for the way you want to share it.",
    "home.ratio.name.square": "Square",
    "home.ratio.name.feed": "Feed",
    "home.ratio.name.portrait": "Poster",
    "home.ratio.name.story": "Story",
    "home.ratio.name.wide": "Wide",
    "home.ratio.cta": "Create your card",
  },
  ja: {
    "nav.home": "ホーム",
    "nav.templates": "テンプレート",
    "nav.create": "カードをつくる",
    "nav.editor": "エディター",
    "nav.export": "エクスポート",
    "nav.skipToContent": "本文へ移動",
    "nav.language": "言語を選択",
    "nav.primary": "メインナビゲーション",
    "header.brand": "XIV Adventurer Card ホーム",
    "header.create": "カードをつくる",
    "home.hero.eyebrow": "エオルゼアの冒険者カード",
    "home.hero.title": "エオルゼアの旅を\n一枚に。",
    "home.hero.description": "お気に入りのスクリーンショットを、ずっと残したい冒険者カードに。",
    "home.hero.create": "カードをつくる",
    "home.hero.explore": "テンプレートを見る",
    "home.gallery.eyebrow": "カードテンプレート",
    "home.gallery.title": "ひとつの冒険に、三つの表情。",
    "home.gallery.description": "スクリーンショットとキャラクターに似合うスタイルを。",
    "home.gallery.cinematic": "シネマティック",
    "home.gallery.cinematicDescription": "心に残る瞬間を、映画のワンシーンのように。",
    "home.gallery.editorial": "エディトリアル",
    "home.gallery.editorialDescription": "キャラクターの物語を、雑誌のように美しく。",
    "home.gallery.id": "冒険者の記録",
    "home.gallery.idDescription": "ワールドやフリーカンパニーも、一枚に。",
    "home.gallery.viewAll": "すべてのテンプレートを見る",
    "home.ratio.eyebrow": "さまざまなフレームに",
    "home.ratio.title": "物語に似合うかたち。",
    "home.ratio.description": "同じキャラクターとスクリーンショットを、シェアしたい比率に合わせて。",
    "home.ratio.name.square": "スクエア",
    "home.ratio.name.feed": "フィード",
    "home.ratio.name.portrait": "ポスター",
    "home.ratio.name.story": "ストーリー",
    "home.ratio.name.wide": "ワイド",
    "home.ratio.cta": "カードをつくる",
  },
};

function subscribeToLocaleChanges(onChange: () => void) {
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  const onStorage = (event: StorageEvent) => {
    if (!syncLocaleFromStorageEvent(window, event.key, event.newValue)) return;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<Locale>(
    subscribeToLocaleChanges,
    () => getStoredLocale(window),
    () => "ko",
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    if (!setStoredLocale(window, nextLocale)) return;
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const t = useCallback(
    (key: string) => messages[locale][key] ?? messages.ko[key] ?? key,
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside LocaleProvider.");
  }
  return context;
}
