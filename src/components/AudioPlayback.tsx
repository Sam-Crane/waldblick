import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { formatDuration } from '@/domain/audio';
import { useTranslation } from '@/i18n';

// Renders the audio clip (if any) attached to an observation. Reads from
// Dexie live so captures made while offline appear immediately.
export default function AudioPlayback({ observationId }: { observationId: string }) {
  const t = useTranslation();
  const audio = useLiveQuery(
    () => db.audio.where('observationId').equals(observationId).first(),
    [observationId],
  );
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audio?.blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(audio.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [audio?.blob]);

  if (!audio) return null;

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-label-sm uppercase tracking-widest text-outline">
          <span className="material-symbols-outlined text-[16px]">mic</span>
          {t('voice.recorded')}
        </h3>
        <span className="font-mono text-label-sm text-outline">
          {formatDuration(audio.durationMs)}
        </span>
      </div>
      {url && <audio controls src={url} className="w-full" />}
    </section>
  );
}
