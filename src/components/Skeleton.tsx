// Shimmer block used as a loading placeholder while a list/detail screen
// fetches its data. Matches the header-strip card style from DESIGN.md.

type Props = {
  className?: string;
  rounded?: 'sm' | 'DEFAULT' | 'md' | 'lg' | 'xl' | 'full';
};

export default function Skeleton({ className = '', rounded = 'DEFAULT' }: Props) {
  const radius =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'xl'
        ? 'rounded-xl'
        : rounded === 'lg'
          ? 'rounded-lg'
          : rounded === 'md'
            ? 'rounded-md'
            : rounded === 'sm'
              ? 'rounded-sm'
              : 'rounded';
  return (
    <div
      className={`relative overflow-hidden bg-surface-container-high ${radius} ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 animate-pulse bg-surface-container-high" />
    </div>
  );
}

// Pre-built skeleton for the header-strip observation card used on TaskList
// and the Dashboard recent list.
export function ObservationCardSkeleton() {
  return (
    <div className="relative flex min-h-[120px] items-stretch overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-outline-variant" />
      <div className="flex flex-grow flex-col justify-between p-4 pl-5 gap-3">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-5 w-20" rounded="full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

export function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
      <Skeleton className="h-12 w-12" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
