/**
 * Hands Claude each page event exactly once: what rides along on every tool
 * result, whatever is undelivered, possibly nothing. The delivery cursor lives
 * on disk, so after a crash Claude gets exactly the events it hadn't seen.
 */
import type { RecordedEvent, RunState } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';

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

export interface TakeEventsInput {
  runId: string;
}

export class TakeEventsUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly lock: RunLock,
    private readonly log: EventLog,
    private readonly images: ImageStore,
  ) {}

  /** Reading and marking delivered happen under the run's lock, so two callers never both get an event. */
  execute({ runId }: TakeEventsInput): Promise<DeliveredEvent[]> {
    return this.lock.exclusive(runId, async () => {
      const events = await this.log.undelivered(runId);
      if (!events.length) {
        return [];
      }
      const run = await this.runs.load(runId);
      // Resolved before marking delivered, so a failure here hands the events over next time.
      const names = events.flatMap((ev) => (ev.type === 'message' ? (ev.images ?? []) : []));
      const paths = new Map(
        await Promise.all(names.map(async (name) => [name, await this.images.path(runId, name)] as const)),
      );
      await this.log.markDelivered(runId, events.at(-1)!.seq);
      return events.map((ev) => describe(ev, run, (name) => paths.get(name)!));
    });
  }
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
