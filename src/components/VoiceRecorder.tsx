import { useEffect, useRef, useState } from 'react';
import { formatDuration, supportedMimeType } from '@/domain/audio';
import { useTranslation } from '@/i18n';

// Controlled recorder used on AddObservation. Stays quiet (no recording)
// until the user taps the mic; after they stop, the parent receives a
// blob + mime type + duration which it stores alongside the observation.
//
// Capabilities:
//   - Records via MediaRecorder with a device-appropriate mime type
//   - Max 3 minutes (hard cap; foresters' notes are short)
//   - Shows live duration + a Cancel / Stop + Use / Re-record flow
//   - Falls back gracefully when MediaRecorder isn't available

const MAX_MS = 3 * 60 * 1000;

type Captured = { blob: Blob; mimeType: string; durationMs: number };

export default function VoiceRecorder({
  value,
  onChange,
}: {
  value: Captured | null;
  onChange: (v: Captured | null) => void;
}) {
  const t = useTranslation();
  const [supported] = useState(() => typeof MediaRecorder !== 'undefined');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopStream();
      if (tickRef.current != null) clearInterval(tickRef.current);
    };
  }, []);

  if (!supported) {
    return (
      <p className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-label-sm text-outline">
        {t('voice.unsupported')}
      </p>
    );
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = supportedMimeType() ?? '';
      // Pass options only when we have a supported type; Safari's older
      // MediaRecorder throws NotSupportedError on unknown mime options.
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = Date.now() - startedAtRef.current;
        onChange({ blob, mimeType: type, durationMs });
        stopStream();
        setRecording(false);
        if (tickRef.current != null) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
      };
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        const now = Date.now() - startedAtRef.current;
        setElapsed(now);
        if (now >= MAX_MS) rec.stop();
      }, 200);
    } catch {
      // Permission denied or no mic. Stay silent; the user can try again.
      stopStream();
      setRecording(false);
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
  };

  const clear = () => {
    onChange(null);
  };

  if (recording) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-error bg-error-container/40 p-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-error" />
          </span>
          <div>
            <p className="text-label-md font-bold text-on-error-container">
              {t('voice.recording')}
            </p>
            <p className="font-mono text-label-sm text-on-error-container">
              {formatDuration(elapsed)} / {formatDuration(MAX_MS)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={stop}
          className="touch-safe rounded-lg bg-error px-4 text-on-error"
        >
          <span className="text-label-md font-semibold uppercase tracking-widest">
            {t('voice.stop')}
          </span>
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
        <span className="material-symbols-outlined text-primary-container">mic</span>
        <div className="min-w-0 flex-1">
          <p className="text-label-md font-semibold">{t('voice.saved')}</p>
          <p className="font-mono text-label-sm text-outline">{formatDuration(value.durationMs)}</p>
        </div>
        <audio controls src={URL.createObjectURL(value.blob)} className="h-8 max-w-[160px]" />
        <button
          type="button"
          onClick={clear}
          className="touch-safe flex items-center justify-center rounded-full text-error hover:bg-error-container/40"
          aria-label={t('voice.remove')}
        >
          <span className="material-symbols-outlined">delete</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low p-3 text-on-surface-variant"
    >
      <span className="material-symbols-outlined text-primary-container">mic</span>
      <span className="text-label-md font-semibold">{t('voice.start')}</span>
    </button>
  );
}
