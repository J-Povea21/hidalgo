import { RunChanges } from '@server/common/application/run-changes.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import { conversationModule, type ConversationModule } from '@server/conversation/conversation.module.ts';
import { itemsModule, type ItemsModule } from '@server/items/items.module.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';
import { pageEventsModule, type PageEventsModule } from '@server/page-events/page-events.module.ts';
import type { LiveIndex } from '@server/runs/domain/ports/live-index.port.ts';
import { runsModule, type RunsModule } from '@server/runs/runs.module.ts';

export interface Adapters {
  store: RunStore;
  log: EventLog;
  images: ImageStore;
  live: LiveIndex;
  lock: RunLock;
  page: PagePublisher;
  signal: EventSignal;
  clock: Clock;
  ids: Ids;
  limits: Limits;
}

export interface Modules {
  runs: RunsModule;
  items: ItemsModule;
  conversation: ConversationModule;
  pageEvents: PageEventsModule;
}

/** Every module, built from one set of adapters. The server and the use-case tests both build them with this. */
export function buildModules(adapters: Adapters): Modules {
  const withRuns = { ...adapters, runs: new RunChanges(adapters.store, adapters.page, adapters.lock) };
  return {
    runs: runsModule(withRuns),
    items: itemsModule(withRuns),
    conversation: conversationModule(withRuns),
    pageEvents: pageEventsModule(withRuns),
  };
}
