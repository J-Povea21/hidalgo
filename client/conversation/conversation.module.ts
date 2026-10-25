/** The conversations on the page: the threads, their images, and quoting an item into them. */
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';
import { LoadImageUseCase } from '@client/conversation/application/use-cases/load-image.use-case.ts';

export interface ConversationModule {
  loadImage: LoadImageUseCase;
}

export function conversationModule(server: WorkbenchServer): ConversationModule {
  return { loadImage: new LoadImageUseCase(server) };
}
