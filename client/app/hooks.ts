/** State the shell keeps between renders: the clock, which item is on screen, what's unread, and sending. */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PageEvent } from '@shared/contract.ts';
import { ApiError, type Api } from '@client/infra/api.ts';
import { loadTabValue, saveTabValue } from '@client/infra/drafts.ts';
import { slideToward } from '@client/ui/classes.ts';
import { toast } from '@client/ui/parts.tsx';

/** The time, refreshed every `intervalMs`: enough for "Claude went quiet" to show without a state push. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const FIRST_ITEM = 0;
const ITEM_INDEX_KEY = 'item-index';

/**
 * Which item is on screen (its position in the run's items), kept per tab so a reload lands
 * on the same one, and the direction the slide animation takes when it changes.
 */
export function useItemNavigation(runId: string, itemCount: number) {
  const [savedIndex, setSavedIndex] = useState(() => loadTabValue(runId, ITEM_INDEX_KEY, FIRST_ITEM));
  const [slide, setSlide] = useState('');
  useEffect(() => saveTabValue(runId, ITEM_INDEX_KEY, savedIndex), [savedIndex]);

  // Items can be fewer than when the position was saved: stay on the last one.
  const lastItem = Math.max(FIRST_ITEM, itemCount - 1);
  const itemIndex = Math.min(savedIndex, lastItem);
  const goTo = (target: number) => {
    if (target < FIRST_ITEM || target > lastItem || target === itemIndex) return;
    setSlide(slideToward(target, itemIndex));
    setSavedIndex(target);
    scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { itemIndex, goTo, slide, slideDone: () => setSlide('') };
}

/** No message from Claude has been seen yet. */
const NONE_SEEN = 0;

/** True while `count` has grown since the last time `open` was true. */
export function useUnread(count: number, open: boolean): boolean {
  const seen = useRef(NONE_SEEN);
  useEffect(() => {
    if (open) seen.current = count;
  }, [open, count]);
  return !open && count > seen.current;
}

const UNREACHABLE = "Not sent: Claude's session is unreachable. Your text is kept.";

/**
 * Sends a page event and tells the user how it went. `fromThread` is the conversation it was
 * sent from, so that thread can show Claude working on it. Resolves false when it didn't go.
 */
export function useSend(api: Api, onSent: (fromThread: string | undefined) => void) {
  return useCallback(async (event: PageEvent, fromThread: string | undefined, sentMessage: string) => {
    try {
      const result = await api.sendEvent(event);
      onSent(fromThread);
      toast(result.imageWarning ?? sentMessage);
      return true;
    } catch (error) {
      toast(error instanceof ApiError ? error.message : UNREACHABLE);
      return false;
    }
  }, []);
}
