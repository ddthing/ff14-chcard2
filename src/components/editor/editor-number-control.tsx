'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type CompositionEvent, type FocusEvent, type KeyboardEvent } from 'react';
import {
  formatEditorNumber,
  getDisplayedEditorRange,
  normalizeEditorNumber,
  parseDisplayedEditorRangeValue,
  parseEditorNumberDraft,
} from './editor-number-control-model';
import styles from './editor-number-control.module.css';

const RANGE_ADJUSTMENT_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

export interface EditorNumberControlProps {
  value: number;
  min: number;
  max: number;
  step: number;
  displayMultiplier?: number;
  unit?: string;
  label: string;
  ariaLabel?: string;
  /** Localized current value announced by the slider, for example "92.5%". */
  valueLabel?: string;
  disabled?: boolean;
  className?: string;
  onValueChange: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

export function EditorNumberControl({
  value,
  min,
  max,
  step,
  displayMultiplier = 1,
  unit,
  label,
  ariaLabel,
  valueLabel,
  disabled = false,
  className,
  onValueChange,
  onInteractionStart,
  onInteractionEnd,
}: EditorNumberControlProps) {
  const id = useId();
  const rangeId = `${id}-range`;
  const numberId = `${id}-number`;
  const normalizedValue = normalizeEditorNumber(value, min, max, step);
  const formattedValue = formatEditorNumber(normalizedValue, step, displayMultiplier);
  const displayedRange = getDisplayedEditorRange(normalizedValue, min, max, step, displayMultiplier);
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const controlRoot = useRef<HTMLDivElement>(null);
  const numberInput = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  const cancelOnBlur = useRef(false);
  const interactionActive = useRef(false);
  const interactionEnd = useRef(onInteractionEnd);

  useEffect(() => {
    interactionEnd.current = onInteractionEnd;
  }, [onInteractionEnd]);

  useEffect(() => {
    if (disabled && numberInput.current && document.activeElement === numberInput.current) {
      cancelOnBlur.current = true;
      numberInput.current.blur();
    }
  }, [disabled]);

  useEffect(() => () => {
    if (interactionActive.current) interactionEnd.current?.();
    interactionActive.current = false;
  }, []);

  function beginInteraction() {
    if (disabled || interactionActive.current) return;
    interactionActive.current = true;
    onInteractionStart?.();
  }

  function endInteraction() {
    if (!interactionActive.current) return;
    interactionActive.current = false;
    interactionEnd.current?.();
  }

  function endInteractionIfFocusLeavesControl(event: FocusEvent<HTMLInputElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && controlRoot.current?.contains(nextTarget)) return;
    endInteraction();
  }

  function acceptDraft(rawValue: string, commit: boolean) {
    const parsed = parseEditorNumberDraft(rawValue, displayMultiplier);
    if (parsed === null) {
      if (commit) setDraft(formattedValue);
      return;
    }

    const nextValue = normalizeEditorNumber(parsed, min, max, step);
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    const isWithinRange = parsed >= lower && parsed <= upper;
    if ((isWithinRange || commit) && nextValue !== normalizedValue) onValueChange(nextValue);
    if (commit) setDraft(formatEditorNumber(nextValue, step, displayMultiplier));
  }

  function handleNumberChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.currentTarget.value;
    setDraft(rawValue);
    if (isComposing.current || (event.nativeEvent as InputEvent).isComposing) return;
    acceptDraft(rawValue, false);
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    isComposing.current = false;
    const rawValue = event.currentTarget.value;
    setDraft(rawValue);
    acceptDraft(rawValue, false);
  }

  function handleNumberBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    if (cancelOnBlur.current || disabled) {
      cancelOnBlur.current = false;
    } else {
      acceptDraft(event.currentTarget.value, true);
    }
    endInteractionIfFocusLeavesControl(event);
  }

  function handleNumberKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || isComposing.current) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Valid drafts were already applied; Escape only drops an unfinished value.
      cancelOnBlur.current = true;
      event.currentTarget.blur();
    }
  }

  function handleRangeChange(event: ChangeEvent<HTMLInputElement>) {
    const modelValue = parseDisplayedEditorRangeValue(Number(event.currentTarget.value), displayMultiplier);
    if (modelValue === null) return;
    onValueChange(normalizeEditorNumber(modelValue, min, max, step));
  }

  function handleRangeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (RANGE_ADJUSTMENT_KEYS.has(event.key) && !event.repeat) beginInteraction();
  }

  const rootClassName = className ? `${styles.control} ${className}` : styles.control;
  const controlLabel = ariaLabel ?? label;
  const accessibleValue = valueLabel ?? `${formattedValue}${unit ? ` ${unit}` : ''}`;

  return (
    <div ref={controlRoot} className={rootClassName} data-disabled={disabled || undefined}>
      <label className={styles.label} htmlFor={rangeId}>{label}</label>
      <div className={styles.adjustment}>
        <input
          id={rangeId}
          className={styles.range}
          type="range"
          min={displayedRange.min}
          max={displayedRange.max}
          step={displayedRange.step}
          value={displayedRange.value}
          disabled={disabled}
          aria-label={controlLabel}
          aria-valuetext={accessibleValue}
          onPointerDown={beginInteraction}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onKeyDown={handleRangeKeyDown}
          onKeyUp={(event) => {
            if (RANGE_ADJUSTMENT_KEYS.has(event.key)) endInteraction();
          }}
          onBlur={endInteractionIfFocusLeavesControl}
          onChange={handleRangeChange}
        />
        <span className={styles.numberField} data-unit={Boolean(unit)}>
          <input
            id={numberId}
            className={styles.numberInput}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            ref={numberInput}
            value={isFocused ? draft : formattedValue}
            disabled={disabled}
            aria-label={unit ? `${controlLabel} (${unit})` : controlLabel}
            data-editor-numeric-input="true"
            onFocus={() => {
              setIsFocused(true);
              setDraft(formattedValue);
              beginInteraction();
            }}
            onChange={handleNumberChange}
            onBlur={handleNumberBlur}
            onCompositionStart={() => { isComposing.current = true; }}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleNumberKeyDown}
          />
          {unit && <span className={styles.unit} aria-hidden="true">{unit}</span>}
        </span>
      </div>
    </div>
  );
}
