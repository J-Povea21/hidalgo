/** Lets wait-for-events sleep until record-page-event rings. */
export abstract class EventSignal {
  abstract ring(runId: string): void;
  abstract wait(runId: string, timeoutMs: number): Promise<'event' | 'timeout'>;
  /** Whether a wait is currently pending for the run (it decides "your turn"). */
  abstract waiting(runId: string): boolean;
}
