import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useTranslation } from '@/i18n';
import { observationRepo } from '@/data/observationRepo';
import type { Category, Priority } from '@/data/types';

const priorities: Priority[] = ['low', 'medium', 'critical'];
const categories: Category[] = ['beetle', 'thinning', 'reforestation', 'windthrow', 'erosion', 'machine', 'other'];

export default function AddObservation() {
  const navigate = useNavigate();
  const t = useTranslation();
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<Category>('other');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<Blob | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const requestLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPhoto(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) return;
    const id = await observationRepo.create({
      category,
      priority,
      description,
      lat: coords.lat,
      lng: coords.lng,
      photo,
    });
    navigate(`/observations/${id}`);
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
                onClick={() => setCategory(c)}
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
          <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">priority_high</span>
            {t('record.priority')}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {priorities.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
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

        {/* Location */}
        <div className="space-y-stack-sm">
          <div className="flex items-end justify-between">
            <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">location_on</span>
              {t('record.location')}
            </label>
            {coords && (
              <span className="text-label-sm tracking-widest text-primary">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            )}
          </div>
          {coords ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-low">
              <span className="material-symbols-outlined filled text-4xl text-safety">location_on</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={requestLocation}
              disabled={locating}
              className="touch-safe w-full rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low text-on-surface-variant"
            >
              {locating ? t('record.locating') : t('record.captureLocation')}
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
