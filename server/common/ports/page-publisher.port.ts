/** Pushes the run's state to the open page. */
import type { RunState } from '@shared/contract.ts';

export abstract class PagePublisher {
  abstract publish(run: RunState): void;
}
