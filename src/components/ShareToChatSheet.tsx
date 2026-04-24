import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectionsRepo } from '@/data/connectionsRepo';
import { messagingRepo } from '@/data/messagingRepo';
import { CONTACTS } from '@/data/mocks';
import { initials } from '@/data/currentUser';
import { useSession } from '@/data/session';
import { useTranslation } from '@/i18n';

type Row = { id: string; name: string; role: string };

export default function ShareToChatSheet({
  open,
  observationId,
  defaultBody,
  onClose,
}: {
  open: boolean;
  observationId: string;
  defaultBody?: string;
  onClose: () => void;
}) {
  const t = useTranslation();
  const navigate = useNavigate();
  const { isDemoMode } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState(defaultBody ?? '');

  useEffect(() => {
    if (!open) return;
    if (isDemoMode) {
      setRows(CONTACTS.map((c) => ({ id: c.id, name: c.name, role: c.role })));
      return;
    }
    void connectionsRepo.listWithProfiles().then((list) => {
      setRows(
        list
          .filter((c) => c.status === 'accepted')
          .map((c) => ({ id: c.other.id, name: c.other.name ?? '—', role: c.other.role })),
      );
    });
  }, [open, isDemoMode]);

  if (!open) return null;

  const pick = async (otherId: string) => {
    setBusy(true);
    const conv = await messagingRepo.ensureConversation(otherId);
    if (conv) {
      const text = body.trim() || t('messages.observationAttached');
      await messagingRepo.send(conv.id, text, observationId);
      onClose();
      navigate(`/messages/${conv.id}`);
    }
    setBusy(false);
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
        <h2 className="mb-stack-md text-headline-md font-semibold">{t('share.title')}</h2>

        <label className="mb-stack-md block">
          <span className="mb-1 block text-label-sm uppercase tracking-widest text-outline">
            {t('share.message')}
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('share.placeholder')}
            className="min-h-[60px] w-full rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-3 text-body-md outline-none focus:border-primary-container"
          />
        </label>

        {rows.length === 0 ? (
          <p className="rounded border border-dashed border-outline-variant p-4 text-center text-on-surface-variant">
            {t('share.noContacts')}
          </p>
        ) : (
          <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  disabled={busy}
                  onClick={() => pick(r.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-left hover:bg-surface-container disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold">
                    {initials(r.name)}
                  </div>
                  <div>
                    <p className="text-label-md font-semibold">{r.name}</p>
                    <p className="text-label-sm text-outline">{t(`role.${r.role}`)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
