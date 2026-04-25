import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import PlotDrawMap from '@/map/PlotDrawMap';
import { plotsRepo } from '@/data/plotsRepo';
import { useToast } from '@/components/Toast';
import { useTranslation } from '@/i18n';
import type { Plot } from '@/data/types';

// Two-phase plot creator. The user:
//   1. Taps on the map to drop polygon corners. Visual feedback live.
//   2. Hits Finish → polygon closes → name + colour panel slides in below.
//   3. Hits Save → plot lands in their forest, map screen flies to it.
//
// We deliberately don't ask for cadastral parcel IDs. Public ALKIS doesn't
// expose ownership names anyway, and forest owners think in terms of
// practical forest blocks, not surveyed Flurstücke.

const COLORS = ['#173124', '#765840', '#4f1c00', '#2d4739', '#ba1a1a', '#FF6B00'];
const MIN_VERTICES = 3;

export default function PlotEditor() {
  const t = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [closed, setClosed] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  const undo = () => {
    setVertices((prev) => prev.slice(0, -1));
  };
  const reset = () => {
    setVertices([]);
    setClosed(false);
  };
  const finish = () => {
    if (vertices.length < MIN_VERTICES) return;
    setClosed(true);
  };
  const continueDrawing = () => {
    setClosed(false);
  };

  const save = async () => {
    if (!name.trim() || vertices.length < MIN_VERTICES) return;
    setBusy(true);
    // Build a closed GeoJSON Polygon from the vertex sequence. Convention:
    // first ring is the outer boundary, must end with a duplicate of the
    // first point to close the ring.
    const ring: [number, number][] = [...vertices, vertices[0]];
    const boundary: Plot['boundary'] = {
      type: 'Polygon',
      coordinates: [ring],
    };
    const result = await plotsRepo.create({ name: name.trim(), color, boundary });
    setBusy(false);
    if (!result.ok) {
      toast.error(t(`plots.createErr.${result.error}`));
      return;
    }
    toast.success(t('plots.created', { name: result.plot.name }));
    navigate('/map', { replace: true, state: { focusPlotId: result.plot.id } });
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar
        title={t('plots.new')}
        leading={
          <button
            onClick={() => navigate(-1)}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
        }
        showProfile={false}
      />

      {/* Map: takes whatever space is left after the bottom panel. */}
      <div className="relative min-h-0 flex-1">
        <PlotDrawMap vertices={vertices} onChange={setVertices} closed={closed} />
      </div>

      {/* Bottom action panel — morphs across the three phases of the flow. */}
      <div className="border-t border-outline-variant bg-surface-container-lowest p-margin-main pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!closed && vertices.length === 0 && (
          <div className="flex flex-col gap-stack-sm">
            <p className="flex items-center gap-2 text-body-md text-on-surface-variant">
              <span className="material-symbols-outlined text-primary">touch_app</span>
              {t('plots.draw.tapToStart')}
            </p>
            <p className="text-label-sm text-outline">{t('plots.draw.tapToStartHint')}</p>
          </div>
        )}

        {!closed && vertices.length > 0 && (
          <div className="flex flex-col gap-stack-md">
            <div className="flex items-center justify-between">
              <p className="text-label-md font-semibold text-on-surface">
                {t('plots.draw.cornersDrawn', { n: vertices.length })}
              </p>
              {vertices.length < MIN_VERTICES && (
                <p className="text-label-sm text-outline">
                  {t('plots.draw.minVertices', { min: MIN_VERTICES })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={vertices.length === 0}
                className="touch-safe flex flex-1 items-center justify-center gap-1 rounded-lg border border-outline-variant text-on-surface active:scale-95 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[18px]">undo</span>
                <span className="text-label-md font-semibold">{t('plots.draw.undo')}</span>
              </button>
              <button
                type="button"
                onClick={reset}
                className="touch-safe flex flex-1 items-center justify-center gap-1 rounded-lg border border-outline-variant text-on-surface-variant active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                <span className="text-label-md font-semibold">{t('plots.draw.reset')}</span>
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={vertices.length < MIN_VERTICES}
                className="touch-safe flex flex-[2] items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white shadow-lg active:scale-95 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">check</span>
                {t('plots.draw.finish')}
              </button>
            </div>
          </div>
        )}

        {closed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-stack-md"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-label-md font-semibold text-on-surface">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                {t('plots.draw.closedHint', { n: vertices.length })}
              </p>
              <button
                type="button"
                onClick={continueDrawing}
                className="text-label-sm font-semibold text-primary-container underline"
              >
                {t('plots.draw.continueDrawing')}
              </button>
            </div>

            {/* Name */}
            <label className="flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-widest text-outline">
                {t('plots.name')}
              </span>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('plots.namePlaceholder')}
                className="rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-3 text-body-md outline-none focus:border-primary-container"
              />
            </label>

            {/* Colour */}
            <div className="flex flex-col gap-1">
              <span className="text-label-sm uppercase tracking-widest text-outline">
                {t('plots.color')}
              </span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-full border-2 ${color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                    style={{ backgroundColor: c, borderColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white shadow-lg active:scale-95 disabled:opacity-50"
            >
              {busy ? t('plots.saving') : t('plots.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
