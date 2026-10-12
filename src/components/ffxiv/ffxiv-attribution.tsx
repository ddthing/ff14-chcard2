import type { Locale } from "@/lib/types";

import styles from "./ffxiv-attribution.module.css";

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
  className,
  officialAssetsUsed = false,
  service = "GLOBAL",
  variant = "site",
}: FFXIVAttributionProps) {
  const classes = [styles.attribution, className].filter(Boolean).join(" ");
  if (variant === "card") {
    return <small className={classes}><span>© SQUARE ENIX</span></small>;
  }
  if (!officialAssetsUsed) return null;
  const copyright =
    service === "KOREA"
      ? "© SQUARE ENIX Published in Korea by Actoz Soft CO., LTD."
      : "© SQUARE ENIX";
  return (
    <small className={classes} data-attribution-variant="site">
      <span>{copyright}</span>
    </small>
  );
}
