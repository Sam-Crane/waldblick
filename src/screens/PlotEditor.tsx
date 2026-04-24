import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { plotsRepo, parseBoundary } from '@/data/plotsRepo';
import { useToast } from '@/components/Toast';
import { useTranslation } from '@/i18n';

// Palette aligned with DESIGN.md. Users pick one for the plot outline.
const COLORS = ['#173124', '#765840', '#4f1c00', '#2d4739', '#ba1a1a', '#FF6B00'];

export default function PlotEditor() {
  const t = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [geojson, setGeojson] = useState('');
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(undefined);
    let boundary;
    try {
      boundary = parseBoundary(geojson);
    } catch (err) {
      setParseError(t(`plots.parseErr.${(err as Error).message}`));
      return;
    }

    setBusy(true);
    const result = await plotsRepo.create({ name: name.trim(), color, boundary });
    setBusy(false);
    if (!result.ok) {
      toast.error(t(`plots.createErr.${result.error}`));
      return;
    }
    toast.success(t('plots.created', { name: result.plot.name }));
    // Jump straight to the map with a hint to fit on the new plot so the
    // user actually sees what they drew, instead of having to pan around.
    navigate('/map', { replace: true, state: { focusPlotId: result.plot.id } });
  };

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
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

      <form onSubmit={submit} className="mx-auto w-full max-w-2xl space-y-stack-lg px-margin-main py-stack-lg">
        {/* Name */}
        <label className="flex flex-col gap-stack-sm">
          <span className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">label</span>
            {t('plots.name')}
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('plots.namePlaceholder')}
            className="rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-4 text-body-md outline-none focus:border-primary-container"
          />
        </label>

        {/* Color */}
        <div className="flex flex-col gap-stack-sm">
          <span className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">palette</span>
            {t('plots.color')}
          </span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-10 w-10 rounded-full border-2 ${color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                style={{ backgroundColor: c, borderColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* GeoJSON boundary */}
        <div className="flex flex-col gap-stack-sm">
          <div className="flex items-end justify-between gap-3">
            <span className="flex items-center gap-2 text-label-md text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">crop_square</span>
              {t('plots.boundary')}
            </span>
            <a
              href="https://geojson.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-label-sm font-semibold text-primary-container underline"
            >
              {t('plots.drawAtGeojsonIo')}
            </a>
          </div>
          <textarea
            required
            value={geojson}
            onChange={(e) => setGeojson(e.target.value)}
            placeholder='{"type":"Polygon","coordinates":[[[11.56,48.145],[11.585,48.145],[11.585,48.13],[11.56,48.13],[11.56,48.145]]]}'
            rows={8}
            className="rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-4 font-mono text-[13px] outline-none focus:border-primary-container"
          />
          <p className="text-label-sm text-outline">{t('plots.boundaryHint')}</p>
          {parseError && (
            <p className="flex items-center gap-2 rounded bg-error-container px-3 py-2 text-label-md text-on-error-container">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {parseError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !geojson.trim()}
          className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white shadow-lg active:scale-95 disabled:opacity-50"
        >
          {busy ? t('plots.saving') : t('plots.save')}
        </button>
      </form>
    </div>
  );
}
