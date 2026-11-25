import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import Layout from '../components/Layout';
import { auth } from '../lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await auth.login({ email, password });
      await router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Layout>
    <Head><title>Sign in | ECHO</title><meta name="description" content="Sign in to manage your ECHO digital presence." /></Head>
    <main className="echo-auth">
      <section className="echo-auth-intro">
        <span className="new-section-caption">YOUR PRESENCE STARTS HERE</span>
        <h1>Welcome<br /><span>back to ECHO.</span></h1>
        <p>Return to your digital identities, conversations and communities—all in one place.</p>
        <div className="echo-auth-points" aria-label="ECHO benefits">
          <span><i aria-hidden="true">✓</i> Control what your ECHO knows and shares</span>
          <span><i aria-hidden="true">✓</i> Explore your avatar and voice settings</span>
          <span><i aria-hidden="true">✓</i> Find new connections in ECHO World</span>
        </div>
      </section>
      <form className="echo-auth-form" onSubmit={submit} aria-label="Sign in">
        <span className="new-section-caption">ECHO ACCOUNT</span>
        <h2>Sign in</h2>
        <p>Use the email address associated with your account.</p>
        <label htmlFor="login-email">Email address
          <input id="login-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <label htmlFor="login-password">Password
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Signing in…' : 'Sign in ↗'}</button>
        <p className="echo-auth-foot">New here? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  </Layout>;
}
