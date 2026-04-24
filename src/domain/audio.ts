// Audio recording helpers. MediaRecorder-based; supported on every
// modern browser (Chrome 47+, Safari 14+, Firefox 25+, mobile counterparts).
//
// We prefer audio/webm where available (Chrome, Android) because it's
// smaller than alternatives at forest-voice quality. Safari on iOS only
// exposes audio/mp4 — we fall back to that so the feature still ships
// for iPhone users. Both are playable by any `<audio>` tag on any device.

export function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  // Safari older than 14.3 returns false for all known types but accepts
  // no-argument construction. Signal 'unknown' to let the caller try.
  return '';
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
