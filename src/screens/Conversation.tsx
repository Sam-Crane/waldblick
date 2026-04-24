import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { MESSAGES_BY_CONVERSATION, CONVERSATIONS as MOCK_CONVERSATIONS, contactById as mockContactById } from '@/data/mocks';
import { useCurrentUser, initials } from '@/data/currentUser';
import { useSession } from '@/data/session';
import { messagingRepo } from '@/data/messagingRepo';
import { supabase, hasSupabase } from '@/data/supabase';
import type { ChatMessage } from '@/data/types';
import { useTranslation } from '@/i18n';

type OtherProfile = { id: string; name: string | null };

export default function Conversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useTranslation();
  const { isDemoMode } = useSession();
  const me = useCurrentUser();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<OtherProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  // Demo mode: seed from mocks; no network.
  useEffect(() => {
    if (!id) return;
    if (isDemoMode) {
      const conv = MOCK_CONVERSATIONS.find((c) => c.id === id);
      const contact = conv ? mockContactById(conv.participantId) : undefined;
      setOther(contact ? { id: contact.id, name: contact.name } : null);
      setMessages(MESSAGES_BY_CONVERSATION[id] ?? []);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      if (hasSupabase && supabase) {
        const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).single();
        if (conv) {
          const otherId = conv.participant_a === me.id ? conv.participant_b : conv.participant_a;
          const { data: prof } = await supabase.from('profiles').select('id, name').eq('id', otherId).single();
          if (!cancelled) setOther(prof ?? { id: otherId, name: null });
        }
      }
      const list = await messagingRepo.listMessages(id);
      if (!cancelled) {
        setMessages(list);
        setLoading(false);
      }
    };
    void load();

    const sub = messagingRepo.subscribeMessages(id, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [id, isDemoMode, me.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const otherName = useMemo(() => other?.name ?? t('messages.title'), [other, t]);

  const send = async () => {
    if (!draft.trim() || !id) return;
    const body = draft.trim();
    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, conversationId: id, authorId: me.id, body, createdAt: new Date().toISOString(), pending: true },
    ]);
    setDraft('');

    if (isDemoMode) {
      // Demo mode: keep the optimistic message, drop the pending flag.
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, pending: false } : m)));
      return;
    }

    const saved = await messagingRepo.send(id, body);
    if (saved) {
      setMessages((prev) => {
        // Remove optimistic + add real (or merge). Realtime may also deliver it; dedupe above.
        const withoutOpt = prev.filter((m) => m.id !== optimisticId);
        if (withoutOpt.some((m) => m.id === saved.id)) return withoutOpt;
        return [...withoutOpt, saved];
      });
    } else {
      // Mark optimistic as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, pending: false, body: `${m.body} ⚠` } : m)),
      );
    }
  };

  if (!id) {
    return (
      <div className="flex h-full flex-col">
        <TopBar title={t('messages.title')} />
        <p className="p-margin-main text-on-surface-variant">{t('messages.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={otherName}
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
      <div className="flex flex-1 flex-col gap-stack-md overflow-y-auto bg-surface-container px-margin-main py-stack-lg">
        {loading && (
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            {t('messages.loading')}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-on-surface-variant">{t('messages.startConversation')}</div>
        )}
        {messages.map((m) => {
          const mine = m.authorId === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!mine && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary text-[10px] font-bold">
                  {initials(other?.name ?? '?')}
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-body-md ${
                  mine
                    ? 'rounded-br-sm bg-primary text-on-primary'
                    : 'rounded-bl-sm bg-surface-container-lowest text-on-surface'
                } ${m.pending ? 'opacity-60' : ''}`}
              >
                {m.observationId && (
                  <Link
                    to={`/observations/${m.observationId}`}
                    className="mb-1 flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-[11px] uppercase tracking-widest"
                  >
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    {t('messages.observationAttached')}
                  </Link>
                )}
                {m.body}
                <div
                  className={`mt-1 text-[10px] uppercase tracking-widest ${
                    mine ? 'text-primary-fixed-dim' : 'text-outline'
                  }`}
                >
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {m.pending && ` · ${t('messages.sending')}`}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-lowest p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('messages.placeholder')}
          className="flex-1 rounded-full border border-outline-variant bg-background px-4 py-3 text-body-md outline-none focus:border-primary-container"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="touch-safe flex items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-50"
          aria-label={t('messages.send')}
        >
          <span className="material-symbols-outlined">send</span>
        </button>
      </form>
    </div>
  );
}
