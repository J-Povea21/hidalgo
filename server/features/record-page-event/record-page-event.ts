/**
 * The mailbox's slot: everything the page sends comes through here.
 *   1. checks it's well-formed and that it can apply to the run as it is now;
 *   2. stores images and appends the event to the log on disk, before anything else;
 *   3. applies it to the run, saves, shows it on the page, and rings the bell.
 * An event that can't apply (a stale revision, an open question) is refused
 * with the reason and never logged, so the user sees why at once.
 */
import { PageEvent, type RecordedEvent, type UnsequencedEvent } from '../../../shared/contract.ts';
import { WorkbenchError } from '../../kernel/errors.ts';
import { applyEvent } from '../../kernel/events.ts';
import type { Clock, EventLog, EventSignal, ImageStore, Limits, PagePublisher, RunStore } from '../../kernel/ports.ts';
import { loadRun } from '../../kernel/unit-of-work.ts';

export interface RecordDeps {
  store: RunStore;
  log: EventLog;
  images: ImageStore;
  signal: EventSignal;
  page: PagePublisher;
  clock: Clock;
  limits: Limits;
}

/** Decoded size of a data: URL, without decoding it. */
const dataUrlBytes = (url: string) => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);

export async function recordPageEvent(deps: RecordDeps, runId: string, raw: unknown): Promise<{ seq: number; imageWarning?: string }> {
  const parsed = PageEvent.safeParse(raw);
  if (!parsed.success) throw new WorkbenchError('invalid', 'event is not valid', parsed.error.issues);
  const event = parsed.data;
  const run = await loadRun(deps.store, runId);
  const at = deps.clock.now();

  // Dry run against the current state: refuse before logging anything.
  const draft = { ...event, ...(event.type === 'message' ? { images: [] } : {}), at, seq: run.appliedSeq + 1 } as RecordedEvent;
  applyEvent(run, draft);

  let images: string[] = [];
  let imageWarning: string | undefined;
  if (event.type === 'message' && event.images.length) {
    for (const url of event.images) {
      if (!/^data:image\/(webp|png|jpeg|gif);base64,/.test(url)) throw new WorkbenchError('invalid', 'images must be WebP, PNG, JPEG or GIF data URLs');
    }
    const used = await deps.images.usedBytes(runId);
    const incoming = event.images.reduce((n, u) => n + dataUrlBytes(u), 0);
    if (used + incoming > deps.limits.imageBytesPerRun) {
      const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
      throw new WorkbenchError('limit', `these images would take this run to ${size(used + incoming)}; the limit is ${size(deps.limits.imageBytesPerRun)}`);
    }
    images = [];
    for (const url of event.images) images.push(await deps.images.save(runId, url));
    if (used + incoming > deps.limits.imageWarnBytes) imageWarning = 'This run is close to its image limit.';
  }

  const recorded = { ...event, ...(event.type === 'message' ? { images } : {}), at } as UnsequencedEvent;
  const seq = await deps.log.append(runId, recorded);
  const next = applyEvent(run, { ...recorded, seq } as RecordedEvent);
  await deps.store.save(next);
  deps.page.publish(next);
  deps.signal.ring(runId);
  return { seq, ...(imageWarning ? { imageWarning } : {}) };
}
