import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Avatar from '../../components/Avatar';
import Chat from '../../components/Chat';
import { echoes } from '../../lib/api';
import type { PublicEcho } from '../../types';
export default function PublicProfile() { const router = useRouter(); const handle = router.query.handle as string; const [echo, setEcho] = useState<PublicEcho | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (handle) echoes.public(handle).then(setEcho).catch(e => setError(e.message)); }, [handle]);
  return <Layout><main className="container public-profile">{error ? <div className="card empty-state"><h2>Profile unavailable</h2><p className="muted">{error}</p></div> : !echo ? <p>Loading…</p> : <><div className="public-intro"><div className="eyebrow">INTERACTIVE DIGITAL IDENTITY</div><Avatar name={echo.name} color={echo.avatar_color} style={echo.avatar_style}/><h1>{echo.name}</h1><p>{echo.tagline}</p><span className="badge">AI representative · Not a human</span></div><Chat path={`/public/${encodeURIComponent(echo.handle)}/chat`} name={echo.name} /><p className="muted center">Responses are AI-generated. Do not share sensitive personal information.</p></>}</main></Layout>; }
