/**
 * Adds a diagram to the run from its structure and returns its id. Messages
 * and item text embed it with `{{diagram:<id>}}`. A bad structure is refused
 * here, with the reason, and nothing reaches the page.
 */
import { DiagramSpec } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { WorkbenchError } from '@server/common/domain/errors.ts';
import { addDiagram } from '@server/common/domain/run.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { toMermaid, toOutline } from '@server/conversation/domain/mermaid.ts';

export interface CreateDiagramInput {
  runId: string;
  spec: unknown;
}

export class CreateDiagramUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
  ) {}

  async execute(input: CreateDiagramInput) {
    const parsed = DiagramSpec.safeParse(input.spec);
    if (!parsed.success) {
      throw new WorkbenchError('invalid', 'diagram spec is not valid', parsed.error.issues);
    }
    const mermaid = toMermaid(parsed.data);
    const outline = toOutline(parsed.data);
    return this.runs.change(input.runId, (run) => {
      const id = this.ids.next('d');
      return {
        run: addDiagram(run, { id, mermaid, outline }),
        result: { diagramId: id, embed: `{{diagram:${id}}}` },
      };
    });
  }
}
