import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import Layout from '../components/Layout';
import { auth } from '../lib/api';

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
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
      await auth.register({ name: name.trim(), email: email.trim(), password });
      await router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account creation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Layout>
    <Head><title>Create an account | ECHO</title><meta name="description" content="Create an ECHO account and shape your personal digital presence." /></Head>
    <main className="echo-auth">
      <section className="echo-auth-intro">
        <span className="new-section-caption">AN IDENTITY THAT'S YOURS</span>
        <h1>Start something<br /><span>meaningful.</span></h1>
        <p>Your digital presence begins with your choices. Create an account and decide what your ECHO knows and shares.</p>
        <div className="echo-auth-points" aria-label="ECHO account benefits">
          <span><i aria-hidden="true">✓</i> Create a personal ECHO identity</span>
          <span><i aria-hidden="true">✓</i> Set public and private boundaries</span>
          <span><i aria-hidden="true">✓</i> Explore communities and introductions</span>
        </div>
      </section>
      <form className="echo-auth-form" onSubmit={submit} aria-label="Create account">
        <span className="new-section-caption">JOIN ECHO</span>
        <h2>Create an account</h2>
        <p>It starts with a name and a point of view.</p>
        <label htmlFor="register-name">Your name
          <input id="register-name" type="text" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label htmlFor="register-email">Email address
          <input id="register-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <label htmlFor="register-password">Password <span className="muted">(at least 10 characters)</span>
          <input id="register-password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Creating account…' : 'Create account ↗'}</button>
        <p className="echo-auth-foot">Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  </Layout>;
}
