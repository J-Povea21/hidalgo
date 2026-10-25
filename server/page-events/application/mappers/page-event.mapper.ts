import type { RecordedEvent, RunState } from '@shared/contract.ts';
import type { RecordedPageEvent } from '@server/page-events/application/use-cases/record-page-event.use-case.ts';
import type { TakenEvents } from '@server/page-events/application/use-cases/take-events.use-case.ts';
import type { WaitedEvents } from '@server/page-events/application/use-cases/wait-for-events.use-case.ts';

const NEAR_IMAGE_LIMIT = 'This run is close to its image limit.';

/** A page event as Claude reads it: compact, flat, only what's needed to act. */
export interface DeliveredEventResponse {
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

export interface WaitForEventsResponse {
  events: DeliveredEventResponse[];
  timedOut: boolean;
}

/** What the page receives once its event is recorded. */
export interface RecordPageEventResponse {
  seq: number;
  imageWarning?: string;
}

/**
 * What Claude and the page receive about page events, built from what the use cases
 * return. A change in either side is absorbed here.
 */
export class PageEventMapper {
  static toDelivered(taken: TakenEvents): DeliveredEventResponse[] {
    const { run } = taken;
    if (!run) {
      return [];
    }
    return taken.events.map((event) => PageEventMapper.describe(event, run, taken.imagePaths));
  }

  static toWaited(waited: WaitedEvents): WaitForEventsResponse {
    return { events: PageEventMapper.toDelivered(waited.taken), timedOut: waited.timedOut };
  }

  static toRecorded(recorded: RecordedPageEvent): RecordPageEventResponse {
    return { seq: recorded.seq, ...(recorded.nearImageLimit ? { imageWarning: NEAR_IMAGE_LIMIT } : {}) };
  }

  private static describe(
    event: RecordedEvent,
    run: RunState,
    imagePaths: Map<string, string>,
  ): DeliveredEventResponse {
    const base = { seq: event.seq, type: event.type, at: event.at };
    switch (event.type) {
      case 'answers': {
        const item = run.items.find((candidate) => candidate.id === event.itemId);
        return {
          ...base,
          item: event.itemId,
          answers: Object.entries(event.answers).map(([qid, answer]) => {
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
        return { ...base, item: event.itemId, verdict: event.value, rev: event.rev };
      case 'edit':
        return { ...base, item: event.itemId, path: event.path, text: event.text };
      case 'message': {
        const owner = run.threads.find((thread) => thread.id === event.threadId)?.owner;
        // The same image pasted twice is one file; hand Claude each once, so it isn't read twice.
        // The stored message and the page keep the attachments exactly as sent.
        const images = [...new Set(event.images)].map((name) => imagePaths.get(name)!);
        return {
          ...base,
          thread: event.threadId,
          ...(owner?.type === 'item' ? { item: owner.itemId } : {}),
          text: event.text,
          ...(images.length ? { images } : {}),
        };
      }
      case 'diagram-failed':
        return { ...base, error: `diagram ${event.diagramId} failed to draw: ${event.error}` };
    }
  }
}
