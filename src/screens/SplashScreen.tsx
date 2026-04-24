import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n';

const SPLASH_MS = 1400;

export default function SplashScreen() {
  const navigate = useNavigate();
  const t = useTranslation();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/map', { replace: true }), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      role="status"
      aria-label={t('splash.loading')}
      className="flex h-[100dvh] w-full flex-col items-center justify-center bg-primary text-on-primary"
      onClick={() => navigate('/map', { replace: true })}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary-container shadow-lg">
          <span className="material-symbols-outlined filled text-[56px] text-primary-fixed-dim">forest</span>
        </div>
        <div className="text-center">
          <h1 className="text-headline-lg font-black tracking-tight">Waldblick</h1>
          <p className="mt-1 text-label-md uppercase tracking-widest text-primary-fixed-dim">
            {t('splash.tagline')}
          </p>
        </div>
      </div>
      <div className="absolute bottom-10 flex items-center gap-2 text-label-sm uppercase tracking-widest text-primary-fixed-dim">
        <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary-fixed-dim" />
        {t('splash.loading')}
      </div>
    </div>
  );
}
