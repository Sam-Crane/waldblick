import { useEffect, useState } from 'react';
import { syncNow, useSyncState } from '@/data/syncEngine';
import { hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

// Small pill in the top bar. Shows pending count + online status.
// Tapping triggers a manual sync drain.
export default function SyncStatus({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const t = useTranslation();
  const state = useSyncState();
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!hasSupabase) return null;

  const color = variant === 'dark' ? 'text-on-primary' : 'text-primary-container';

  let icon = 'cloud_done';
  let label = t('sync.synced');
  let tone = 'text-tertiary-fixed-dim';

  if (!online) {
    icon = 'cloud_off';
    label = t('sync.offline', { n: state.pending });
    tone = 'text-error';
  } else if (state.status === 'running') {
    icon = 'sync';
    label = t('sync.running');
    tone = 'text-primary-container';
  } else if (state.status === 'error') {
    icon = 'sync_problem';
    label = t('sync.error');
    tone = 'text-error';
  } else if (state.pending > 0) {
    icon = 'cloud_upload';
    label = t('sync.pending', { n: state.pending });
    tone = 'text-secondary';
  }

  return (
    <button
      onClick={() => void syncNow()}
      className={`touch-safe flex items-center gap-1 rounded-full px-2 hover:bg-white/10 ${color}`}
      title={state.lastError ?? label}
      aria-label={label}
    >
      <span className={`material-symbols-outlined ${state.status === 'running' ? 'animate-spin' : ''} ${tone}`}>
        {icon}
      </span>
      {state.pending > 0 && (
        <span className="text-[10px] font-bold">{state.pending}</span>
      )}
    </button>
  );
}
