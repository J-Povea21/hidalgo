/**
 * The interfaces slices use to reach the outside world. Declared once here so
 * every slice shares them; implemented only in server/infra.
 */
import type { LiveEntry, RecordedEvent, RunState, UnsequencedEvent } from '@shared/contract.ts';

export interface Clock {
  now(): string;
}
export interface Ids {
  next(prefix: string): string;
}

export interface RunStore {
  load(runId: string): Promise<RunState | undefined>;
  save(run: RunState): Promise<void>;
  /** Every run on disk for a project, newest first; every project when omitted. */
  list(project?: string): Promise<RunState[]>;
  /** Removes a run's folder: state, log and images. */
  remove(runId: string): Promise<void>;
}

export interface EventLog {
  /** Durably appends and returns the event's sequence number. */
  append(runId: string, event: UnsequencedEvent): Promise<number>;
  /** Events with seq greater than the delivery cursor. */
  undelivered(runId: string): Promise<RecordedEvent[]>;
  /** Events with seq greater than `seq`, delivered or not (used to replay into state). */
  after(runId: string, seq: number): Promise<RecordedEvent[]>;
  /** Moves the cursor; events at or below it are never delivered again. */
  markDelivered(runId: string, seq: number): Promise<void>;
}

export interface ImageStore {
  /** Stores a data: URL, de-duplicated by content; returns the file name. */
  save(runId: string, dataUrl: string): Promise<string>;
  usedBytes(runId: string): Promise<number>;
  /** Absolute path of a stored image, so Claude can open it. */
  path(runId: string, name: string): Promise<string>;
}

/**
 * Serialises everything that reads and then rewrites a run. Claude's tool calls
 * and the page's events arrive at the same time by design, so without this one
 * change would overwrite another, or an event be delivered twice. Not reentrant.
 */
export interface RunLock {
  exclusive<T>(runId: string, fn: () => Promise<T>): Promise<T>;
}

/** Pushes the run's state to the open page. */
export interface PagePublisher {
  publish(run: RunState): void;
}

/** Lets wait-for-events sleep until record-page-event rings. */
export interface EventSignal {
  ring(runId: string): void;
  wait(runId: string, timeoutMs: number): Promise<'event' | 'timeout'>;
  /** Whether a wait is currently pending for the run (it decides "your turn"). */
  waiting(runId: string): boolean;
}

export interface LiveIndex {
  write(entry: LiveEntry): Promise<void>;
  remove(runId: string): Promise<void>;
  /** Entries whose server is alive; dead ones are deleted on the way. */
  alive(): Promise<LiveEntry[]>;
}

/** Where this server's page lives. */
export interface PageAddress {
  url(runId: string): string;
}

export interface Limits {
  imageBytesPerRun: number;
  imageWarnBytes: number;
  waitTimeoutMs: number;
}
