'use client';

/** Temporary sign-in / create-account / reset UI. Design only: nothing is sent or stored. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Brand } from '@/components/layout/Brand';
import { useUi } from '@/components/layout/Providers';
import { useTheme } from '@/components/layout/useTheme';
import { pathFor } from '@/lib/domain/routes';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Sign in to continue to your GradeFlow AI workspace.', submit: 'Sign in' },
  signup: { title: 'Create your account', subtitle: 'Start building SF9 report cards and SF10 records.', submit: 'Create account' },
  forgot: { title: 'Reset your password', subtitle: "Enter the email you use for GradeFlow AI and we'll send a reset link.", submit: 'Send reset link' }
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { toast } = useUi();
  const { theme, toggle } = useTheme();
  const id = useId().replace(/:/g, '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const copy = COPY[mode];

  function check(): boolean {
    const next: Record<string, string> = {};
    if (mode === 'signup' && !name.trim()) next.name = 'Enter your full name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (mode !== 'forgot') {
      if (password.length < (mode === 'signup' ? 8 : 1)) next.password = mode === 'signup' ? 'Use at least 8 characters.' : 'Enter your password.';
      if (mode === 'signup' && confirm !== password) next.confirm = 'The passwords do not match.';
    }
    setFields(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check()) return;
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 550));
    setBusy(false);
    if (mode === 'forgot') { setSent(true); return; }
    toast(mode === 'signin' ? 'Signed in (demo) — no account is required yet.' : 'Account created (demo) — nothing was stored yet.', mode === 'signin' ? 'success' : 'info');
    router.push(pathFor('upload'));
  }

  const themeToggle = (
    <button type="button" className="icon-btn auth-theme" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={theme === 'dark'} onClick={toggle}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );

  if (mode === 'forgot' && sent) {
    return (
      <div className="auth-card" role="main">
        {themeToggle}
        <Brand className="auth-brand" />
        <div className="auth-success">
          <span className="auth-success-icon"><Icon name="check-circle" /></span>
          <h1>Check your email</h1>
          <p>If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its way.</p>
          <Link className="btn btn-primary btn-full auth-submit" href="/login">Back to sign in</Link>
        </div>
        <p className="auth-foot">Temporary design preview — no email is actually sent.</p>
      </div>
    );
  }

  return (
    <div className="auth-card" role="main">
      {themeToggle}
      <Brand className="auth-brand" />
      <div className="auth-head">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </div>

      <form className="auth-form" onSubmit={submit} noValidate>
        {mode === 'signup' && (
          <div className="auth-field">
            <label htmlFor={`${id}-name`}>Full name</label>
            <div className={`auth-control${fields.name ? ' invalid' : ''}`}>
              <Icon name="user" />
              <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Juan Dela Cruz" aria-invalid={Boolean(fields.name)} aria-describedby={fields.name ? `${id}-name-error` : undefined} />
            </div>
            {fields.name && <span className="field-error" id={`${id}-name-error`}>{fields.name}</span>}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor={`${id}-email`}>Email address</label>
          <div className={`auth-control${fields.email ? ' invalid' : ''}`}>
            <Icon name="mail" />
            <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="teacher@school.edu" aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? `${id}-email-error` : undefined} />
          </div>
          {fields.email && <span className="field-error" id={`${id}-email-error`}>{fields.email}</span>}
        </div>

        {mode !== 'forgot' && (
          <div className="auth-field">
            <label htmlFor={`${id}-password`}>Password</label>
            <div className={`auth-control${fields.password ? ' invalid' : ''}`}>
              <Icon name="lock" />
              <input id={`${id}-password`} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? `${id}-password-error` : undefined} />
              <button type="button" className="auth-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </div>
            {fields.password && <span className="field-error" id={`${id}-password-error`}>{fields.password}</span>}
          </div>
        )}

        {mode === 'signup' && (
          <div className="auth-field">
            <label htmlFor={`${id}-confirm`}>Confirm password</label>
            <div className={`auth-control${fields.confirm ? ' invalid' : ''}`}>
              <Icon name="lock" />
              <input id={`${id}-confirm`} type={showConfirm ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Repeat your password" aria-invalid={Boolean(fields.confirm)} aria-describedby={fields.confirm ? `${id}-confirm-error` : undefined} />
              <button type="button" className="auth-eye" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? 'Hide password' : 'Show password'} aria-pressed={showConfirm}>
                <Icon name={showConfirm ? 'eye-off' : 'eye'} />
              </button>
            </div>
            {fields.confirm && <span className="field-error" id={`${id}-confirm-error`}>{fields.confirm}</span>}
          </div>
        )}

        {mode === 'signin' && (
          <div className="auth-row">
            <label className="auth-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Remember me</span></label>
            <Link className="text-link" href="/forgot-password">Forgot password?</Link>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : copy.submit}
        </button>
      </form>

      {mode === 'signin' && (
        <>
          <div className="auth-divider">New to GradeFlow?</div>
          <Link className="btn btn-secondary btn-full" href="/signup">Create account</Link>
        </>
      )}

      {mode === 'signup' && (
        <p className="auth-switch">Already have an account? <Link className="text-link" href="/login">Sign in</Link></p>
      )}

      {mode === 'forgot' && (
        <p className="auth-switch"><Link className="text-link" href="/login"><Icon name="arrow-left" /> Back to sign in</Link></p>
      )}

      <p className="auth-foot">Temporary design preview — authentication is not connected yet.</p>
    </div>
  );
}
