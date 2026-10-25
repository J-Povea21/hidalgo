import type { RecordedEvent, UnsequencedEvent } from '@shared/contract.ts';

/** Every page event, appended before it is applied, and how far Claude has read. */
export abstract class EventLog {
  /** Durably appends and returns the event's sequence number. */
  abstract append(runId: string, event: UnsequencedEvent): Promise<number>;
  /** Events with seq greater than the delivery cursor. */
  abstract undelivered(runId: string): Promise<RecordedEvent[]>;
  /** Events with seq greater than `seq`, delivered or not (used to replay into state). */
  abstract after(runId: string, seq: number): Promise<RecordedEvent[]>;
  /** Moves the cursor; events at or below it are never delivered again. */
  abstract markDelivered(runId: string, seq: number): Promise<void>;
}
