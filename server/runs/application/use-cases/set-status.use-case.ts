import type { RunState } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { setStatusLine } from '@server/common/domain/run.rules.ts';

export interface SetStatusInput {
  runId: string;
  line?: string | undefined;
}

/** The live line the page shows while Claude works ("adversary round 1 of 2"). Empty clears it. */
export class SetStatusUseCase {
  constructor(private readonly runs: RunChanges) {}

  execute(input: SetStatusInput): Promise<RunState> {
    return this.runs.change(input.runId, (run) => {
      const next = setStatusLine(run, input.line?.trim() || undefined);
      return { run: next, result: next };
    });
  }
}
