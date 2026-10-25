import type { RecordedEvent, RunState } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';

export interface TakeEventsInput {
  runId: string;
}

/** The events handed over, with the run as it was and where their images are on disk. */
export interface TakenEvents {
  events: RecordedEvent[];
  /** The run when they were taken, to look up the questions and threads they name. */
  run?: RunState;
  /** Each stored image's absolute path, by file name. */
  imagePaths: Map<string, string>;
}

/**
 * Hands Claude each page event exactly once: what rides along on every tool
 * result, whatever is undelivered, possibly nothing. The delivery cursor lives
 * on disk, so after a crash Claude gets exactly the events it hadn't seen.
 */
export class TakeEventsUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly lock: RunLock,
    private readonly log: EventLog,
    private readonly images: ImageStore,
  ) {}

  /** Reading and marking delivered happen under the run's lock, so two callers never both get an event. */
  execute({ runId }: TakeEventsInput): Promise<TakenEvents> {
    return this.lock.exclusive(runId, async () => {
      const events = await this.log.undelivered(runId);
      if (!events.length) {
        return { events, imagePaths: new Map() };
      }
      const run = await this.runs.load(runId);
      // Resolved before marking delivered, so a failure here hands the events over next time.
      const names = events.flatMap((event) => (event.type === 'message' ? (event.images ?? []) : []));
      const imagePaths = new Map(
        await Promise.all(names.map(async (name) => [name, await this.images.path(runId, name)] as const)),
      );
      await this.log.markDelivered(runId, events.at(-1)!.seq);
      return { events, run, imagePaths };
    });
  }
}
