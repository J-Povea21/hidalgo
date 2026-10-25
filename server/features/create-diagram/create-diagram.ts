/**
 * Adds a diagram to the run from its structure and returns its id. Messages
 * and item text embed it with `{{diagram:<id>}}`. A bad structure is refused
 * here, with the reason, and nothing reaches the page.
 */
import { DiagramSpec } from '@shared/contract.ts';
import { WorkbenchError } from '@server/kernel/errors.ts';
import type { Ids } from '@server/kernel/ports.ts';
import { addDiagram } from '@server/kernel/run.ts';
import { changeRun, type RunDeps } from '@server/kernel/unit-of-work.ts';
import { toMermaid, toOutline } from './mermaid.ts';

export function createDiagram(deps: RunDeps & { ids: Ids }, input: { runId: string; spec: unknown }) {
  const parsed = DiagramSpec.safeParse(input.spec);
  if (!parsed.success) {
    throw new WorkbenchError('invalid', 'diagram spec is not valid', parsed.error.issues);
  }
  const mermaid = toMermaid(parsed.data);
  const outline = toOutline(parsed.data);
  return changeRun(deps, input.runId, (run) => {
    const id = deps.ids.next('d');
    return {
      run: addDiagram(run, { id, mermaid, outline }),
      result: { diagramId: id, embed: `{{diagram:${id}}}` },
    };
  });
}
