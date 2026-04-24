import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useCurrentUser, initials } from '@/data/currentUser';
import { useSession } from '@/data/session';
import { connectionsRepo } from '@/data/connectionsRepo';
import { messagingRepo } from '@/data/messagingRepo';
import type { Connection } from '@/data/types';
import { useTranslation } from '@/i18n';

type ConnWithOther = Connection & { other: { id: string; name: string | null; role: string } };

export default function Connect() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { isDemoMode } = useSession();
  const me = useCurrentUser();

  const [myCode, setMyCode] = useState<string>('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<ConnWithOther[]>([]);

  useEffect(() => {
    if (isDemoMode) {
      setMyCode((me.id.slice(0, 6) + me.name.replace(/\s+/g, '')).toUpperCase().slice(0, 8));
      return;
    }
    void connectionsRepo.myInviteCode().then((c) => c && setMyCode(c));
    void connectionsRepo.listWithProfiles().then(setList);
  }, [isDemoMode, me.id, me.name]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      setMessage({ tone: 'ok', text: t('connect.copied') });
    } catch {
      setMessage({ tone: 'error', text: t('connect.copyFailed') });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage(undefined);

    if (isDemoMode) {
      setMessage({ tone: 'ok', text: t('connect.requestSent', { code: code.trim().toUpperCase() }) });
      setCode('');
      setBusy(false);
      return;
    }

    const result = await connectionsRepo.sendRequest(code);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: t(`connect.err.${result.error}`) });
      return;
    }
    setMessage({ tone: 'ok', text: t('connect.requestSent', { code: result.contact.name ?? code }) });
    setCode('');
    void connectionsRepo.listWithProfiles().then(setList);
  };

  const accept = async (c: ConnWithOther) => {
    await connectionsRepo.accept(c.id);
    // Open a conversation straight away so they can say hello.
    const conv = await messagingRepo.ensureConversation(c.other.id);
    if (conv) navigate(`/messages/${conv.id}`);
  };

  const openChatWith = async (otherId: string) => {
    const conv = await messagingRepo.ensureConversation(otherId);
    if (conv) navigate(`/messages/${conv.id}`);
  };

  const pending = list.filter((c) => c.status === 'pending' && c.addresseeId === me.id);
  const accepted = list.filter((c) => c.status === 'accepted');
  const outgoing = list.filter((c) => c.status === 'pending' && c.requesterId === me.id);

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('connect.title')}
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

      <div className="mx-auto w-full max-w-md space-y-stack-lg px-margin-main py-stack-lg">
        {/* Your code */}
        <section className="rounded-xl bg-primary p-margin-main text-on-primary">
          <h2 className="text-label-sm uppercase tracking-widest text-primary-fixed-dim">
            {t('connect.yourCode')}
          </h2>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-headline-lg tracking-widest">{myCode || '—'}</span>
            <button
              onClick={copy}
              disabled={!myCode}
              className="touch-safe flex items-center gap-2 rounded-lg bg-primary-container px-3 text-on-primary active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined">content_copy</span>
              <span className="text-label-sm font-semibold uppercase tracking-wider">{t('connect.copy')}</span>
            </button>
          </div>
          <p className="mt-2 text-body-md text-primary-fixed-dim">{t('connect.shareHint')}</p>
        </section>

        {/* Enter code */}
        <section>
          <h2 className="mb-3 text-label-sm uppercase tracking-widest text-outline">{t('connect.enterCode')}</h2>
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC12345"
              className="flex-1 rounded-md border-b-2 border-outline-variant bg-surface-container-lowest px-4 py-3 font-mono text-body-md uppercase tracking-widest outline-none focus:border-primary-container"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="touch-safe rounded-lg bg-safety px-4 font-semibold uppercase tracking-widest text-white active:scale-95 disabled:opacity-50"
            >
              {busy ? '…' : t('connect.send')}
            </button>
          </form>
          {message && (
            <p
              className={`mt-2 rounded px-3 py-2 text-label-md ${
                message.tone === 'ok'
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              {message.text}
            </p>
          )}
        </section>

        {/* Incoming pending requests — explicit accept */}
        {pending.length > 0 && (
          <section>
            <h2 className="mb-3 text-label-sm uppercase tracking-widest text-outline">{t('connect.pending')}</h2>
            <ul className="flex flex-col gap-2">
              {pending.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container text-label-sm font-bold">
                      {initials(c.other.name ?? '?')}
                    </div>
                    <div>
                      <p className="text-label-md font-semibold">{c.other.name ?? '—'}</p>
                      <p className="text-label-sm text-outline">{t(`role.${c.other.role}`)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => accept(c)}
                    className="touch-safe rounded-lg bg-primary px-3 text-label-sm font-semibold uppercase tracking-widest text-on-primary active:scale-95"
                  >
                    {t('connect.accept')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Accepted contacts — open chat */}
        {accepted.length > 0 && (
          <section>
            <h2 className="mb-3 text-label-sm uppercase tracking-widest text-outline">{t('connect.contacts')}</h2>
            <ul className="flex flex-col gap-2">
              {accepted.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                      {initials(c.other.name ?? '?')}
                    </div>
                    <div>
                      <p className="text-label-md font-semibold">{c.other.name ?? '—'}</p>
                      <p className="text-label-sm text-outline">{t(`role.${c.other.role}`)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openChatWith(c.other.id)}
                    className="touch-safe rounded-lg border border-outline-variant px-3 text-label-sm font-semibold uppercase tracking-wider text-primary hover:bg-surface-container"
                  >
                    {t('connect.chat')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {outgoing.length > 0 && (
          <p className="text-center text-label-sm text-outline">
            {t('connect.outgoingPending', { n: outgoing.length })}
          </p>
        )}
      </div>
    </div>
  );
}
