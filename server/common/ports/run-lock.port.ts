/**
 * Serialises everything that reads and then rewrites a run. Claude's tool calls
 * and the page's events arrive at the same time by design, so without this one
 * change would overwrite another, or an event be delivered twice. Not reentrant.
 */
export abstract class RunLock {
  abstract exclusive<T>(runId: string, fn: () => Promise<T>): Promise<T>;
}
