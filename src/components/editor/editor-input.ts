export function isImeComposing(event: {isComposing?: boolean; keyCode?: number}): boolean {
  // WebKit can clear isComposing on the Enter that confirms an IME candidate.
  return event.isComposing === true || event.keyCode === 229;
}

export function committedLevel(value: string, previous: number): number {
  const number = value.trim() === '' ? previous : Number(value);
  return Number.isFinite(number) ? Math.round(Math.min(100, Math.max(1, number))) : previous;
}

export function validLevelInput(value: string): boolean {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 100;
}
