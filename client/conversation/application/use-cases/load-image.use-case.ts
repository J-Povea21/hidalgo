import type { HidalgoServer } from '@client/common/ports/hidalgo-server.port.ts';

/** A message's stored image, as an address an <img> can show. */
export class LoadImageUseCase {
  constructor(private readonly server: HidalgoServer) {}

  execute(input: { name: string }): Promise<string> {
    return this.server.imageBlob(input.name);
  }
}
