import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import { CloseSessionUseCase } from '@server/runs/application/use-cases/close-session.use-case.ts';
import { ListRunsUseCase } from '@server/runs/application/use-cases/list-runs.use-case.ts';
import { OpenSessionUseCase } from '@server/runs/application/use-cases/open-session.use-case.ts';
import { SetStatusUseCase } from '@server/runs/application/use-cases/set-status.use-case.ts';
import type { LiveIndex } from '@server/runs/domain/ports/live-index.port.ts';

export interface RunsModule {
  openSession: OpenSessionUseCase;
  listRuns: ListRunsUseCase;
  setStatus: SetStatusUseCase;
  closeSession: CloseSessionUseCase;
}

/** A run's life: opening or resuming it, its status line, listing a project's runs, and closing it. */
export function runsModule(adapters: {
  runs: RunChanges;
  store: RunStore;
  log: EventLog;
  page: PagePublisher;
  live: LiveIndex;
  clock: Clock;
  ids: Ids;
}): RunsModule {
  return {
    openSession: new OpenSessionUseCase(adapters.store, adapters.log, adapters.page, adapters.clock, adapters.ids),
    listRuns: new ListRunsUseCase(adapters.store, adapters.live),
    setStatus: new SetStatusUseCase(adapters.runs),
    closeSession: new CloseSessionUseCase(adapters.runs, adapters.clock),
  };
}
