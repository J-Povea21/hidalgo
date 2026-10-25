import type { ImageShrinker } from '@client/conversation/domain/ports/image-shrinker.port.ts';

const MAX_EDGE = 1500;
/** WebP quality: small files, no artefacts a reader would notice in a screenshot. */
const WEBP_QUALITY = 0.85;

/**
 * Shrinks images in the browser before they're sent: at most 1500 px on the long side,
 * re-encoded as WebP. Re-encoding through a canvas also drops all metadata (a phone
 * photo's GPS location and device details).
 */
export class BrowserImageShrinker implements ImageShrinker {
  async shrink(file: Blob): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const webp = canvas.toDataURL('image/webp', WEBP_QUALITY);
    // Browsers without a WebP encoder return PNG; still resized and stripped.
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  }
}
