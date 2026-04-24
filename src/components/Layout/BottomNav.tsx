import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n';

// 5-slot nav. Record lives in the center, raised above the bar as a FAB.
const left = [
  { to: '/map', icon: 'map', labelKey: 'nav.map' },
  { to: '/tasks', icon: 'assignment', labelKey: 'nav.tasks' },
] as const;

const right = [
  { to: '/messages', icon: 'chat', labelKey: 'nav.messages' },
  { to: '/dashboard', icon: 'space_dashboard', labelKey: 'nav.dashboard' },
] as const;

export default function BottomNav() {
  const t = useTranslation();
  return (
    <nav className="relative flex h-20 w-full items-end justify-between border-t border-outline-variant bg-surface-container-lowest px-4 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <div className="flex flex-1 justify-around">
        {left.map((item) => (
          <NavItem key={item.to} {...item} label={t(item.labelKey)} />
        ))}
      </div>

      {/* Centered raised Record FAB */}
      <NavLink
        to="/record"
        className={({ isActive }) =>
          `absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-surface-container-lowest shadow-xl transition active:scale-95 ${
            isActive ? 'bg-tertiary-fixed-dim text-on-tertiary-fixed' : 'bg-safety text-white'
          }`
        }
        aria-label={t('nav.record')}
      >
        <span className="material-symbols-outlined filled text-[28px]">add_a_photo</span>
        <span className="sr-only">{t('nav.record')}</span>
      </NavLink>

      <div className="flex flex-1 justify-around">
        {right.map((item) => (
          <NavItem key={item.to} {...item} label={t(item.labelKey)} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `touch-safe flex w-16 flex-col items-center justify-center rounded-md py-1 transition-transform active:scale-95 ${
          isActive ? 'bg-primary-fixed text-primary' : 'text-outline hover:text-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`material-symbols-outlined ${isActive ? 'filled' : ''}`}>{icon}</span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </>
      )}
    </NavLink>
  );
}
