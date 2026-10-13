const COMPLETE_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export interface DisplayedEditorRange {
  min: number;
  max: number;
  step: number;
  value: number;
}

export function getDisplayedEditorRange(
  value: number,
  min: number,
  max: number,
  step: number,
  displayMultiplier = 1,
): DisplayedEditorRange {
  const multiplier = Number.isFinite(displayMultiplier) && displayMultiplier !== 0 ? displayMultiplier : 1;
  const firstEndpoint = min * multiplier;
  const secondEndpoint = max * multiplier;
  return {
    min: Math.min(firstEndpoint, secondEndpoint),
    max: Math.max(firstEndpoint, secondEndpoint),
    step: step * Math.abs(multiplier),
    value: value * multiplier,
  };
}

export function parseDisplayedEditorRangeValue(value: number, displayMultiplier = 1): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(displayMultiplier) || displayMultiplier === 0) return null;
  return value / displayMultiplier;
}

export function getEditorNumberPrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const decimal = String(step).toLowerCase();
  const [coefficient, exponentText] = decimal.split('e');
  const coefficientPlaces = coefficient.includes('.') ? coefficient.length - coefficient.indexOf('.') - 1 : 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return Math.min(12, Math.max(0, coefficientPlaces - exponent));
}

export function normalizeEditorNumber(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return min;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const bounded = Math.min(upper, Math.max(lower, value));
  if (!Number.isFinite(step) || step <= 0 || lower === upper) return bounded;

  const stepped = lower + Math.round((bounded - lower) / step) * step;
  const precision = getEditorNumberPrecision(step);
  return Math.min(upper, Math.max(lower, Number(stepped.toFixed(precision))));
}

export function parseEditorNumberDraft(value: string, displayMultiplier = 1): number | null {
  const draft = value.trim();
  if (!COMPLETE_DECIMAL.test(draft)) return null;
  const parsed = Number(draft);
  if (!Number.isFinite(parsed) || !Number.isFinite(displayMultiplier) || displayMultiplier === 0) return null;
  return parsed / displayMultiplier;
}

export function formatEditorNumber(value: number, step: number, displayMultiplier = 1): string {
  const scaled = value * displayMultiplier;
  const precision = getEditorNumberPrecision(step * Math.abs(displayMultiplier));
  return Number.isFinite(scaled) ? Number(scaled.toFixed(precision)).toFixed(precision) : '';
}
