/** What the page shell keeps between renders: sending, which item is on screen, what's unread, the clock. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PageEvent } from '@shared/contract.ts';
import type { SendPageEventUseCase } from '@client/common/application/use-cases/send-page-event.use-case.ts';
import { BrowserDraftStore } from '@client/common/infrastructure/drafts.ts';
import { slideToward } from '@client/common/interface/ui/classes.ts';
import { toast } from '@client/common/interface/ui/parts.tsx';

/**
 * Sends a page event and tells the user how it went. `fromThread` is the conversation it was
 * sent from, so that thread can show Claude working on it. Resolves false when it didn't go.
 */
export function useSend(sendPageEvent: SendPageEventUseCase, onSent: (fromThread: string | undefined) => void) {
  return useCallback(async (event: PageEvent, fromThread: string | undefined, sentNotice: string) => {
    const { sent, notice } = await sendPageEvent.execute({ event, sentNotice });
    if (sent) {
      onSent(fromThread);
    }
    toast(notice);
    return sent;
  }, []);
}

const FIRST_ITEM = 0;
const ITEM_INDEX_KEY = 'item-index';

/**
 * Which item is on screen (its position in the run's items), kept per tab so a reload lands
 * on the same one, and the direction the slide animation takes when it changes.
 */
export function useItemNavigation(runId: string, itemCount: number) {
  const tabValues = useMemo(() => new BrowserDraftStore(runId, 'tab'), [runId]);
  const [savedIndex, setSavedIndex] = useState(() => tabValues.load(ITEM_INDEX_KEY, FIRST_ITEM));
  const [slide, setSlide] = useState('');
  useEffect(() => tabValues.save(ITEM_INDEX_KEY, savedIndex), [savedIndex]);

  // There can be fewer items than when the position was saved: then it stays on the last one.
  const lastItem = Math.max(FIRST_ITEM, itemCount - 1);
  const itemIndex = Math.min(savedIndex, lastItem);
  const goTo = (target: number) => {
    const isAnotherItem = target >= FIRST_ITEM && target <= lastItem && target !== itemIndex;
    if (!isAnotherItem) {
      return;
    }
    setSlide(slideToward(target, itemIndex));
    setSavedIndex(target);
    scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { itemIndex, goTo, slide, slideDone: () => setSlide('') };
}

const NONE_SEEN = 0;

/** True while `count` has grown since the last time `open` was true. */
export function useUnread(count: number, open: boolean): boolean {
  const seen = useRef(NONE_SEEN);
  useEffect(() => {
    if (open) {
      seen.current = count;
    }
  }, [open, count]);
  return !open && count > seen.current;
}

/** The time, refreshed every `intervalMs`, so time-based states show without waiting for the server. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
