import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { ConversationRowSkeleton } from '@/components/Skeleton';
import { CONVERSATIONS as MOCK_CONVERSATIONS, contactById as mockContactById } from '@/data/mocks';
import { useCurrentUser, initials } from '@/data/currentUser';
import { useSession } from '@/data/session';
import { messagingRepo } from '@/data/messagingRepo';
import type { Conversation } from '@/data/types';
import { supabase, hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

type Preview = {
  id: string;
  otherId: string;
  otherName: string;
  otherRole?: string;
  lastAt: string;
  lastPreview: string;
  unread: number;
};

export default function Messages() {
  const t = useTranslation();
  const { isDemoMode } = useSession();
  const me = useCurrentUser();
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      setLoading(false);
      setPreviews(
        MOCK_CONVERSATIONS.map((c) => {
          const contact = mockContactById(c.participantId);
          return {
            id: c.id,
            otherId: c.participantId,
            otherName: contact?.name ?? '—',
            otherRole: contact?.role,
            lastAt: c.lastMessageAt,
            lastPreview: c.lastMessagePreview,
            unread: c.unreadCount,
          };
        }),
      );
      return;
    }

    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const convs = await messagingRepo.listConversationsForMe();
      if (cancelled) return;
      const built = await buildPreviews(convs, me.id);
      if (!cancelled) {
        setPreviews(built);
        setLoading(false);
      }
    };
    void load();

    const sub = messagingRepo.subscribeConversations(load);
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [isDemoMode, me.id]);

  const sorted = useMemo(
    () => [...previews].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    [previews],
  );

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
        {loading ? (
          <ul className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <ConversationRowSkeleton />
              </li>
            ))}
          </ul>
        ) : sorted.length === 0 ? (
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
            {sorted.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/messages/${p.id}`}
                  className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary">
                    <span className="font-bold">{initials(p.otherName)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-label-md font-semibold">{p.otherName}</p>
                      <span className="shrink-0 text-label-sm text-outline">{relative(p.lastAt, t)}</span>
                    </div>
                    <p className="truncate text-label-md text-on-surface-variant">{p.lastPreview}</p>
                  </div>
                  {p.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-error px-2 py-0.5 text-[10px] font-bold text-on-error">
                      {p.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

async function buildPreviews(convs: Conversation[], me: string): Promise<Preview[]> {
  if (convs.length === 0 || !hasSupabase || !supabase) return [];
  const otherIds = convs.map((c) => (c.participantA === me ? c.participantB : c.participantA));
  const { data: profiles } = await supabase.from('profiles').select('id, name, role').in('id', otherIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const previews = await Promise.all(
    convs.map(async (c) => {
      const otherId = c.participantA === me ? c.participantB : c.participantA;
      const { data: last } = await supabase!
        .from('messages')
        .select('body, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastRow = last?.[0];
      const preview: Preview = {
        id: c.id,
        otherId,
        otherName: byId.get(otherId)?.name ?? '—',
        otherRole: byId.get(otherId)?.role,
        lastAt: (lastRow?.created_at as string) ?? c.lastMessageAt ?? c.createdAt,
        lastPreview: (lastRow?.body as string) ?? '',
        unread: 0,
      };
      return preview;
    }),
  );
  return previews;
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
