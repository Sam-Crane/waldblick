import { LAYERS, type LayerDef } from './layers';
import { useTranslation } from '@/i18n';

type Props = {
  open: boolean;
  onClose: () => void;
  baseLayerId: string;
  onBaseChange: (id: string) => void;
  activeOverlayIds: string[];
  onOverlayToggle: (id: string) => void;
  showPlots: boolean;
  onShowPlotsChange: (v: boolean) => void;
  showObservations: boolean;
  onShowObservationsChange: (v: boolean) => void;
};

export default function LayerPanel({
  open,
  onClose,
  baseLayerId,
  onBaseChange,
  activeOverlayIds,
  onOverlayToggle,
  showPlots,
  onShowPlotsChange,
  showObservations,
  onShowObservationsChange,
}: Props) {
  const t = useTranslation();
  const base = LAYERS.filter((l) => l.kind === 'base');
  const overlays = LAYERS.filter((l) => l.kind === 'overlay');

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        className={`absolute right-0 top-0 h-full w-80 max-w-[90vw] overflow-y-auto bg-surface-container-lowest p-margin-main shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-stack-md flex items-center justify-between">
          <h2 className="text-headline-md font-semibold">{t('mapPanel.title')}</h2>
          <button
            onClick={onClose}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">close</span>
          </button>
        </div>

        <Section title={t('mapPanel.baseLayer')}>
          {base.map((l) => (
            <Radio
              key={l.id}
              label={t(l.titleKey)}
              checked={baseLayerId === l.id}
              onChange={() => onBaseChange(l.id)}
              hint={attrShort(l)}
            />
          ))}
        </Section>

        <Section title={t('mapPanel.appData')}>
          <Check
            label={t('mapPanel.observations')}
            checked={showObservations}
            onChange={() => onShowObservationsChange(!showObservations)}
          />
          <Check label={t('mapPanel.plots')} checked={showPlots} onChange={() => onShowPlotsChange(!showPlots)} />
        </Section>

        <Section title={t('mapPanel.overlays')}>
          {overlays.map((l) => (
            <Check
              key={l.id}
              label={t(l.titleKey)}
              checked={activeOverlayIds.includes(l.id)}
              onChange={() => onOverlayToggle(l.id)}
              hint={attrShort(l) + (l.offlineOnDemand ? ' · ' + t('mapPanel.downloadOnly') : '')}
            />
          ))}
        </Section>

        <p className="mt-stack-lg text-label-sm text-outline">{t('mapPanel.attributionNote')}</p>
      </aside>
    </div>
  );
}

function attrShort(l: LayerDef) {
  return l.attribution.replace(/©\s*/g, '').split('—')[0].trim();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-stack-lg">
      <h3 className="mb-2 text-label-sm uppercase tracking-widest text-outline">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Radio({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex items-start justify-between rounded-lg border px-4 py-3 text-left transition ${
        checked
          ? 'border-primary-container bg-primary-fixed text-primary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
      }`}
    >
      <div className="min-w-0">
        <p className="text-label-md font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-label-sm text-outline">{hint}</p>}
      </div>
      {checked && <span className="material-symbols-outlined text-primary">radio_button_checked</span>}
      {!checked && <span className="material-symbols-outlined text-outline">radio_button_unchecked</span>}
    </button>
  );
}

function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex items-start justify-between rounded-lg border px-4 py-3 text-left transition ${
        checked
          ? 'border-primary-container bg-primary-fixed text-primary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
      }`}
    >
      <div className="min-w-0">
        <p className="text-label-md font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-label-sm text-outline">{hint}</p>}
      </div>
      <span className="material-symbols-outlined">{checked ? 'check_box' : 'check_box_outline_blank'}</span>
    </button>
  );
}
