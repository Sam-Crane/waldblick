import { useState } from 'react';
import { initials } from '@/data/currentUser';
import { CONTACTS } from '@/data/mocks';
import { taskRepo } from '@/data/taskRepo';
import { useTranslation } from '@/i18n';

type Props = {
  open: boolean;
  observationId: string;
  onClose: () => void;
  onAssigned?: (assigneeId: string) => void;
};

// Bottom sheet: pick a contact, optionally a due date, assign.
// For v1 the contacts list comes from mocks — the Supabase memberships
// fetch lands once the user provisions the DB.
export default function AssignSheet({ open, observationId, onClose, onAssigned }: Props) {
  const t = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    await taskRepo.assign(observationId, selected, due || undefined);
    setBusy(false);
    onAssigned?.(selected);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-surface-container-lowest p-margin-main shadow-xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
        <h2 className="mb-stack-md text-headline-md font-semibold">{t('assign.title')}</h2>

        <ul className="mb-stack-md flex flex-col gap-2">
          {CONTACTS.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelected(c.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                  selected === c.id
                    ? 'border-primary-container bg-primary-fixed'
                    : 'border-outline-variant bg-surface-container-lowest'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-label-md font-semibold">{c.name}</p>
                  <p className="text-label-sm text-outline">
                    {t(`role.${c.role}`)} · {c.forestName ?? '—'}
                  </p>
                </div>
                {selected === c.id && <span className="material-symbols-outlined text-primary">check</span>}
              </button>
            </li>
          ))}
        </ul>

        <label className="mb-stack-md block">
          <span className="mb-1 block text-label-sm uppercase tracking-widest text-outline">
            {t('assign.dueAt')}
          </span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-3 text-body-md outline-none focus:border-primary-container"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="touch-safe flex-1 rounded-lg border border-outline-variant text-label-md font-semibold uppercase tracking-widest text-on-surface-variant"
          >
            {t('common.back')}
          </button>
          <button
            onClick={submit}
            disabled={!selected || busy}
            className="touch-safe flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-on-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined">assignment_ind</span>
            <span className="font-semibold uppercase tracking-widest">
              {busy ? t('assign.busy') : t('assign.button')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
