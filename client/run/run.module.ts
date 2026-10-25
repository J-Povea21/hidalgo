/** The run as a whole on the page: its progress, its connection, the tab, the other open reviews. */
import type { WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';
import { ListOpenReviewsUseCase } from '@client/run/application/use-cases/list-open-reviews.use-case.ts';

export interface RunModule {
  listOpenReviews: ListOpenReviewsUseCase;
}

export function runModule(server: WorkbenchServer): RunModule {
  return { listOpenReviews: new ListOpenReviewsUseCase(server) };
}
