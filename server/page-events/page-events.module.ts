/** The mailbox between the page and Claude: what the page sends goes in, and Claude takes it out exactly once. */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import { RecordPageEventUseCase } from '@server/page-events/application/use-cases/record-page-event.use-case.ts';
import { TakeEventsUseCase } from '@server/page-events/application/use-cases/take-events.use-case.ts';
import { WaitForEventsUseCase } from '@server/page-events/application/use-cases/wait-for-events.use-case.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';

export interface PageEventsModule {
  recordPageEvent: RecordPageEventUseCase;
  takeEvents: TakeEventsUseCase;
  waitForEvents: WaitForEventsUseCase;
}

export function pageEventsModule(adapters: {
  runs: RunChanges;
  store: RunStore;
  lock: RunLock;
  page: PagePublisher;
  log: EventLog;
  images: ImageStore;
  signal: EventSignal;
  clock: Clock;
  limits: Limits;
}): PageEventsModule {
  const { runs, store, lock, page, log, images, signal, clock, limits } = adapters;
  const takeEvents = new TakeEventsUseCase(runs, lock, log, images);
  return {
    recordPageEvent: new RecordPageEventUseCase(runs, store, lock, page, log, images, signal, clock, limits),
    takeEvents,
    waitForEvents: new WaitForEventsUseCase(takeEvents, runs, log, signal, limits),
  };
}
