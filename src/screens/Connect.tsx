import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useCurrentUser, initials } from '@/data/currentUser';
import { CONTACTS } from '@/data/mocks';
import { useTranslation } from '@/i18n';

export default function Connect() {
  const t = useTranslation();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | undefined>();

  const myCode = useMemo(() => (me.id.slice(0, 6) + me.name.replace(/\s+/g, '')).toUpperCase().slice(0, 8), [me]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      setMessage(t('connect.copied'));
    } catch {
      setMessage(t('connect.copyFailed'));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setMessage(t('connect.requestSent', { code: code.trim().toUpperCase() }));
    setCode('');
  };

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
            <span className="font-mono text-headline-lg tracking-widest">{myCode}</span>
            <button
              onClick={copy}
              className="touch-safe flex items-center gap-2 rounded-lg bg-primary-container px-3 text-on-primary active:scale-95"
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
              className="touch-safe rounded-lg bg-safety px-4 font-semibold uppercase tracking-widest text-white active:scale-95"
            >
              {t('connect.send')}
            </button>
          </form>
          {message && (
            <p className="mt-2 rounded bg-tertiary-container px-3 py-2 text-label-md text-on-tertiary-container">
              {message}
            </p>
          )}
        </section>

        {/* Suggested / existing contacts */}
        <section>
          <h2 className="mb-3 text-label-sm uppercase tracking-widest text-outline">{t('connect.suggested')}</h2>
          <ul className="flex flex-col gap-2">
            {CONTACTS.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                    {initials(c.name)}
                  </div>
                  <div>
                    <p className="text-label-md font-semibold">{c.name}</p>
                    <p className="text-label-sm text-outline">
                      {t(`role.${c.role}`)} · {c.forestName ?? '—'}
                    </p>
                  </div>
                </div>
                <button
                  className="touch-safe rounded-lg border border-outline-variant px-3 text-label-sm font-semibold uppercase tracking-wider text-primary hover:bg-surface-container"
                  onClick={() => setMessage(t('connect.requestSent', { code: c.name }))}
                >
                  {t('connect.connect')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
