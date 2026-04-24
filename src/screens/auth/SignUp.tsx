import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { Field, inputClass, SubmitButton, ErrorText } from './fields';
import { supabase, hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

const ROLES = ['owner', 'forester', 'contractor', 'operator'] as const;
type Role = (typeof ROLES)[number];

export default function SignUp() {
  const t = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('forester');
  const [forestName, setForestName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!hasSupabase || !supabase) {
      setError(t('auth.supabaseMissing'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, forest_name: forestName },
        emailRedirectTo: `${window.location.origin}/signin`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout title={t('auth.signup.sentTitle')} subtitle={t('auth.signup.sentSubtitle', { email })}>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-body-md">
          {t('auth.signup.sentBody')}
        </div>
        <Link
          to="/signin"
          className="touch-safe mt-stack-lg flex w-full items-center justify-center rounded-lg bg-primary text-on-primary"
        >
          <span className="font-semibold uppercase tracking-widest">{t('auth.signin.button')}</span>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <span>
          {t('auth.haveAccount')}{' '}
          <Link to="/signin" className="font-bold text-primary-container underline">
            {t('auth.signin.button')}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-stack-lg">
        <Field label={t('auth.name')} icon="person">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoComplete="name"
          />
        </Field>
        <Field label={t('auth.email')} icon="mail">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
          />
        </Field>
        <Field label={t('auth.password')} icon="lock" hint={t('auth.passwordHint')}>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t('auth.role')} icon="badge">
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`touch-safe rounded-lg border-2 px-3 text-label-md font-semibold ${
                  role === r
                    ? 'border-primary-container bg-primary-container text-on-primary'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                }`}
              >
                {t(`role.${r}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('auth.forestName')} icon="forest">
          <input value={forestName} onChange={(e) => setForestName(e.target.value)} className={inputClass} />
        </Field>
        <ErrorText message={error} />
        <SubmitButton disabled={busy}>
          {busy ? t('auth.signup.busy') : t('auth.signup.button')}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
