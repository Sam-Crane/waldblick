import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useSession } from '@/data/session';
import { useCurrentUser, initials } from '@/data/currentUser';
import { connectionsRepo } from '@/data/connectionsRepo';
import { messagingRepo } from '@/data/messagingRepo';
import { useToast } from '@/components/Toast';
import { useTranslation } from '@/i18n';

// Create a group chat. Pick a name and tick the contacts to include.
// Only accepted connections show up (same pool the 1:1 flow uses).
// Creator is auto-joined server-side.

type Candidate = { id: string; name: string; role: string };

export default function NewGroupChat() {
  const t = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { isDemoMode } = useSession();
  const me = useCurrentUser();

  const [name, setName] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemoMode) return;
    void connectionsRepo.listWithProfiles().then((list) => {
      setCandidates(
        list
          .filter((c) => c.status === 'accepted')
          .map((c) => ({
            id: c.other.id,
            name: c.other.name ?? '—',
            role: c.other.role,
          })),
      );
    });
  }, [isDemoMode]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (isDemoMode) {
      toast.error(t('group.demoDisabled'));
      return;
    }
    if (!name.trim() || selected.size === 0) return;
    setBusy(true);
    const conv = await messagingRepo.createGroup(name, [...selected]);
    setBusy(false);
    if (conv) {
      toast.success(t('group.created', { name }));
      navigate(`/messages/${conv.id}`, { replace: true });
    } else {
      toast.error(t('group.createFailed'));
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('group.newTitle')}
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
        <label className="flex flex-col gap-stack-sm">
          <span className="flex items-center gap-2 text-label-md text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">edit</span>
            {t('group.name')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('group.namePlaceholder')}
            className="rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-4 text-body-md outline-none focus:border-primary-container"
          />
        </label>

        <section>
          <h2 className="mb-3 text-label-sm uppercase tracking-widest text-outline">
            {t('group.members', { n: selected.size })}
          </h2>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-label-md text-on-surface-variant">
              {t('group.noContacts')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => {
                const on = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => toggle(c.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                        on
                          ? 'border-primary-container bg-primary-fixed text-primary'
                          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-label-md font-semibold">{c.name}</p>
                        <p className="text-label-sm text-outline">{t(`role.${c.role}`)}</p>
                      </div>
                      <span className="material-symbols-outlined">
                        {on ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-label-sm text-outline">{t('group.creatorNote', { name: me.name })}</p>

        <button
          onClick={create}
          disabled={busy || !name.trim() || selected.size === 0}
          className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white active:scale-95 disabled:opacity-50"
        >
          {busy ? t('group.creating') : t('group.create')}
        </button>
      </div>
    </div>
  );
}
