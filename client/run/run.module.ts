import type { HidalgoServer } from '@client/common/ports/hidalgo-server.port.ts';
import { ListOpenReviewsUseCase } from '@client/run/application/use-cases/list-open-reviews.use-case.ts';

export interface RunModule {
  listOpenReviews: ListOpenReviewsUseCase;
}

/** The run as a whole on the page: its progress, its connection, the tab, the other open reviews. */
export function runModule(server: HidalgoServer): RunModule {
  return { listOpenReviews: new ListOpenReviewsUseCase(server) };
}
