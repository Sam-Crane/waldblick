import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import { Field, inputClass, SubmitButton, ErrorText } from './fields';
import { supabase, hasSupabase } from '@/data/supabase';
import { useTranslation } from '@/i18n';

export default function ResetPassword() {
  const t = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!hasSupabase || !supabase) {
      setError(t('auth.supabaseMissing'));
      return;
    }
    if (password.length < 8) return setError(t('auth.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    navigate('/map', { replace: true });
  };

  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-stack-lg">
        <Field label={t('auth.newPassword')} icon="lock" hint={t('auth.passwordHint')}>
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
        <Field label={t('auth.confirmPassword')} icon="lock">
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </Field>
        <ErrorText message={error} />
        <SubmitButton disabled={busy}>{busy ? t('auth.reset.busy') : t('auth.reset.button')}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
