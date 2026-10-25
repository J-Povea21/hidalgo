/**
 * The mailbox's other side, when Claude has nothing left to do: takes whatever
 * is undelivered and, when the mailbox is empty, marks it the user's turn and
 * sleeps until the bell rings.
 */
import type { RunState } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { setTurn } from '@server/common/domain/run.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';
import type { DeliveredEvent, TakeEventsUseCase } from './take-events.use-case.ts';
import { PARTY } from '@shared/values.ts';

export interface WaitForEventsInput {
  runId: string;
}

export class WaitForEventsUseCase {
  constructor(
    private readonly takeEvents: TakeEventsUseCase,
    private readonly runs: RunChanges,
    private readonly log: EventLog,
    private readonly signal: EventSignal,
    private readonly limits: Limits,
  ) {}

  async execute({ runId }: WaitForEventsInput): Promise<{ events: DeliveredEvent[]; timedOut: boolean }> {
    const ready = await this.takeEvents.execute({ runId });
    if (ready.length) {
      return { events: ready, timedOut: false };
    }

    // Register the wait BEFORE handing over the turn, then look once more: an event recorded
    // in between rang a bell nobody was listening to, so ring it again ourselves.
    const woken = this.signal.wait(runId, this.limits.waitTimeoutMs);
    let outcome: 'event' | 'timeout';
    try {
      await this.setTurn(runId, PARTY.user);
      if ((await this.log.undelivered(runId)).length) {
        this.signal.ring(runId);
      }
      outcome = await woken;
    } finally {
      await this.setTurn(runId, PARTY.claude);
    }
    const events = await this.takeEvents.execute({ runId });
    return { events, timedOut: outcome === 'timeout' && events.length === 0 };
  }

  private setTurn(runId: string, turn: RunState['turn']): Promise<void> {
    return this.runs.change(runId, (run) => ({ run: setTurn(run, turn), result: undefined }));
  }
}
