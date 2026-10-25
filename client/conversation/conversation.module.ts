import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';
import { LoadImageUseCase } from '@client/conversation/application/use-cases/load-image.use-case.ts';
import { ShrinkImagesUseCase } from '@client/conversation/application/use-cases/shrink-images.use-case.ts';
import type { ImageShrinker } from '@client/conversation/domain/ports/image-shrinker.port.ts';

export interface ConversationModule {
  loadImage: LoadImageUseCase;
  shrinkImages: ShrinkImagesUseCase;
}

/** The conversations on the page: the threads, their images, and quoting an item into them. */
export function conversationModule(adapters: { server: WorkbenchServer; shrinker: ImageShrinker }): ConversationModule {
  return {
    loadImage: new LoadImageUseCase(adapters.server),
    shrinkImages: new ShrinkImagesUseCase(adapters.shrinker),
  };
}
