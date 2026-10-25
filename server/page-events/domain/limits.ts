/** How much a run may store, and how long Claude waits for the user before the tool call returns. */
export interface Limits {
  imageBytesPerRun: number;
  imageWarnBytes: number;
  waitTimeoutMs: number;
}
