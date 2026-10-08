"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CardPreview } from "@/components/editor/card-preview";
import { getConerSample, type AdventurerCardTemplate, type CardRatio } from "@/components/cards/types";
import type { Locale } from "@/lib/types";
import { conerSample } from "@/data/samples/coner";
import { localizeFfxivLabel } from "@/data/ffxiv";
import { localizeCardWorld } from "@/lib/card-microcopy";
import { getLatestVisibility } from "./visibility";

export interface LazyMasterProps { template: AdventurerCardTemplate; ratio: CardRatio; locale: Locale; eager?: boolean; className?: string }
const artworkLabels = {
  ko: { cinematic: '시네마틱 카드', editorial: '에디토리얼 카드', 'id-card': '아이덴티티 카드', level: '레벨', sample: '예시 카드' },
  en: { cinematic: 'Cinematic card', editorial: 'Editorial card', 'id-card': 'Identity card', level: 'level', sample: 'Sample card' },
  ja: { cinematic: 'シネマティックカード', editorial: 'エディトリアルカード', 'id-card': 'アイデンティティカード', level: 'レベル', sample: 'サンプルカード' },
};
/** Admit below-fold art once, then preserve its fitted type and font readiness. */
export const LazyMaster = memo(function LazyMaster({ template, ratio, locale, eager = false, className }: LazyMasterProps) {
  const host = useRef<HTMLDivElement>(null);
  const [admitted, setAdmitted] = useState(eager);
  const data = useMemo(() => getConerSample(template, ratio), [template, ratio]);
  useEffect(() => {
    if (eager || admitted || !host.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setAdmitted(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      const next = getLatestVisibility(entries, host.current);
      if (next === true) {
        setAdmitted(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [eager, admitted]);
  const character = conerSample.character;
  const labels = artworkLabels[locale];
  const description = `${labels.sample}: ${character.name}, ${labels[template]}, ${localizeFfxivLabel('job', character.jobId, locale)}, ${labels.level} ${character.level}, ${localizeCardWorld(character, locale)}, ${localizeFfxivLabel('dataCenter', character.dataCenterId ?? character.dataCenter, locale)}, ${ratio}`;
  return <div ref={host} className={className} role="img" aria-label={description} data-marketing-card={template} data-mounted={eager || admitted} style={{ aspectRatio: ratio.replace(":", "/"), width: "100%" }}>
    {(eager || admitted) && <div aria-hidden="true" style={{ display: "contents" }}><CardPreview data={data} locale={locale} /></div>}
  </div>;
});
