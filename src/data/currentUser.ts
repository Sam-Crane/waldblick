import { useSession } from './session';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'forester' | 'contractor' | 'operator';
  forestName: string;
  avatarUrl?: string;
};

const FALLBACK: CurrentUser = {
  id: 'demo-user',
  name: 'Lukas Unterreiner',
  email: 'lukas@unterreiner.de',
  role: 'forester',
  forestName: 'Revier Eichberg',
};

// Thin hook for screens — always returns a user. When unauthenticated in a
// real Supabase setup, AuthGuard redirects before this is called.
export function useCurrentUser(): CurrentUser {
  const { user } = useSession();
  return user ?? FALLBACK;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}
