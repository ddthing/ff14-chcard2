"use client";
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { FFXIVAttribution } from '@/components/ffxiv';
import { LazyMaster } from '@/components/marketing/lazy-master';
import { conerSample } from '@/data/samples/coner';
import { MASTER_TEMPLATE_ORDER } from '@/lib/master-card-config';
import { homeCopy } from './home-copy';
import styles from './home.module.css';

export default function HomePage() {
  const { locale } = useI18n();
  const copy = homeCopy[locale];
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState(1);
  const compare = useRef<HTMLDivElement>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = compareInput.current;
    if (input) input.setAttribute('aria-valuetext', `${input.value}% ${copy.card}`);
  }, [copy.card]);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const names = [copy.cinematic, copy.editorial, copy.identity];
  const descriptions = [copy.cinematicText, copy.editorialText, copy.identityText];
  function turn(direction: number) { setActive(value => (value + direction + 3) % 3); }
  function pointerDepth(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width - .5) * 5}deg`);
    event.currentTarget.style.setProperty('--pointer-y', `${-((event.clientY - bounds.top) / bounds.height - .5) * 4}deg`);
  }
  function resetDepth(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty('--pointer-x', '0deg');
    event.currentTarget.style.setProperty('--pointer-y', '0deg');
  }
  function endGesture(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current) {
      const dx = event.clientX - gesture.current.x;
      const dy = event.clientY - gesture.current.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
    }
    gesture.current = null;
  }
  return <div className={styles.page} lang={locale}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <h1 id="home-title">{copy.title}</h1>
        <p>{copy.description}</p>
      </div>
      <div className={styles.heroVisual} role="region" aria-roledescription="carousel" aria-label={copy.stack}>
        <div className={styles.stack} onPointerMove={pointerDepth} onPointerLeave={resetDepth}
          onPointerDown={event => { gesture.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={endGesture} onPointerCancel={() => { gesture.current = null; }}>
          {MASTER_TEMPLATE_ORDER.map((template, index) => <div key={template} className={styles.stackCard} data-position={(index - active + 3) % 3} aria-hidden={index !== active}>
            <div className={styles.cardEntrance} style={{ '--delay': `${250 + index * 130}ms` } as CSSProperties}>
              <LazyMaster template={template} ratio="4:5" locale={locale} eager />
            </div>
          </div>)}
        </div>
        <div className={styles.stackControls}>
          <button type="button" aria-label={copy.previous} onClick={() => turn(-1)}>←</button>
          <span aria-live="polite" aria-atomic="true"><span className={styles.srOnly}>{copy.current}: </span>{names[active]}</span>
          <button type="button" aria-label={copy.next} onClick={() => turn(1)}>→</button>
        </div>
      </div>
      <div className={styles.heroActions}>
        <Link className={styles.primary} href="/create">{copy.create}<span aria-hidden="true">↗</span></Link>
        <Link className={styles.secondary} href="/templates">{copy.explore}</Link>
      </div>
    </section>

    <section className={styles.compareSection} aria-labelledby="compare-title">
      <div className={styles.sectionHead}><h2 id="compare-title">{copy.compareTitle}</h2><p>{copy.compareDescription}</p></div>
      <div ref={compare} className={styles.compare} data-compare style={{ '--compare': '50%' } as CSSProperties}>
        <div className={styles.compareAfter}><LazyMaster template="cinematic" ratio="16:9" locale={locale} /></div>
        <div className={styles.compareBefore}><Image src={conerSample.screenshots.landscape.optimized} alt={copy.alt} fill sizes="(max-width: 768px) 90vw, 1100px" /></div>
        <span className={styles.divider} aria-hidden="true"><span>↔</span></span>
        <input ref={compareInput} className={styles.compareInput} type="range" min="0" max="100" defaultValue="50" aria-label={copy.compare} onInput={event => {
          const value = event.currentTarget.value;
          compare.current?.style.setProperty('--compare', `${100 - Number(value)}%`);
          event.currentTarget.setAttribute('aria-valuetext', `${value}% ${copy.card}`);
        }} />
      </div>
      <div className={styles.compareLabels}><span>{copy.screenshot}</span><span>{copy.card}</span></div>
    </section>

    <section className={styles.worlds} aria-labelledby="worlds-title">
      <h2 id="worlds-title">{copy.worldsTitle}</h2>
      <article className={styles.cinematicWorld}>
        <div className={styles.wideArt}><LazyMaster template="cinematic" ratio="16:9" locale={locale} /></div>
        <div className={styles.caption}><h3>{copy.cinematic}</h3><p>{copy.cinematicText}</p></div>
      </article>
      <div className={styles.portraitWorlds}>
        <article className={styles.editorialWorld}>
          <div className={styles.portraitArt}><LazyMaster template="editorial" ratio="4:5" locale={locale} /></div>
          <div className={styles.caption}><h3>{copy.editorial}</h3><p>{copy.editorialText}</p></div>
        </article>
        <article className={styles.identityWorld}>
          <div className={styles.caption}><h3>{copy.identity}</h3><p>{copy.identityText}</p></div>
          <div className={styles.identityArt}><LazyMaster template="id-card" ratio="3:4" locale={locale} /></div>
        </article>
      </div>
    </section>

    <section className={styles.workflow} aria-labelledby="workflow-title">
      <div className={styles.sectionHead}><h2 id="workflow-title">{copy.workflowTitle}</h2><p>{copy.workflowText}</p></div>
      <ol className={styles.story} data-scroll-story>
        <li><div className={styles.storyImage}><Image src={conerSample.screenshots.portrait.optimized} alt={copy.portraitAlt} width={2160} height={3840} sizes="(max-width: 767px) 45vw, 260px" /></div><h3>{copy.steps[0]}</h3></li>
        <li className={styles.storyDetails}><div><strong>{conerSample.character.name}</strong><p>Red Mage / 100</p><p>Moogle / Chaos</p><p>{conerSample.character.bio}</p></div><h3>{copy.steps[1]}</h3></li>
        <li><LazyMaster template="editorial" ratio="4:5" locale={locale} /><h3>{copy.steps[2]}</h3></li>
        <li className={styles.storySaved}><LazyMaster template="editorial" ratio="4:5" locale={locale} /><h3>{copy.steps[3]}</h3></li>
      </ol>
    </section>

    <section className={styles.discovery} aria-labelledby="discovery-title">
      <h2 id="discovery-title">{copy.discoveryTitle}</h2>
      <p>{copy.discoveryText}</p>
      <div className={styles.discoveryLinks}>{MASTER_TEMPLATE_ORDER.map((template, index) => <Link key={template} href={`/templates#${template}`}><span>{names[index]}</span><span className={styles.discoveryDescription}>{descriptions[index]}</span><span aria-hidden="true">↗</span></Link>)}</div>
    </section>

    <section className={styles.details} aria-labelledby="detail-title">
      <div className={styles.detailCopy}><h2 id="detail-title">{copy.detailTitle}</h2><p>{copy.detailText}</p>
        <div className={styles.materialControls} role="group" aria-label={copy.detailLabel}>{names.map((name, index) => <button type="button" key={name} aria-pressed={detail === index} onClick={() => setDetail(index)}>{name}</button>)}</div>
        <p className={styles.materialLabel} aria-live="polite">{copy.materials[detail]}</p>
      </div>
      <div className={styles.detailCrop} role="img" aria-label={`${names[detail]}: ${copy.materials[detail]}`}><div className={styles.detailZoom} aria-hidden="true"><LazyMaster key={detail} template={MASTER_TEMPLATE_ORDER[detail]} ratio="4:5" locale={locale} /></div></div>
    </section>

    <section className={styles.final} aria-labelledby="final-title"><h2 id="final-title">{copy.finalTitle}</h2><p>{copy.finalText}</p><Link className={styles.primary} href="/create">{copy.create}<span aria-hidden="true">↗</span></Link></section>
    <footer className={styles.footer}><span>XIV Adventurer Card</span><FFXIVAttribution locale={locale} officialAssetsUsed /></footer>
  </div>;
}
