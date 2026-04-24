import type { ReactNode } from 'react';

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="bg-primary px-margin-main pb-stack-lg pt-12 text-on-primary">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container">
            <span className="material-symbols-outlined filled text-primary-fixed-dim">forest</span>
          </div>
          <span className="text-label-md font-bold uppercase tracking-widest text-primary-fixed-dim">
            Waldblick
          </span>
        </div>
        <h1 className="mt-stack-lg text-headline-lg font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-primary-fixed-dim">{subtitle}</p>}
      </div>
      <div className="mx-auto w-full max-w-md flex-1 px-margin-main py-stack-lg">{children}</div>
      {footer && (
        <div className="mx-auto w-full max-w-md px-margin-main pb-8 text-center text-body-md text-on-surface-variant">
          {footer}
        </div>
      )}
    </div>
  );
}
