import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { CreateDiagramUseCase } from '@server/conversation/application/use-cases/create-diagram.use-case.ts';
import { SendMessageUseCase } from '@server/conversation/application/use-cases/send-message.use-case.ts';

export interface ConversationModule {
  sendMessage: SendMessageUseCase;
  createDiagram: CreateDiagramUseCase;
}

/** Claude's side of the conversation: messages and the diagrams they embed. */
export function conversationModule(adapters: { runs: RunChanges; ids: Ids; clock: Clock }): ConversationModule {
  return {
    sendMessage: new SendMessageUseCase(adapters.runs, adapters.ids, adapters.clock),
    createDiagram: new CreateDiagramUseCase(adapters.runs, adapters.ids),
  };
}
