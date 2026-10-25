/** A message's stored image, as an address an <img> can show. */
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

export class LoadImageUseCase {
  constructor(private readonly server: WorkbenchServer) {}

  execute(input: { name: string }): Promise<string> {
    return this.server.imageBlob(input.name);
  }
}
