/**
 * The mailbox's slot: everything the page sends comes through here.
 *   1. checks it's well-formed and that it can apply to the run as it is now;
 *   2. stores images and appends the event to the log on disk, before anything else;
 *   3. applies it to the run, saves, shows it on the page, and rings the bell.
 * An event that can't apply (a stale revision, an open question) is refused
 * with the reason and never logged, so the user sees why at once.
 */
import { PageEvent, type RecordedEvent, type UnsequencedEvent } from '@shared/contract.ts';
import { WorkbenchError } from '@server/kernel/errors.ts';
import { applyEvent } from '@server/kernel/events.ts';
import type { Clock, EventLog, EventSignal, ImageStore, Limits, PagePublisher, RunLock, RunStore } from '@server/kernel/ports.ts';
import { loadRun } from '@server/kernel/unit-of-work.ts';

export interface RecordDeps {
  store: RunStore;
  lock: RunLock;
  log: EventLog;
  images: ImageStore;
  signal: EventSignal;
  page: PagePublisher;
  clock: Clock;
  limits: Limits;
}

/** Decoded size of a data: URL, without decoding it. */
const dataUrlBytes = (url: string) => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);

const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** The event as the log keeps it: a message's images by stored file name. */
const toRecorded = (event: PageEvent, images: string[], at: string): UnsequencedEvent =>
  event.type === 'message' ? { ...event, images, at } : { ...event, at };

/**
 * Stores the message's images, checking the run's limit first; returns their
 * file names and whether the run is now close to the limit.
 */
async function storeImages(deps: RecordDeps, runId: string, urls: string[]): Promise<{ names: string[]; nearLimit: boolean }> {
  if (!urls.length) return { names: [], nearLimit: false };
  if (urls.some((u) => !/^data:image\/(webp|png|jpeg|gif);base64,/.test(u))) {
    throw new WorkbenchError('invalid', 'images must be WebP, PNG, JPEG or GIF data URLs');
  }
  const total = (await deps.images.usedBytes(runId)) + urls.reduce((n, u) => n + dataUrlBytes(u), 0);
  if (total > deps.limits.imageBytesPerRun) {
    throw new WorkbenchError('limit', `these images would take this run to ${formatBytes(total)}; the limit is ${formatBytes(deps.limits.imageBytesPerRun)}`);
  }
  const names: string[] = [];
  for (const url of urls) names.push(await deps.images.save(runId, url));
  return { names, nearLimit: total > deps.limits.imageWarnBytes };
}

export async function recordPageEvent(deps: RecordDeps, runId: string, raw: unknown): Promise<{ seq: number; imageWarning?: string }> {
  const parsed = PageEvent.safeParse(raw);
  if (!parsed.success) throw new WorkbenchError('invalid', 'event is not valid', parsed.error.issues);
  const event = parsed.data;

  // The whole check-log-apply happens under the run's lock, so nothing changes the run in between.
  return deps.lock.exclusive(runId, async () => {
    const run = await loadRun(deps.store, runId);
    const at = deps.clock.now();

    // Dry run against the current state: refuse before logging or storing anything.
    applyEvent(run, { ...toRecorded(event, [], at), seq: run.appliedSeq + 1 } as RecordedEvent);

    const { names, nearLimit } = await storeImages(deps, runId, event.type === 'message' ? event.images : []);
    const recorded = toRecorded(event, names, at);
    const seq = await deps.log.append(runId, recorded);
    const next = applyEvent(run, { ...recorded, seq } as RecordedEvent);
    await deps.store.save(next);
    deps.page.publish(next);
    deps.signal.ring(runId);
    return { seq, ...(nearLimit ? { imageWarning: 'This run is close to its image limit.' } : {}) };
  });
}
