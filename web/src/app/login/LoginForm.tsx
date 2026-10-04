'use client';

import { useActionState, useState } from 'react';
import { signIn, sendReset } from './actions';
import styles from './login.module.css';
import {
  AlertIcon, ArrowLeftIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, ShieldCheckIcon,
} from '@/components/icons';

export function LoginForm() {
  // 'signin' shows email + password; 'reset' shows only email to request a reset link.
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  // Kept in state so the email stays filled in after a failed attempt, and carries over to "reset".
  const [email, setEmail] = useState('');

  // useActionState sends the form to a server action and gives back its result.
  const [signInState, signInAction, signingIn] = useActionState(signIn, undefined);
  const [resetState, resetAction, resetting] = useActionState(sendReset, undefined);

  const isSignIn = mode === 'signin';
  const state = isSignIn ? signInState : resetState;
  const pending = isSignIn ? signingIn : resetting;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h1 className={styles.title}>{isSignIn ? 'Welcome back' : 'Reset your password'}</h1>
        <p className={styles.subtitle}>
          {isSignIn
            ? 'Sign in to the Pencil Maths admin portal.'
            : 'Enter your email and we will send you a link to choose a new password.'}
        </p>
      </div>

      {state?.error && (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          <AlertIcon size={18} /> <span>{state.error}</span>
        </div>
      )}
      {state?.ok && (
        <div className={`${styles.alert} ${styles.alertOk}`} role="status">
          <CheckCircleIcon size={18} /> <span>{state.ok}</span>
        </div>
      )}

      <form action={isSignIn ? signInAction : resetAction} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>Email address</label>
          <div className={styles.inputWrap}>
            <MailIcon size={18} className={styles.inputIcon} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@pencilmaths.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
            />
          </div>
        </div>

        {isSignIn && (
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label htmlFor="password" className={styles.label}>Password</label>
              <button type="button" className={styles.linkBtn} onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </div>
            <div className={styles.inputWrap}>
              <LockIcon size={18} className={styles.inputIcon} />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                required
                className={`${styles.input} ${styles.inputWithToggle}`}
              />
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </div>
        )}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending && <span className={styles.spinner} aria-hidden="true" />}
          {pending ? 'Please wait…' : isSignIn ? 'Sign in' : 'Send reset link'}
        </button>

        {!isSignIn && (
          <button type="button" className={`${styles.linkBtn} ${styles.back}`} onClick={() => setMode('signin')}>
            <ArrowLeftIcon size={16} /> Back to sign in
          </button>
        )}
      </form>

      <p className={styles.note}>
        <ShieldCheckIcon size={16} />
        <span>Access is by invitation only. Ask an admin if you need an account.</span>
      </p>
    </div>
  );
}
