'use client';

import Image from 'next/image';
import { useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';

import { getJob } from '@/data/ffxiv';
import {
  resolveJobIcon,
  type JobIconAppearance,
  type JobIconUsage,
} from '@/lib/ffxiv-assets/job-icon-resolver';

import { isCurrentJobIconRequest, isCurrentJobIconSource, resolveJobIconFallbackMark } from './job-icon-fallback';
import styles from './job-icon.module.css';

export type JobIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'display';

export type JobIconProps = {
  jobId?: string | null;
  role?: string | null;
  label?: string;
  /** Semantic size token, or a legacy pixel size. */
  size?: JobIconSize | number;
  className?: string;
  decorative?: boolean;
  /** Null inherits the card's family accent. */
  iconColor?: string | null;
  usage?: JobIconUsage;
  appearance?: JobIconAppearance;
};

type JobIconStyle = CSSProperties & {
  '--job-icon-color'?: string;
  '--job-icon-mask-image'?: string;
};

function safeIconColor(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(candidate)
    ? candidate
    : null;
}

function sourceMatches(image: HTMLImageElement, source: string): boolean {
  const expectedSource = new URL(source, image.ownerDocument.baseURI).href;
  return isCurrentJobIconSource(expectedSource, image.src, image.currentSrc);
}

export function JobIcon({
  jobId,
  role,
  label,
  size = 'sm',
  className,
  decorative = true,
  iconColor,
  usage = 'micro',
  appearance = 'tinted',
}: JobIconProps) {
  const sourceImageRef = useRef<HTMLImageElement>(null);
  const [failureState, setFailureState] = useState<{ jobId: string | null | undefined; sources: string[] }>(() => ({
    jobId,
    sources: [],
  }));
  const failedSources = failureState.jobId === jobId ? failureState.sources : [];
  const resolved = resolveJobIcon({ jobId, usage, appearance, failedSources });
  const job = jobId ? getJob(jobId) : undefined;
  const fallbackMark = resolveJobIconFallbackMark(role, job?.category ?? job?.role, job?.abbreviation, usage);
  const accessibleLabel = label ?? `${job?.localizedName.en ?? role ?? 'Job'} symbol`;
  const customIconColor = safeIconColor(iconColor);
  const sizeToken = typeof size === 'string' ? size : undefined;
  const style: JobIconStyle = {};
  const resolvedAssetStyle: CSSProperties | undefined = resolved
    ? {
      transform: `translate(${resolved.opticalOffsetX * 100}%, ${resolved.opticalOffsetY * 100}%) scale(${resolved.visualScale})`,
    }
    : undefined;

  if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
    style.width = `${size}px`;
    style.height = `${size}px`;
    style.fontSize = `${Math.max(10, Math.round(size * 0.38))}px`;
  }

  if (customIconColor) style['--job-icon-color'] = customIconColor;
  if (resolved?.renderAs === 'mask') style['--job-icon-mask-image'] = `url("${resolved.src}")`;

  function markSourceFailed(source: string, image: HTMLImageElement) {
    const sourceIsCurrent = sourceMatches(image, source);
    if (!isCurrentJobIconRequest(
      image,
      sourceImageRef.current,
      image.isConnected !== false,
      sourceIsCurrent,
    )) return;
    setFailureState(previous => {
      const previousSources = previous.jobId === jobId ? previous.sources : [];
      return previousSources.includes(source)
        ? previous
        : { jobId, sources: [...previousSources, source] };
    });
  }

  function handleMaskLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (!resolved || !sourceMatches(event.currentTarget, resolved.src)) return;
    const image = event.currentTarget;
    if (typeof image.decode !== 'function') return;
    void image.decode().catch(() => markSourceFailed(resolved.src, image));
  }

  function handleMaskError(event: SyntheticEvent<HTMLImageElement>) {
    if (!resolved) return;
    markSourceFailed(resolved.src, event.currentTarget);
  }

  const classes = [styles.jobIcon, className].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      data-size={sizeToken}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      title={decorative ? undefined : accessibleLabel}
      data-icon-source={resolved?.source ?? 'fallback'}
    >
      {resolved ? resolved.renderAs === 'mask' ? (
        <>
          <span className={styles.officialGlyph} style={resolvedAssetStyle} aria-hidden="true" />
          <Image
            key={`${jobId ?? ''}:${resolved.src}`}
            ref={sourceImageRef}
            className={styles.preloadImage}
            style={resolvedAssetStyle}
            src={resolved.src}
            width={resolved.width}
            height={resolved.height}
            alt=""
            aria-hidden="true"
            loading="eager"
            unoptimized
            onLoad={handleMaskLoad}
            onError={handleMaskError}
          />
        </>
      ) : (
        <Image
          key={`${jobId ?? ''}:${resolved.src}`}
          ref={sourceImageRef}
          className={styles.sourceImage}
          style={resolvedAssetStyle}
          src={resolved.src}
          width={resolved.width}
          height={resolved.height}
          alt=""
          aria-hidden="true"
          loading="eager"
          unoptimized
          onLoad={handleMaskLoad}
          onError={handleMaskError}
        />
      ) : (
        <span className={styles.roleMark} aria-hidden="true">
          {fallbackMark}
        </span>
      )}
    </span>
  );
}
