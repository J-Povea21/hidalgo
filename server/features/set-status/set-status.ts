/** The live line the page shows while Claude works ("adversary round 1 of 2"). Empty clears it. */
import { setStatusLine } from '@server/domain/run.ts';
import { changeRun, type RunDeps } from '@server/domain/unit-of-work.ts';

export function setStatus(deps: RunDeps, input: { runId: string; line?: string | undefined }) {
  return changeRun(deps, input.runId, (run) => ({
    run: setStatusLine(run, input.line?.trim() || undefined),
    result: {},
  }));
}
