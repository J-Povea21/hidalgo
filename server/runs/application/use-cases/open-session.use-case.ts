import type { RunState } from '@shared/contract.ts';
import { WorkbenchError } from '@server/common/domain/errors.ts';
import { replay } from '@server/common/domain/page-event.rules.ts';
import { newRun, reopen } from '@server/common/domain/run.rules.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import { RUN_STATUS } from '@shared/values.ts';

export interface OpenSessionInput {
  skill: string;
  project: string;
  subject: string;
  resume?: string | undefined;
}

/**
 * Starts a run, or resumes one from disk (after `claude --resume`, a crash, or
 * a reboot). A resumed run replays any logged page events its saved state
 * hadn't absorbed, so nothing the user did is lost.
 *
 * Where the page lives is the server's business: the caller serves the run and builds its address.
 */
export class OpenSessionUseCase {
  constructor(
    private readonly store: RunStore,
    private readonly log: EventLog,
    private readonly page: PagePublisher,
    private readonly clock: Clock,
    private readonly ids: Ids,
  ) {}

  async execute(input: OpenSessionInput): Promise<{ run: RunState; resumed: boolean }> {
    const run = input.resume ? await this.resumed(input.resume) : this.started(input);
    await this.store.save(run);
    this.page.publish(run);
    return { run, resumed: Boolean(input.resume) };
  }

  private async resumed(runId: string): Promise<RunState> {
    const saved = await this.store.load(runId);
    if (!saved) {
      throw new WorkbenchError('not-found', `no run ${runId} to resume; list_runs shows the project's runs`);
    }
    if (saved.status === RUN_STATUS.closed) {
      throw new WorkbenchError('closed', `run ${runId} is closed and can't be resumed`);
    }
    return reopen(replay(saved, await this.log.after(saved.id, saved.appliedSeq)));
  }

  private started(input: OpenSessionInput): RunState {
    return newRun({
      id: this.ids.next('r'),
      skill: input.skill,
      project: input.project,
      subject: input.subject,
      now: this.clock.now(),
      threadId: this.ids.next('t'),
    });
  }
}
