// Client-side image pipeline for field observations:
// - Downscale to 1600px longest edge (preserves aspect ratio)
// - Re-encode as JPEG at quality 0.82
// - Strip EXIF (canvas draw discards it)
// - Return new blob + measured width/height
//
// GPS is *not* parsed from EXIF — observations carry fresh navigator.geolocation
// at capture time, which is both more accurate and avoids pulling in an EXIF lib.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export type ProcessedPhoto = {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  finalSize: number;
};

export async function processPhoto(input: Blob): Promise<ProcessedPhoto> {
  const bitmap = await createImageBitmap(input);
  try {
    const { width: sw, height: sh } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    // Prefer OffscreenCanvas when available; fall back to DOM canvas on older browsers.
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(dw, dh)
        : Object.assign(document.createElement('canvas'), { width: dw, height: dh });
    const ctx = (canvas as OffscreenCanvas).getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error('canvas_2d_unavailable');
    ctx.drawImage(bitmap, 0, 0, dw, dh);

    const blob = await toJpeg(canvas, JPEG_QUALITY);
    return {
      blob,
      width: dw,
      height: dh,
      originalSize: input.size,
      finalSize: blob.size,
    };
  } finally {
    bitmap.close?.();
  }
}

async function toJpeg(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob_null'))),
      'image/jpeg',
      quality,
    );
  });
}
