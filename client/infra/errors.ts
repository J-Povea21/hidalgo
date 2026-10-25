/** A request the server refused, or one the page wouldn't send. `message` is fit to show the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Sent nothing: the server hasn't proved it holds this run's token on this connection. */
export class NotConnectedError extends ApiError {
  constructor() {
    super(0, "Not connected to Claude's session yet. Your text is kept.");
  }
}
