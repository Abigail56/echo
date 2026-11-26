import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import EchoForm from '../../components/EchoForm';
import Chat from '../../components/Chat';
import MemoryPanel from '../../components/MemoryPanel';
import { echoes } from '../../lib/api';
import type { Echo, EchoInput } from '../../types';
export default function Studio() { const router = useRouter(); const id = router.query.id as string; const [echo, setEcho] = useState<Echo | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (id) echoes.get(id).then(setEcho).catch(err => { if (err.message === 'Login required') router.replace('/login'); else setError(err.message); }); }, [id, router]);
  async function save(data: EchoInput) { setBusy(true); try { setEcho(await echoes.update(id, data)); } finally { setBusy(false); } }
  async function remove() { if (!confirm('Permanently delete this ECHO?')) return; try { await echoes.remove(id); router.push('/dashboard'); } catch (err) { setError((err as Error).message); } }
  return <Layout loggedIn><main className="container narrow"><Link href="/dashboard" className="back">← All ECHOs</Link>{error && <p className="error">{error}</p>}{!echo ? <p className="muted">Loading ECHO…</p> : <><div className="page-head"><div><div className="eyebrow">ECHO STUDIO</div><h1>{echo.name}</h1><p className="muted">Edit your identity and test its conversation.</p></div>{echo.is_public && <Link className="button ghost" href={`/e/${echo.handle}`}>View public profile ↗</Link>}</div><EchoForm key={echo.id} initial={echo} onSave={save} busy={busy} /><MemoryPanel echoId={echo.id}/><div className="section-space"><Chat key={echo.id} echoId={echo.id} path={`/echoes/${echo.id}/chat`} name={echo.name} /></div><button className="danger" onClick={remove}>Delete ECHO permanently</button></>}</main></Layout>; }
