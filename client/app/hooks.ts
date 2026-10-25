/** Small state the shell keeps: the clock, which item is on screen, and what's unread. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadTabValue, saveTabValue } from '../infra/drafts.ts';

/** The time, refreshed every `ms`: enough for "Claude went quiet" to show without a state push. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Which item is on screen, kept per tab so a reload lands on the same one. */
export function useItemPosition(runId: string): [number, (i: number) => void] {
  const [cur, setCur] = useState(() => loadTabValue(runId, 'cur', 0));
  useEffect(() => saveTabValue(runId, 'cur', cur), [cur]);
  return [cur, setCur];
}

/** True while `count` has grown since the last time `open` was true. */
export function useUnread(count: number, open: boolean): boolean {
  const seen = useRef(0);
  useEffect(() => { if (open) seen.current = count; }, [open, count]);
  return !open && count > seen.current;
}
