import { Link } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { CONVERSATIONS, contactById } from '@/data/mocks';
import { initials } from '@/data/currentUser';
import { useTranslation } from '@/i18n';

export default function Messages() {
  const t = useTranslation();
  const sorted = [...CONVERSATIONS].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  return (
    <div className="flex h-full flex-col pb-28">
      <TopBar
        title={t('messages.title')}
        trailing={
          <Link
            to="/connect"
            className="touch-safe flex items-center gap-1 rounded-lg bg-primary-container px-3 text-on-primary active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span className="hidden text-label-sm font-semibold uppercase tracking-wider sm:inline">
              {t('messages.connect')}
            </span>
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-2xl px-margin-main py-stack-lg">
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined mb-2 text-4xl">chat</span>
            <p>{t('messages.empty')}</p>
            <Link
              to="/connect"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-on-primary"
            >
              <span className="material-symbols-outlined">person_add</span>
              {t('messages.connect')}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((c) => {
              const contact = contactById(c.participantId);
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                  >
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary">
                      <span className="font-bold">{initials(contact?.name ?? '?')}</span>
                      {contact?.online && (
                        <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-surface-container-lowest bg-tertiary-fixed-dim" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="truncate text-label-md font-semibold">{contact?.name ?? '—'}</p>
                        <span className="shrink-0 text-label-sm text-outline">{relative(c.lastMessageAt, t)}</span>
                      </div>
                      <p className="truncate text-label-md text-on-surface-variant">{c.lastMessagePreview}</p>
                    </div>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-error px-2 py-0.5 text-[10px] font-bold text-on-error">
                        {c.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function relative(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('time.now');
  if (m < 60) return t('time.m', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.h', { n: h });
  return t('time.d', { n: Math.floor(h / 24) });
}
