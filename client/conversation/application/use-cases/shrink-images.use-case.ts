import type { ImageShrinker } from '@client/conversation/domain/ports/image-shrinker.port.ts';

export interface ShrinkImagesInput {
  files: Blob[];
}

/** Shrinks the images about to be attached to a message, in the order they were given. */
export class ShrinkImagesUseCase {
  constructor(private readonly shrinker: ImageShrinker) {}

  execute(input: ShrinkImagesInput): Promise<string[]> {
    return Promise.all(input.files.map((file) => this.shrinker.shrink(file)));
  }
}
