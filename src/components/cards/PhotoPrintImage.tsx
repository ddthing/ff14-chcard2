'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  getActivePhotoPrintEffects,
  getPhotoPrintEffectKey,
  loadPhotoPrintBlob,
  type PhotoPrintRgb,
} from '@/lib/photo-print-browser';
import type { CardTextureEffect, CardTextureEffectIntensity } from '@/lib/card-texture-effects';
import styles from './PhotoPrintImage.module.css';

type PrintState = 'processing' | 'ready' | 'error';

type PrintResult = {
  source: string;
  effectKey: string;
  state: PrintState;
  objectUrl?: string;
};

function parsePaperRgb(color: string): PhotoPrintRgb {
  const normalized = color.trim().replace(/^#/, '');
  const expanded = normalized.length === 3 || normalized.length === 4
    ? normalized.split('').map((channel) => `${channel}${channel}`).join('')
    : normalized;
  if ((expanded.length !== 6 && expanded.length !== 8) || !/^[0-9a-f]+$/i.test(expanded)) {
    return [255, 255, 255];
  }

  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  return [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(expanded.slice(offset, offset + 2), 16);
    return Math.round(channel * alpha + 255 * (1 - alpha));
  }) as [number, number, number];
}

function resolveComputedPaperRgb(color: string, fallback: PhotoPrintRgb): PhotoPrintRgb {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.fillStyle = `rgb(${fallback.join(',')})`;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]];
  } catch {
    return fallback;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function parseEffectKey(effectKey: string): {
  effects: CardTextureEffect[];
  intensity: Record<string, number>;
  paperRgb: PhotoPrintRgb;
} {
  const [effectPart, paperPart] = effectKey.split('|paper:');
  const effectEntries = effectPart === 'none' ? [] : effectPart.split(',');
  const effects: CardTextureEffect[] = [];
  const intensity: Record<string, number> = {};

  for (const entry of effectEntries) {
    const [effect, value] = entry.split(':');
    if (
      effect === 'xerox' || effect === 'halftone' || effect === 'distressed'
    ) {
      effects.push(effect);
      intensity[effect] = Number(value);
    }
  }

  const channels = (paperPart ?? '255,255,255').split(',').map(Number);
  const paperRgb = channels.length === 3 && channels.every(Number.isFinite)
    ? channels as [number, number, number]
    : [255, 255, 255] as const;
  return { effects, intensity, paperRgb };
}

function fingerprintSource(source: string): string {
  // Keep the DOM marker small even when a local photo is a multi-megabyte data URL.
  // Export also compares the actual image source signature before capture.
  let firstHash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;
  const sampleCount = 96;
  const step = Math.max(1, Math.floor(source.length / sampleCount));
  for (let index = 0, sampled = 0; index < source.length && sampled < sampleCount; index += step, sampled += 1) {
    const code = source.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ code, 0x01000193);
    secondHash = Math.imul(secondHash + code, 0x85ebca6b);
  }
  const lastCode = source.charCodeAt(source.length - 1) || 0;
  firstHash = Math.imul(firstHash ^ lastCode, 0x01000193);
  secondHash = Math.imul(secondHash + lastCode, 0x85ebca6b);
  return `${source.length.toString(36)}-${(firstHash >>> 0).toString(36)}-${(secondHash >>> 0).toString(36)}`;
}

async function decodeGeneratedImage(source: string): Promise<void> {
  const image = new window.Image();
  image.decoding = 'async';
  image.src = source;
  if (typeof image.decode === 'function') {
    await image.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The processed photo could not be decoded.'));
    });
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error('The processed photo has no usable dimensions.');
  }
}

export interface PhotoPrintImageProps {
  source: string;
  alt: string;
  effects: readonly string[];
  effectIntensity?: CardTextureEffectIntensity | Record<string, number>;
  paperColor: string;
  paperContext: string;
}

export function PhotoPrintImage({
  source,
  alt,
  effects,
  effectIntensity,
  paperColor,
  paperContext,
}: PhotoPrintImageProps) {
  const paperHostRef = useRef<HTMLSpanElement | null>(null);
  const [resolvedPaper, setResolvedPaper] = useState<{ context: string; rgb: PhotoPrintRgb } | null>(null);
  const fallbackPaperRgb = parsePaperRgb(paperColor);
  const resolvedPaperRgb = resolvedPaper?.context === paperContext ? resolvedPaper.rgb : null;
  const paperRgb = resolvedPaperRgb ?? fallbackPaperRgb;
  const effectKey = getPhotoPrintEffectKey(effects, effectIntensity, paperRgb);
  const activeEffects = getActivePhotoPrintEffects(effects, effectIntensity);
  const paperIsResolved = activeEffects.length === 0 || resolvedPaperRgb !== null;
  const [result, setResult] = useState<PrintResult | null>(null);
  const matchingResult = result?.source === source && result.effectKey === effectKey ? result : null;
  const state = activeEffects.length === 0
    ? 'disabled'
    : paperIsResolved ? matchingResult?.state ?? 'processing' : 'processing';
  const processedSource = state === 'ready' ? matchingResult?.objectUrl : undefined;
  const markerKey = `${fingerprintSource(source)}|${effectKey}`;

  useEffect(() => {
    const host = paperHostRef.current;
    if (!host) return;
    const cssPaper = window.getComputedStyle(host).color;
    const rgb = resolveComputedPaperRgb(cssPaper, parsePaperRgb(paperColor));
    const update = window.setTimeout(() => setResolvedPaper({ context: paperContext, rgb }), 0);
    return () => window.clearTimeout(update);
  }, [paperContext, paperColor]);

  useEffect(() => {
    const plan = parseEffectKey(effectKey);
    if (!paperIsResolved || plan.effects.length === 0) return;

    let current = true;
    let objectUrl: string | undefined;
    const abortController = new AbortController();
    const debounce = window.setTimeout(() => {
      loadPhotoPrintBlob(source, plan.effects, plan.intensity, plan.paperRgb, abortController.signal)
        .then(async (blob) => {
          objectUrl = URL.createObjectURL(blob);
          await decodeGeneratedImage(objectUrl);
          if (!current) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = undefined;
            return;
          }
          const readyResult = { source, effectKey, state: 'ready' as const, objectUrl };
          setResult(readyResult);
        })
        .catch(() => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
          if (current) {
            const errorResult = { source, effectKey, state: 'error' as const };
            setResult(errorResult);
          }
        });
    }, 110);

    return () => {
      current = false;
      abortController.abort();
      window.clearTimeout(debounce);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setResult((previous) => (
        previous?.source === source && previous.effectKey === effectKey ? null : previous
      ));
    };
  }, [source, effectKey, paperIsResolved]);

  const ready = state === 'disabled' || state === 'ready';
  const meaningfulAlt = state === 'ready' ? '' : alt;

  return (
    <span
      ref={paperHostRef}
      className={styles.imageSet}
      data-photo-print-ready={ready ? 'true' : 'false'}
      data-photo-print-state={state}
      data-photo-print-key={markerKey}
      data-photo-print-error={state === 'error' ? 'processing-failed' : undefined}
    >
      <Image
        src={source}
        alt={meaningfulAlt}
        fill
        sizes="560px"
        loading="eager"
        unoptimized
        draggable={false}
        data-photo-print-fallback="true"
        aria-hidden={state === 'ready' ? true : undefined}
      />
      {processedSource && (
        <Image
          className={styles.processedImage}
          src={processedSource}
          alt={alt}
          fill
          sizes="560px"
          loading="eager"
          decoding="async"
          unoptimized
          draggable={false}
          data-photo-print-result="true"
        />
      )}
    </span>
  );
}
