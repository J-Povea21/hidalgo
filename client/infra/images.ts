/**
 * Images are shrunk in the browser before they're sent: at most 1500 px on the
 * long side, re-encoded as WebP. Re-encoding through a canvas also drops all
 * metadata (a phone photo's GPS location and device details).
 */
export const MAX_EDGE = 1500;
export const MAX_PER_MESSAGE = 5;

export async function compress(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.85);
  // Browsers without a WebP encoder return PNG; still resized and stripped.
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}
