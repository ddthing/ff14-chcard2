import type { Locale } from "@/lib/types";

import styles from "./ffxiv-attribution.module.css";

const copy: Record<Locale, string> = {
  ko: "비공식 팬 프로젝트 · SQUARE ENIX와 제휴 또는 승인을 받지 않았습니다",
  en: "Unofficial fan project · Not affiliated with or endorsed by Square Enix",
  ja: "非公式ファンプロジェクト · SQUARE ENIX の提携・承認を受けていません",
};

export type FFXIVAttributionProps = {
  locale?: Locale;
  className?: string;
  /** Render copyright only on a surface that actually includes licensed material. */
  officialAssetsUsed?: boolean;
  /** Selects the regional line required for Korean-service material. */
  service?: "GLOBAL" | "KOREA";
  /** Card artwork uses the same concise credit in every ratio and locale. */
  variant?: "site" | "card";
};

export function FFXIVAttribution({
  locale = "en",
  className,
  officialAssetsUsed = false,
  service = "GLOBAL",
  variant = "site",
}: FFXIVAttributionProps) {
  const classes = [styles.attribution, className].filter(Boolean).join(" ");
  if (variant === "card") {
    return <small className={classes}><span>© SQUARE ENIX</span></small>;
  }
  const copyright =
    service === "KOREA"
      ? "© SQUARE ENIX Published in Korea by Actoz Soft CO., LTD."
      : "© SQUARE ENIX";
  const koreanTrademarkNotice =
    "기재되어있는 회사 명 · 제품명 · 시스템 이름은 해당 소유자의 상표 또는 등록 상표입니다.";

  return (
    <small className={classes}>
      {officialAssetsUsed ? (
        <>
          <span>{copyright}</span>
          {service === "KOREA" ? (
            <span lang="ko">{koreanTrademarkNotice}</span>
          ) : null}
          <span className={styles.separator} aria-hidden="true">
            ·
          </span>
        </>
      ) : null}
      <span>{copy[locale]}</span>
    </small>
  );
}
