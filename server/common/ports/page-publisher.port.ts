import type { RunState } from '@shared/contract.ts';

/** Pushes the run's state to the open page. */
export abstract class PagePublisher {
  abstract publish(run: RunState): void;
}
