/** A rule the caller broke. Carried back to Claude as the tool's error, never shown as a crash. */
export class HidalgoError extends Error {
  constructor(
    readonly code:
      | 'not-found'
      | 'invalid'
      | 'stale-revision'
      | 'open-questions'
      | 'open-items'
      | 'thread-mismatch'
      | 'closed'
      | 'limit',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HidalgoError';
  }
}
