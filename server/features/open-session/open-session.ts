/**
 * Starts a run, or resumes one from disk (after `claude --resume`, a crash, or
 * a reboot). A resumed run replays any logged page events its saved state
 * hadn't absorbed, so nothing the user did is lost.
 */
import type { RunState } from '@shared/contract.ts';
import { WorkbenchError } from '@server/kernel/errors.ts';
import { replay } from '@server/kernel/events.ts';
import type { Clock, EventLog, Ids, PagePublisher, RunStore } from '@server/kernel/ports.ts';
import { newRun, reopen } from '@server/kernel/run.ts';
import { RUN_STATUS } from '@shared/values.ts';

export interface OpenSessionDeps {
  store: RunStore;
  log: EventLog;
  clock: Clock;
  ids: Ids;
  page: PagePublisher;
}

export interface OpenSessionInput {
  skill: string;
  project: string;
  subject: string;
  resume?: string | undefined;
}

/** Where the page lives is the server's business: the caller serves the run and builds its address. */
export async function openSession(
  deps: OpenSessionDeps,
  input: OpenSessionInput,
): Promise<{ run: RunState; resumed: boolean }> {
  if (input.resume) {
    const saved = await deps.store.load(input.resume);
    if (!saved)
      throw new WorkbenchError('not-found', `no run ${input.resume} to resume; list_runs shows the project's runs`);
    if (saved.status === RUN_STATUS.closed)
      throw new WorkbenchError('closed', `run ${input.resume} is closed and can't be resumed`);
    const run = reopen(replay(saved, await deps.log.after(saved.id, saved.appliedSeq)));
    await deps.store.save(run);
    deps.page.publish(run);
    return { run, resumed: true };
  }
  const run = newRun({
    id: deps.ids.next('r'),
    skill: input.skill,
    project: input.project,
    subject: input.subject,
    now: deps.clock.now(),
    threadId: deps.ids.next('t'),
  });
  await deps.store.save(run);
  deps.page.publish(run);
  return { run, resumed: false };
}
