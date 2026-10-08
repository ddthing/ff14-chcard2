"use client";
import { memo, useEffect, useRef, useState } from "react";
import { AdventurerIdCard, CinematicCard, EditorialCard } from "@/components/cards";
import { getConerSample, type AdventurerCardTemplate, type CardRatio } from "@/components/cards/types";
import type { Locale } from "@/lib/types";
import { conerSample } from "@/data/samples/coner";
import { localizeFfxivLabel } from "@/data/ffxiv";
import { getLatestVisibility } from "./visibility";

export interface LazyMasterProps { template: AdventurerCardTemplate; ratio: CardRatio; locale: Locale; eager?: boolean; className?: string }
const artworkLabels = {
  ko: { cinematic: '시네마틱 카드', editorial: '에디토리얼 카드', 'id-card': '아이덴티티 카드', level: '레벨' },
  en: { cinematic: 'Cinematic card', editorial: 'Editorial card', 'id-card': 'Identity card', level: 'level' },
  ja: { cinematic: 'シネマティックカード', editorial: 'エディトリアルカード', 'id-card': 'アイデンティティカード', level: 'レベル' },
};
/** Real masters, reserved geometry and viewport admission for below-fold art. */
export const LazyMaster = memo(function LazyMaster({ template, ratio, locale, eager = false, className }: LazyMasterProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (eager || !host.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      const next = getLatestVisibility(entries, host.current);
      if (next !== undefined) setVisible(next);
    }, { rootMargin: "360px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [eager]);
  const Card = template === "cinematic" ? CinematicCard : template === "editorial" ? EditorialCard : AdventurerIdCard;
  const character = conerSample.character;
  const labels = artworkLabels[locale];
  const description = `${character.name}, ${labels[template]}, ${localizeFfxivLabel('job', character.jobId, locale)}, ${labels.level} ${character.level}, ${character.world}, ${character.dataCenter}, ${ratio}`;
  return <div ref={host} className={className} role="img" aria-label={description} data-marketing-card={template} data-mounted={eager || visible} style={{ aspectRatio: ratio.replace(":", "/"), width: "100%" }}>
    {(eager || visible) && <div aria-hidden="true" style={{ display: "contents" }}><Card data={getConerSample(template, ratio)} ratio={ratio} locale={locale} /></div>}
  </div>;
});
