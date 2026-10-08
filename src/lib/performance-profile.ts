/** Opt-in measurement only. No text/image payloads are retained by these counters. */
export const PERFORMANCE_PROFILING_ENABLED = process.env.NEXT_PUBLIC_PERFORMANCE_PROFILING === '1';

type Detail = Record<string, string | number | boolean | null>;
export interface ProfileTiming {name: string; durationMs: number; detail?: Detail}
const counters: Record<string, number> = {};
const timings: ProfileTiming[] = [];
const commits: Array<{id:string; phase:string; actualDuration:number; baseDuration:number; startTime:number; commitTime:number}> = [];

function active() { return PERFORMANCE_PROFILING_ENABLED && typeof window !== 'undefined'; }
export function profileCount(name: string, amount = 1): void {
  if (active()) counters[name] = (counters[name] ?? 0) + amount;
}
export function profileTiming(name: string, durationMs: number, detail?: Detail): void {
  if (!active()) return;
  if (timings.length >= 4096) { timings.shift(); counters['buffer.timings.dropped'] = (counters['buffer.timings.dropped'] ?? 0) + 1; }
  timings.push({name,durationMs,detail});
}
export function profileStart(name: string, detail?: Detail): () => void {
  if (!active()) return () => undefined;
  const start = performance.now();
  return () => profileTiming(name, performance.now() - start, detail);
}
export function profileRender(name: string): void { profileCount(`render.${name}`); }
export function profileCommit(id: string, phase: string, actualDuration: number, baseDuration: number, startTime: number, commitTime: number): void {
  if (!active()) return;
  if (commits.length >= 2048) { commits.shift(); counters['buffer.commits.dropped'] = (counters['buffer.commits.dropped'] ?? 0) + 1; }
  commits.push({id,phase,actualDuration,baseDuration,startTime,commitTime});
}
export function profileReset(): void {
  for (const key of Object.keys(counters)) delete counters[key];
  timings.length = 0; commits.length = 0;
}
export function profileRead() {
  return {enabled:active(),counters:{...counters},timings:timings.map(item=>({...item})),commits:commits.map(item=>({...item}))};
}
