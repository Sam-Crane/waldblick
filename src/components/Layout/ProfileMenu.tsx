import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { initials, useCurrentUser } from '@/data/currentUser';
import { signOut } from '@/data/session';
import { useTranslation } from '@/i18n';

type Variant = 'light' | 'dark';

export default function ProfileMenu({ variant = 'light' }: { variant?: Variant }) {
  const user = useCurrentUser();
  const t = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const borderClass = variant === 'dark' ? 'border-primary-fixed-dim' : 'border-primary-container';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-container text-primary-container ${borderClass}`}
        aria-label={t('profile.menu')}
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-label-md font-bold">{initials(user.name)}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 origin-top-right overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface shadow-xl"
        >
          <div className="flex items-center gap-3 bg-surface-container-low p-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary-container text-on-primary">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-label-md font-bold">{initials(user.name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-label-md font-semibold">{user.name}</p>
              <p className="truncate text-label-sm text-outline">{t(`role.${user.role}`)}</p>
              <p className="truncate text-label-sm text-outline">{user.forestName}</p>
            </div>
          </div>
          <MenuItem to="/profile" icon="person" label={t('profile.viewProfile')} onClick={() => setOpen(false)} />
          <MenuItem to="/connect" icon="person_add" label={t('profile.connect')} onClick={() => setOpen(false)} />
          <MenuItem to="/settings" icon="settings" label={t('profile.settings')} onClick={() => setOpen(false)} />
          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/signin', { replace: true });
            }}
            className="flex w-full items-center gap-3 border-t border-outline-variant px-4 py-3 text-error hover:bg-error-container/40"
            role="menuitem"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-label-md">{t('profile.logout')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  to,
  icon,
  label,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container"
    >
      <span className="material-symbols-outlined text-primary-container">{icon}</span>
      <span className="text-label-md">{label}</span>
    </Link>
  );
}
