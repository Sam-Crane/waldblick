// Camera capture. On native we use @capacitor/camera for deeper control
// (exif preservation, explicit source picker, saves less intermediate
// memory). On web we fall back to an <input type=file capture=environment>
// which is what AddObservation already uses.

import { isNative } from './index';

export type CameraCapture = {
  blob: Blob;
  mimeType: string;
};

export async function takePhoto(): Promise<CameraCapture | null> {
  if (!isNative()) {
    // Web path: the DOM <input> flow stays in AddObservation. This helper
    // is only used when the calling code wants to route through the
    // platform abstraction unconditionally.
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve({ blob: file, mimeType: file.type || 'image/jpeg' });
      };
      input.click();
    });
  }

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      correctOrientation: true,
      // Native: we can ask for a specific format and let the plugin
      // handle focus + preview UI. The user sees the system camera, which
      // supports pinch-zoom, manual focus (tap to focus), and burst — all
      // things a web <input> can't expose.
    });
    if (!photo.webPath) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    return { blob, mimeType: blob.type || `image/${photo.format ?? 'jpeg'}` };
  } catch {
    return null;
  }
}
