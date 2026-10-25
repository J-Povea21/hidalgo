/**
 * The mailbox's other side: hands Claude each page event exactly once.
 *
 * `takeEvents` is what rides along on every tool result: whatever is
 * undelivered, possibly nothing. `waitForEvents` does the same but, when the
 * mailbox is empty, marks it the user's turn and sleeps until the bell rings.
 * The delivery cursor lives on disk, so after a crash Claude gets exactly the
 * events it hadn't seen.
 */
import type { RecordedEvent, RunState } from '@shared/contract.ts';
import type { EventLog, EventSignal, ImageStore, Limits } from '@server/kernel/ports.ts';
import { setTurn } from '@server/kernel/run.ts';
import { changeRun, loadRun, type RunDeps } from '@server/kernel/unit-of-work.ts';

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

export interface WaitDeps extends RunDeps {
  log: EventLog;
  signal: EventSignal;
  images: ImageStore;
  limits: Limits;
}

/** Hands over everything undelivered, exactly once: reading and marking delivered happen under the run's lock. */
export function takeEvents(deps: WaitDeps, runId: string): Promise<DeliveredEvent[]> {
  return deps.lock.exclusive(runId, async () => {
    const events = await deps.log.undelivered(runId);
    if (!events.length) return [];
    const run = await loadRun(deps.store, runId);
    // Resolved before marking delivered, so a failure here hands the events over next time.
    const names = events.flatMap((ev) => (ev.type === 'message' ? (ev.images ?? []) : []));
    const paths = new Map(
      await Promise.all(names.map(async (name) => [name, await deps.images.path(runId, name)] as const)),
    );
    await deps.log.markDelivered(runId, events.at(-1)!.seq);
    return events.map((ev) => describe(ev, run, (name) => paths.get(name)!));
  });
}

function describe(ev: RecordedEvent, run: RunState, imagePath: (name: string) => string): DeliveredEvent {
  const base = { seq: ev.seq, type: ev.type, at: ev.at };
  switch (ev.type) {
    case 'answers': {
      const item = run.items.find((candidate) => candidate.id === ev.itemId);
      return {
        ...base,
        item: ev.itemId,
        answers: Object.entries(ev.answers).map(([qid, answer]) => {
          const question = item?.questions.find((candidate) => candidate.id === qid);
          return {
            question: question?.text ?? qid,
            chose: question?.options[answer.choice]?.label ?? String(answer.choice),
            ...(answer.note ? { note: answer.note } : {}),
          };
        }),
      };
    }
    case 'verdict':
      return { ...base, item: ev.itemId, verdict: ev.value, rev: ev.rev };
    case 'edit':
      return { ...base, item: ev.itemId, path: ev.path, text: ev.text };
    case 'message': {
      const owner = run.threads.find((thread) => thread.id === ev.threadId)?.owner;
      return {
        ...base,
        thread: ev.threadId,
        ...(owner?.type === 'item' ? { item: owner.itemId } : {}),
        text: ev.text,
        // The same image pasted twice is one file; hand Claude each once, so it isn't read twice.
        // The stored message and the page keep the attachments exactly as sent.
        ...(ev.images.length ? { images: [...new Set(ev.images)].map(imagePath) } : {}),
      };
    }
    case 'diagram-failed':
      return { ...base, error: `diagram ${ev.diagramId} failed to draw: ${ev.error}` };
  }
}

const setTurnTo = (deps: WaitDeps, runId: string, turn: RunState['turn']) =>
  changeRun(deps, runId, (run) => ({ run: setTurn(run, turn), result: undefined }));

export async function waitForEvents(
  deps: WaitDeps,
  runId: string,
): Promise<{ events: DeliveredEvent[]; timedOut: boolean }> {
  const ready = await takeEvents(deps, runId);
  if (ready.length) return { events: ready, timedOut: false };

  // Register the wait BEFORE handing over the turn, then look once more: an event recorded
  // in between rang a bell nobody was listening to, so ring it again ourselves.
  const woken = deps.signal.wait(runId, deps.limits.waitTimeoutMs);
  let outcome: 'event' | 'timeout';
  try {
    await setTurnTo(deps, runId, 'user');
    if ((await deps.log.undelivered(runId)).length) deps.signal.ring(runId);
    outcome = await woken;
  } finally {
    await setTurnTo(deps, runId, 'claude');
  }
  const events = await takeEvents(deps, runId);
  return { events, timedOut: outcome === 'timeout' && events.length === 0 };
}
