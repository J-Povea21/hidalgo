/** Where the images pasted into messages are kept, so Claude can open them. */
export abstract class ImageStore {
  /** Stores a data: URL, de-duplicated by content; returns the file name. */
  abstract save(runId: string, dataUrl: string): Promise<string>;
  abstract usedBytes(runId: string): Promise<number>;
  /** Absolute path of a stored image, so Claude can open it. */
  abstract path(runId: string, name: string): Promise<string>;
}
