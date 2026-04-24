import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOTIFICATIONS as MOCK_NOTIFICATIONS } from '@/data/mocks';
import { notificationsRepo } from '@/data/notificationsRepo';
import { useSession } from '@/data/session';
import type { AppNotification, NotificationKind } from '@/data/types';
import { useTranslation } from '@/i18n';

const ICON_FOR: Record<NotificationKind, string> = {
  critical_observation: 'report_problem',
  task_assigned: 'assignment_ind',
  message: 'chat',
  connection_request: 'person_add',
  sync_issue: 'cloud_off',
};

const ACCENT_FOR: Record<NotificationKind, string> = {
  critical_observation: 'text-error',
  task_assigned: 'text-primary-container',
  message: 'text-primary-container',
  connection_request: 'text-tertiary',
  sync_issue: 'text-secondary',
};

export default function NotificationBell({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const { isDemoMode } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Load notifications (live from Supabase, or fall back to the demo set).
  useEffect(() => {
    if (isDemoMode) {
      setItems(MOCK_NOTIFICATIONS);
      return;
    }
    let cancelled = false;
    const load = () => {
      notificationsRepo.list().then((list) => {
        if (!cancelled) setItems(list);
      });
    };
    load();
    const sub = notificationsRepo.subscribe(load);
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [isDemoMode]);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const tap = async (n: AppNotification) => {
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setOpen(false);
    if (!isDemoMode) void notificationsRepo.markRead([n.id]);
    if (n.targetPath) navigate(n.targetPath);
  };

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    if (!isDemoMode) void notificationsRepo.markAllRead();
  };

  const color = variant === 'dark' ? 'text-on-primary' : 'text-primary-container';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`touch-safe relative flex items-center justify-center rounded-full hover:bg-white/10 ${color}`}
        aria-label={t('notifications.open')}
        aria-expanded={open}
      >
        <span className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span className="absolute -right-0 -top-0 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-surface-container-lowest bg-error px-1 text-[10px] font-bold text-on-error">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-80 origin-top-right overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3">
            <h3 className="text-label-md font-semibold">{t('notifications.title')}</h3>
            {unread > 0 && (
              <button onClick={markAll} className="text-label-sm font-semibold text-primary-container">
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-center text-label-md text-on-surface-variant">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => tap(n)}
                    className={`flex w-full items-start gap-3 border-b border-outline-variant px-4 py-3 text-left hover:bg-surface-container ${
                      !n.read ? 'bg-primary-fixed/40' : ''
                    }`}
                  >
                    <span className={`material-symbols-outlined shrink-0 ${ACCENT_FOR[n.kind]}`}>
                      {ICON_FOR[n.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label-md font-semibold">{n.title}</p>
                      <p className="line-clamp-2 text-label-md text-on-surface-variant">{n.body}</p>
                      <span className="text-[10px] uppercase text-outline">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                    {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-error" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
