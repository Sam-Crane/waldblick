import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { Field, inputClass, SubmitButton, ErrorText } from './fields';
import { supabase, hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

export default function ForgotPassword() {
  const t = useTranslation();
  const [email, setEmail] = useState('');
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
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={
        <Link to="/signin" className="font-semibold text-primary-container">
          {t('common.back')}
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-body-md">
          {t('auth.forgot.sent', { email })}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-stack-lg">
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
          <ErrorText message={error} />
          <SubmitButton disabled={busy}>{busy ? t('auth.forgot.busy') : t('auth.forgot.button')}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
