import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import EchoForm from '../components/EchoForm';
import { auth, echoes } from '../lib/api';
import type { EchoInput } from '../types';
export default function Creator() { const router = useRouter(); const [busy, setBusy] = useState(false);
  useEffect(() => { auth.me().catch(() => router.replace('/login')); }, [router]);
  async function save(data: EchoInput) { setBusy(true); try { const echo = await echoes.create(data); await router.push(`/dashboard/${echo.id}`); } finally { setBusy(false); } }
  return <Layout loggedIn><main className="container creator-page narrow"><div className="page-head"><div><div className="eyebrow"><span className="eyebrow-line" /> ECHO STUDIO / CREATOR</div><h1>Bring your perspective forward.</h1><p className="muted">Create a digital representative, then choose precisely what it may know and share.</p></div></div><EchoForm onSave={save} busy={busy} /></main></Layout>; }
