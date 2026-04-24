import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import TopBar from '@/components/Layout/TopBar';
import { setLang, useTranslation } from '@/i18n';
import { db } from '@/data/db';
import { fullResync } from '@/data/realtimeSync';
import { useToast } from '@/components/Toast';

export default function Settings() {
  const t = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [lang, setLocalLang] = useState<'de' | 'en'>(
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en',
  );
  const [busy, setBusy] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const changeLang = (next: 'de' | 'en') => {
    setLocalLang(next);
    setLang(next);
    // Re-render: navigate to same path.
    navigate(0);
  };

  const resync = async () => {
    setResyncing(true);
    const result = await fullResync();
    setResyncing(false);
    if (result) {
      toast.success(t('settings.resyncDone', { removed: result.removed, kept: result.kept }));
    } else {
      toast.error(t('settings.resyncFailed'));
    }
  };

  const clearLocal = async () => {
    if (!confirm(t('settings.clearConfirm'))) return;
    setBusy(true);
    await db.transaction('rw', db.observations, db.photos, db.syncOps, async () => {
      await db.observations.clear();
      await db.photos.clear();
      await db.syncOps.clear();
    });
    setBusy(false);
  };

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('settings.title')}
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

      <div className="flex flex-col gap-stack-lg px-margin-main py-stack-lg">
        <Section title={t('settings.language')}>
          <div className="grid grid-cols-2 gap-3">
            {(['de', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => changeLang(l)}
                className={`touch-safe rounded-lg border-2 p-3 text-label-md font-semibold transition ${
                  lang === l
                    ? 'border-primary-container bg-primary-container text-on-primary'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                }`}
              >
                {t(`settings.lang.${l}`)}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('settings.offline')}>
          <button
            disabled={resyncing}
            onClick={resync}
            className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary-container text-primary-container active:scale-95 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined ${resyncing ? 'animate-spin' : ''}`}>sync</span>
            <span className="text-label-md font-semibold uppercase tracking-widest">
              {resyncing ? t('settings.resyncing') : t('settings.resyncNow')}
            </span>
          </button>
          <p className="mt-1 text-label-sm text-outline">{t('settings.resyncHint')}</p>
          <button
            disabled={busy}
            onClick={clearLocal}
            className="touch-safe mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-error text-error active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">delete_sweep</span>
            <span className="text-label-md font-semibold uppercase tracking-widest">
              {t('settings.clearLocal')}
            </span>
          </button>
        </Section>

        <Section title={t('settings.about')}>
          <Row icon="info" label={t('settings.version')} value="0.0.1" />
          <Row icon="description" label={t('settings.license')} value="Proprietary" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-label-sm uppercase tracking-widest text-outline">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-primary-container">{icon}</span>
        <span className="text-body-md text-on-surface">{label}</span>
      </div>
      <span className="text-label-sm text-outline">{value}</span>
    </div>
  );
}
