import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useTranslation } from '@/i18n';
import { initials, useCurrentUser } from '@/data/currentUser';

export default function Profile() {
  const user = useCurrentUser();
  const t = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('profile.title')}
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

      <div className="relative flex flex-col items-center bg-primary px-margin-main pb-stack-lg pt-10 text-on-primary">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-primary-fixed-dim bg-primary-container text-2xl font-black">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{initials(user.name)}</span>
          )}
        </div>
        <h2 className="mt-4 text-headline-md font-bold">{user.name}</h2>
        <p className="text-label-md text-primary-fixed-dim">{t(`role.${user.role}`)}</p>
      </div>

      <div className="-mt-6 flex flex-col gap-3 px-margin-main">
        <Row label={t('profile.email')} value={user.email} icon="mail" />
        <Row label={t('profile.forest')} value={user.forestName} icon="forest" />
        <Row label={t('profile.role')} value={t(`role.${user.role}`)} icon="badge" />
      </div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-container text-primary-container">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div>
          <p className="text-label-sm uppercase text-outline">{label}</p>
          <p className="text-body-md font-medium text-on-surface">{value}</p>
        </div>
      </div>
    </div>
  );
}
