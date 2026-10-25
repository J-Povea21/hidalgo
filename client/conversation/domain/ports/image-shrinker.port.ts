/**
 * Shrinks an image the user attached before it is sent, and returns it as a data URL.
 * What "shrunk" means (size, format, metadata) is the adapter's to decide.
 */
export abstract class ImageShrinker {
  abstract shrink(file: Blob): Promise<string>;
}
