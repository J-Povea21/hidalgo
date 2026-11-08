import type { LiveEntry } from '@shared/contract.ts';
import type { HidalgoServer } from '@client/common/ports/hidalgo-server.port.ts';

/** The other reviews open on this machine right now, for the drawer that lists them. */
export class ListOpenReviewsUseCase {
  constructor(private readonly server: HidalgoServer) {}

  execute(): Promise<LiveEntry[]> {
    return this.server.liveRuns();
  }
}
