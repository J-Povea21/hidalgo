/** The live line the page shows while Claude works ("adversary round 1 of 2"). Empty clears it. */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { setStatusLine } from '@server/common/domain/run.ts';

export interface SetStatusInput {
  runId: string;
  line?: string | undefined;
}

export class SetStatusUseCase {
  constructor(private readonly runs: RunChanges) {}

  execute(input: SetStatusInput) {
    return this.runs.change(input.runId, (run) => ({
      run: setStatusLine(run, input.line?.trim() || undefined),
      result: {},
    }));
  }
}
