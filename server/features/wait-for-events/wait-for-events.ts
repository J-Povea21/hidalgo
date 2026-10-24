/**
 * The mailbox's other side: hands Claude each page event exactly once.
 *
 * `takeEvents` is what rides along on every tool result: whatever is
 * undelivered, possibly nothing. `waitForEvents` does the same but, when the
 * mailbox is empty, marks it the user's turn and sleeps until the bell rings.
 * The delivery cursor lives on disk, so after a crash Claude gets exactly the
 * events it hadn't seen.
 */
import type { RecordedEvent } from '../../../shared/contract.ts';
import type { EventLog, EventSignal, ImageStore, Limits } from '../../kernel/ports.ts';
import { loadRun, changeRun, type RunDeps } from '../../kernel/unit-of-work.ts';
import { setTurn } from '../../kernel/run.ts';

/** What Claude reads: compact, flat, only what's needed to act. */
export interface DeliveredEvent {
  seq: number;
  type: RecordedEvent['type'];
  at: string;
  item?: string;
  /** For answers: the question text and chosen option, so Claude needn't look them up. */
  answers?: { question: string; chose: string; note?: string }[];
  verdict?: string;
  rev?: number;
  thread?: string;
  text?: string;
  /** Absolute paths; open one only when it matters. */
  images?: string[];
  path?: string;
  error?: string;
}

export interface WaitDeps extends RunDeps { log: EventLog; signal: EventSignal; images: ImageStore; limits: Limits }

export async function takeEvents(deps: WaitDeps, runId: string): Promise<DeliveredEvent[]> {
  const events = await deps.log.undelivered(runId);
  if (!events.length) return [];
  const run = await loadRun(deps.store, runId);
  await deps.log.markDelivered(runId, events.at(-1)!.seq);
  return events.map((ev): DeliveredEvent => {
    const base = { seq: ev.seq, type: ev.type, at: ev.at };
    switch (ev.type) {
      case 'answers': {
        const item = run.items.find((i) => i.id === ev.itemId);
        return {
          ...base,
          item: ev.itemId,
          answers: Object.entries(ev.answers).map(([qid, a]) => {
            const q = item?.questions.find((q) => q.id === qid);
            return { question: q?.text ?? qid, chose: q?.options[a.choice]?.label ?? String(a.choice), ...(a.note ? { note: a.note } : {}) };
          }),
        };
      }
      case 'verdict':
        return { ...base, item: ev.itemId, verdict: ev.value, rev: ev.rev };
      case 'edit':
        return { ...base, item: ev.itemId, path: ev.path, text: ev.text };
      case 'message': {
        const owner = run.threads.find((t) => t.id === ev.threadId)?.owner;
        return {
          ...base,
          thread: ev.threadId,
          ...(owner?.type === 'item' ? { item: owner.itemId } : {}),
          text: ev.text,
          // The same image pasted twice is one file; hand Claude each once, so it isn't read twice.
          // The stored message and the page keep the attachments exactly as sent.
          ...(ev.images.length ? { images: [...new Set(ev.images)].map((n) => deps.images.path(runId, n)) } : {}),
        };
      }
      case 'diagram-failed':
        return { ...base, error: `diagram ${ev.diagramId} failed to draw: ${ev.error}` };
    }
  });
}

export async function waitForEvents(deps: WaitDeps, runId: string): Promise<{ events: DeliveredEvent[]; timedOut: boolean }> {
  const ready = await takeEvents(deps, runId);
  if (ready.length) return { events: ready, timedOut: false };

  await changeRun(deps, runId, (run) => ({ run: setTurn(run, 'user'), result: {} }));
  let outcome: 'event' | 'timeout';
  try {
    outcome = await deps.signal.wait(runId, deps.limits.waitTimeoutMs);
  } finally {
    await changeRun(deps, runId, (run) => ({ run: setTurn(run, 'claude'), result: {} }));
  }
  const events = await takeEvents(deps, runId);
  return { events, timedOut: outcome === 'timeout' && events.length === 0 };
}
