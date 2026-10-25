/** The other reviews open on this machine right now, for the drawer that lists them. */
import type { LiveEntry } from '@shared/contract.ts';
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';

export class ListOpenReviewsUseCase {
  constructor(private readonly server: WorkbenchServer) {}

  execute(): Promise<LiveEntry[]> {
    return this.server.liveRuns();
  }
}
