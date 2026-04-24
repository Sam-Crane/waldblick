import type { ReactNode } from 'react';
import NotificationBell from './NotificationBell';
import ProfileMenu from './ProfileMenu';
import SyncStatus from '@/components/SyncStatus';

type Variant = 'light' | 'dark';

type Props = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: Variant;
  showProfile?: boolean;
  showNotifications?: boolean;
};

export default function TopBar({
  title,
  leading,
  trailing,
  variant = 'light',
  showProfile = true,
  showNotifications = true,
}: Props) {
  const dark = variant === 'dark';
  return (
    <header
      className={`sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b px-5 ${
        dark
          ? 'border-white/10 bg-primary text-on-primary'
          : 'border-outline-variant bg-surface-container-lowest text-primary-container'
      }`}
    >
      <div className="flex items-center gap-3">
        {leading}
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        {trailing}
        <SyncStatus variant={variant} />
        {showNotifications && <NotificationBell variant={variant} />}
        {showProfile && <ProfileMenu variant={variant} />}
      </div>
    </header>
  );
}
