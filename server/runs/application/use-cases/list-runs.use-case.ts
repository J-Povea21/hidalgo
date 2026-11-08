import type { RunState } from '@shared/contract.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import type { LiveIndex } from '@server/runs/domain/ports/live-index.port.ts';
import { RUN_STATUS } from '@shared/values.ts';

export interface ListRunsInput {
  project: string;
  includeClosed?: boolean | undefined;
}

export interface ListedRuns {
  runs: RunState[];
  /** The runs a Hidalgo server is serving right now (another session's, maybe). */
  liveRunIds: Set<string>;
}

/**
 * The project's runs, read-only: what resume offers, and what the card skill's
 * duplicate search checks so drafts not yet on the board are seen too.
 */
export class ListRunsUseCase {
  constructor(
    private readonly store: RunStore,
    private readonly live: LiveIndex,
  ) {}

  async execute(input: ListRunsInput): Promise<ListedRuns> {
    const [runs, live] = await Promise.all([this.store.list(input.project), this.live.alive()]);
    return {
      runs: runs.filter((run) => input.includeClosed || run.status !== RUN_STATUS.closed),
      liveRunIds: new Set(live.map((entry) => entry.runId)),
    };
  }
}
