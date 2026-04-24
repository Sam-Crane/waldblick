import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { CONVERSATIONS, MESSAGES_BY_CONVERSATION, contactById } from '@/data/mocks';
import { useCurrentUser, initials } from '@/data/currentUser';
import type { ChatMessage } from '@/data/types';
import { useTranslation } from '@/i18n';

export default function Conversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useTranslation();
  const me = useCurrentUser();
  const conv = CONVERSATIONS.find((c) => c.id === id);
  const contact = conv ? contactById(conv.participantId) : undefined;

  const seed = id ? MESSAGES_BY_CONVERSATION[id] ?? [] : [];
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = () => {
    if (!draft.trim() || !id) return;
    setMessages((m) => [
      ...m,
      {
        id: `m-${Date.now()}`,
        conversationId: id,
        authorId: me.id,
        body: draft.trim(),
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft('');
  };

  if (!conv || !contact) {
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
        title={contact.name}
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
        {messages.map((m) => {
          const mine = m.authorId === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {!mine && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary text-[10px] font-bold">
                  {initials(contact.name)}
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-body-md ${
                  mine
                    ? 'rounded-br-sm bg-primary text-on-primary'
                    : 'rounded-bl-sm bg-surface-container-lowest text-on-surface'
                }`}
              >
                {m.body}
                <div
                  className={`mt-1 text-[10px] uppercase tracking-widest ${
                    mine ? 'text-primary-fixed-dim' : 'text-outline'
                  }`}
                >
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          send();
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
