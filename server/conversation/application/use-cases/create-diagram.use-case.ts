import { DiagramSpec, type Diagram } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { addDiagram } from '@server/common/domain/conversation.rules.ts';
import { HidalgoError } from '@server/common/domain/errors.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { toMermaid, toOutline } from '@server/conversation/domain/mermaid.ts';

export interface CreateDiagramInput {
  runId: string;
  spec: unknown;
}

/**
 * Adds a diagram to the run from its structure. Messages and item text embed it
 * by its id. A bad structure is refused here, with the reason, and nothing
 * reaches the page.
 */
export class CreateDiagramUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
  ) {}

  async execute(input: CreateDiagramInput): Promise<Diagram> {
    const parsed = DiagramSpec.safeParse(input.spec);
    if (!parsed.success) {
      throw new HidalgoError('invalid', 'diagram spec is not valid', parsed.error.issues);
    }
    const mermaid = toMermaid(parsed.data);
    const outline = toOutline(parsed.data);
    return this.runs.change(input.runId, (run) => {
      const diagram: Diagram = { id: this.ids.next('d'), mermaid, outline };
      return { run: addDiagram(run, diagram), result: diagram };
    });
  }
}
