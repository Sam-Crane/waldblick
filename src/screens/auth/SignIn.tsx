import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { Field, inputClass, SubmitButton, ErrorText } from './fields';
import { supabase, hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

export default function SignIn() {
  const t = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!hasSupabase || !supabase) {
      setError(t('auth.supabaseMissing'));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate(loc.state?.from ?? '/map', { replace: true });
  };

  return (
    <AuthLayout
      title={t('auth.signin.title')}
      subtitle={t('auth.signin.subtitle')}
      footer={
        <span>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-bold text-primary-container underline">
            {t('auth.createAccount')}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-stack-lg">
        <Field label={t('auth.email')} icon="mail">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="name@beispiel.de"
            autoComplete="email"
          />
        </Field>
        <Field label={t('auth.password')} icon="lock">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-label-md font-semibold text-primary-container">
            {t('auth.forgotPassword')}
          </Link>
        </div>
        <ErrorText message={error} />
        <SubmitButton disabled={busy}>
          {busy ? t('auth.signin.busy') : t('auth.signin.button')}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
