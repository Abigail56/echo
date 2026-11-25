import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { auth } from '../lib/api';
export default function Login() { const router = useRouter(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await auth.login({ email, password }); router.push('/dashboard'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <Layout><main className="auth-wrap"><form onSubmit={submit} className="card form auth-card"><div className="eyebrow">ECHO STUDIO</div><h1>Welcome back</h1><p className="muted">Sign in to manage your digital self.</p><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="error">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button><p className="muted">New here? <Link href="/register">Create an account</Link></p></form></main></Layout>; }
