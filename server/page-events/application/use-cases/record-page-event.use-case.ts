import { PageEvent, type UnsequencedEvent } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { HidalgoError } from '@server/common/domain/errors.ts';
import { applyEvent, sequenced } from '@server/common/domain/page-event.rules.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';

export interface RecordedPageEvent {
  /** The event's place in the run's log. */
  seq: number;
  /** The run's images now take most of what it may store. */
  nearImageLimit: boolean;
}

export interface RecordPageEventInput {
  runId: string;
  /** The body the page sent, not yet checked. */
  event: unknown;
}

/**
 * The mailbox's slot: everything the page sends comes through here.
 *   1. checks it's well-formed and that it can apply to the run as it is now;
 *   2. stores images and appends the event to the log on disk, before anything else;
 *   3. applies it to the run, saves, shows it on the page, and rings the bell.
 * An event that can't apply (a stale revision, an open question) is refused
 * with the reason and never logged, so the user sees why at once.
 */
export class RecordPageEventUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly store: RunStore,
    private readonly lock: RunLock,
    private readonly page: PagePublisher,
    private readonly log: EventLog,
    private readonly images: ImageStore,
    private readonly signal: EventSignal,
    private readonly clock: Clock,
    private readonly limits: Limits,
  ) {}

  async execute(input: RecordPageEventInput): Promise<RecordedPageEvent> {
    const parsed = PageEvent.safeParse(input.event);
    if (!parsed.success) {
      throw new HidalgoError('invalid', 'event is not valid', parsed.error.issues);
    }
    const event = parsed.data;
    const { runId } = input;

    // The whole check-log-apply happens under the run's lock, so nothing changes the run in between.
    return this.lock.exclusive(runId, async () => {
      const run = await this.runs.load(runId);
      const at = this.clock.now();

      // Dry run against the current state: refuse before logging or storing anything.
      applyEvent(run, sequenced(toRecorded(event, [], at), run.appliedSeq + 1));

      const { names, nearLimit } = await this.storeImages(runId, event.type === 'message' ? event.images : []);
      const recorded = toRecorded(event, names, at);
      const seq = await this.log.append(runId, recorded);
      const next = applyEvent(run, sequenced(recorded, seq));
      await this.store.save(next);
      this.page.publish(next);
      this.signal.ring(runId);
      return { seq, nearImageLimit: nearLimit };
    });
  }

  /**
   * Stores the message's images, checking the run's limit first; returns their
   * file names and whether the run is now close to the limit.
   */
  private async storeImages(runId: string, urls: string[]): Promise<{ names: string[]; nearLimit: boolean }> {
    if (!urls.length) {
      return { names: [], nearLimit: false };
    }
    if (urls.some((url) => !/^data:image\/(webp|png|jpeg|gif);base64,/.test(url))) {
      throw new HidalgoError('invalid', 'images must be WebP, PNG, JPEG or GIF data URLs');
    }
    const total = (await this.images.usedBytes(runId)) + urls.reduce((sum, url) => sum + dataUrlBytes(url), 0);
    if (total > this.limits.imageBytesPerRun) {
      throw new HidalgoError(
        'limit',
        `these images would take this run to ${formatBytes(total)}; the limit is ${formatBytes(this.limits.imageBytesPerRun)}`,
      );
    }
    const names: string[] = [];
    for (const url of urls) {
      names.push(await this.images.save(runId, url));
    }
    return { names, nearLimit: total > this.limits.imageWarnBytes };
  }
}

/** The event as the log keeps it: a message's images by stored file name. */
function toRecorded(event: PageEvent, images: string[], at: string): UnsequencedEvent {
  return event.type === 'message' ? { ...event, images, at } : { ...event, at };
}

/** Decoded size of a data: URL, without decoding it. */
function dataUrlBytes(url: string): number {
  return Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
