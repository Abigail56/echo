import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { auth } from '../lib/api';
export default function Register() { const router = useRouter(); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await auth.register({ name, email, password }); router.push('/dashboard'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <Layout><main className="auth-wrap"><form onSubmit={submit} className="card form auth-card"><div className="eyebrow">WELCOME TO ECHO</div><h1>Create your account</h1><p className="muted">Start building your digital presence.</p>
    <label>Your name<input required minLength={2} value={name} onChange={e => setName(e.target.value)} /></label><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password <span className="muted">(at least 10 characters)</span><input type="password" minLength={10} required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="error">{error}</p>}<button disabled={busy} className="button">{busy ? 'Creating…' : 'Create account →'}</button><p className="muted">Already registered? <Link href="/login">Sign in</Link></p></form></main></Layout>; }
