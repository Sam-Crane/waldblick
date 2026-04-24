import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useTranslation } from '@/i18n';
import { observationRepo } from '@/data/observationRepo';
import { defaultPriorityFor } from '@/domain/priority';
import { averagePositions, trimOutliers, type GpsSample } from '@/domain/gps';
import { useToast } from '@/components/Toast';
import type { Category, Priority } from '@/data/types';

const MEASURE_SECONDS = 30;

const priorities: Priority[] = ['low', 'medium', 'critical'];
const categories: Category[] = ['beetle', 'thinning', 'reforestation', 'windthrow', 'erosion', 'machine', 'other'];

export default function AddObservation() {
  const navigate = useNavigate();
  const t = useTranslation();
  const toast = useToast();
  const [category, setCategory] = useState<Category>('other');
  const [priority, setPriority] = useState<Priority>(() => defaultPriorityFor('other'));
  const [priorityTouched, setPriorityTouched] = useState(false);

  // When the user picks a category, auto-suggest a priority (but only if
  // they haven't manually changed it yet — don't clobber their choice).
  const pickCategory = (c: Category) => {
    setCategory(c);
    if (!priorityTouched) setPriority(defaultPriorityFor(c));
  };
  const pickPriority = (p: Priority) => {
    setPriority(p);
    setPriorityTouched(true);
  };
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<Blob | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [countdown, setCountdown] = useState(MEASURE_SECONDS);
  const samplesRef = useRef<GpsSample[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // 30-second GPS averaging. Stream positions via watchPosition, store
  // them, then inverse-variance-weight into a single fix. User can stop
  // early by tapping "Use now".
  const startMeasuring = () => {
    if (!navigator.geolocation) {
      toast.error(t('record.gpsUnavailable'));
      return;
    }
    samplesRef.current = [];
    setCountdown(MEASURE_SECONDS);
    setMeasuring(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        samplesRef.current.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        });
      },
      () => {
        /* individual errors are tolerable — we keep going */
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );

    tickRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          finishMeasuring();
          return 0;
        }
        return c - 1;
      });
    }, 1_000);
  };

  const finishMeasuring = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tickRef.current != null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setMeasuring(false);

    const raw = samplesRef.current;
    if (raw.length === 0) {
      toast.error(t('record.gpsNoSamples'));
      return;
    }
    const cleaned = trimOutliers(raw);
    const fix = averagePositions(cleaned.length > 0 ? cleaned : raw);
    setCoords({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
    toast.success(
      t('record.gpsDone', {
        samples: fix.samples,
        accuracy: Math.round(fix.accuracy),
      }),
    );
  };

  // Clean up timers if the screen unmounts mid-measurement.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (tickRef.current != null) clearInterval(tickRef.current);
    };
  }, []);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPhoto(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) return;
    try {
      const id = await observationRepo.create({
        category,
        priority,
        description,
        lat: coords.lat,
        lng: coords.lng,
        photo,
      });
      toast.success(t('record.saved'));
      navigate(`/observations/${id}`);
    } catch (err) {
      toast.error(t('record.saveFailed', { error: (err as Error).message }));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={t('record.title')}
        leading={
          <button
            onClick={() => navigate(-1)}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
        }
      />
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-2xl space-y-stack-lg px-margin-main py-stack-lg">
        {/* Photo */}
        <label className="relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low hover:bg-surface-container">
          {photo ? (
            <img src={URL.createObjectURL(photo)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <span className="material-symbols-outlined mb-2 text-[48px] text-primary">add_a_photo</span>
              <span className="font-semibold text-on-surface-variant">{t('record.addPhoto')}</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
        </label>

        {/* Description */}
        <div className="space-y-stack-sm">
          <label htmlFor="description" className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">description</span>
            {t('record.description')}
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('record.descriptionPlaceholder')}
            className="min-h-[120px] w-full rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-4 text-body-md outline-none focus:border-primary-container"
          />
        </div>

        {/* Category */}
        <div className="space-y-stack-sm">
          <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">category</span>
            {t('record.category')}
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pickCategory(c)}
                className={`touch-safe rounded-lg border-2 px-3 text-label-md transition ${
                  category === c
                    ? 'border-primary-container bg-primary-container text-on-primary'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                }`}
              >
                {t(`category.${c}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-stack-sm">
          <div className="flex items-end justify-between">
            <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">priority_high</span>
              {t('record.priority')}
            </label>
            {!priorityTouched && (
              <span className="text-label-sm text-outline">{t('record.autoSuggested')}</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {priorities.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => pickPriority(p)}
                className={`touch-safe flex flex-col items-center justify-center rounded-lg border-2 px-2 py-3 transition active:scale-95 ${
                  priority === p
                    ? 'border-primary-container bg-primary-container text-on-primary shadow-md'
                    : 'border-outline-variant bg-surface-container-lowest'
                }`}
              >
                <span
                  className={`mb-2 h-3 w-3 rounded-full ${
                    p === 'critical' ? 'bg-safety' : p === 'medium' ? 'bg-tertiary-container' : 'bg-primary'
                  }`}
                />
                <span className="text-label-sm uppercase">{t(`priority.${p}`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Location — 30s averaging hold. Accuracy improves 2-3× vs a
            single reading, which matters under forest canopy. */}
        <div className="space-y-stack-sm">
          <div className="flex items-end justify-between">
            <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">location_on</span>
              {t('record.location')}
            </label>
            {coords && (
              <span className="text-label-sm tracking-widest text-primary">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · ±{Math.round(coords.accuracy)}m
              </span>
            )}
          </div>

          {measuring ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary-fixed p-4">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-outline-variant" />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="text-primary transition-[stroke-dashoffset] duration-1000"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (countdown / MEASURE_SECONDS)}`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-label-md font-bold text-primary">
                  {countdown}
                </span>
              </div>
              <p className="text-label-md font-semibold text-primary">
                {t('record.measuring', { n: samplesRef.current.length })}
              </p>
              <p className="text-label-sm text-on-surface-variant">{t('record.measuringHint')}</p>
              <button
                type="button"
                onClick={finishMeasuring}
                className="touch-safe mt-1 rounded-lg bg-primary px-4 text-on-primary"
              >
                <span className="text-label-md font-semibold uppercase tracking-widest">
                  {t('record.useNow')}
                </span>
              </button>
            </div>
          ) : coords ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container-low">
              <span className="material-symbols-outlined filled text-4xl text-safety">location_on</span>
              <button
                type="button"
                onClick={startMeasuring}
                className="mt-2 text-label-sm font-semibold text-primary-container underline"
              >
                {t('record.remeasure')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startMeasuring}
              className="touch-safe w-full rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low p-4 text-on-surface-variant"
            >
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">my_location</span>
                <span className="font-semibold">{t('record.startMeasuring')}</span>
              </span>
              <span className="mt-1 block text-label-sm text-outline">
                {t('record.startMeasuringHint', { n: MEASURE_SECONDS })}
              </span>
            </button>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!coords}
          className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety text-on-tertiary-fixed shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          <span className="font-bold uppercase tracking-widest text-white">{t('record.submit')}</span>
          <span className="material-symbols-outlined text-white">send</span>
        </button>
      </form>
    </div>
  );
}
