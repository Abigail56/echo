import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { auth, world } from '../../lib/api';

type Intro = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  transcript?: string | null;
  created_at?: string;
};
type Connection = {
  id: string;
  requester_id: string;
  recipient_id: string;
  other_name: string;
  status: string;
};
type UserIdentity = { id: string };

function errMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The requested action failed.';
}

export default function Inbox() {
  const [userId, setUserId] = useState('');
  const [items, setItems] = useState<Intro[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [me, introductions, network] = await Promise.all([
        auth.me() as Promise<UserIdentity>,
        world.intros() as Promise<Intro[]>,
        world.connections() as Promise<Connection[]>,
      ]);
      setUserId(me.id);
      setItems(introductions);
      setConnections(network);
      setError('');
    } catch (cause) {
      setError(errMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function action(id: string, run: () => Promise<unknown>, success: string) {
    if (busyId) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await run();
      setNotice(success);
      await refresh();
    } catch (cause) {
      setError(errMessage(cause));
    } finally {
      setBusyId('');
    }
  }

  const pendingReceived = items.filter(item => item.status === 'pending' && item.recipient_id === userId).length;
  const pendingNetwork = connections.filter(connection => connection.status === 'pending' && connection.recipient_id === userId).length;
  const acceptedConnections = connections.filter(connection => connection.status === 'accepted').length;

  return <Layout loggedIn>
    <Head><title>Introductions & Connections | ECHO World</title><meta name="description" content="Review consent-based AI introductions and connection requests in ECHO World." /></Head>
    <main className="container inbox-page inbox-v7">
      <header className="inbox-v7-hero">
        <div>
          <span className="section-kicker">ECHO WORLD / CONNECTIONS</span>
          <h1>Better connections<br /><em>begin with consent.</em></h1>
          <p>Review invitations, choose when your ECHO can begin an introduction, and manage your network.</p>
          <Link href="/world" className="button button-outline small">← Back to discovery</Link>
        </div>
        <div className="inbox-v7-hero-visual" aria-hidden="true"><span>◎</span><i /><i /><i /></div>
      </header>

      <section className="inbox-v7-stats" aria-label="Connection overview">
        <div><span>Introductions awaiting your approval</span><strong>{loading ? '—' : pendingReceived}</strong></div>
        <div><span>Connection requests awaiting you</span><strong>{loading ? '—' : pendingNetwork}</strong></div>
        <div><span>Accepted connections</span><strong>{loading ? '—' : acceptedConnections}</strong></div>
      </section>

      <div className="inbox-v7-status">
        <span className="section-kicker">YOUR INBOX</span>
        <button type="button" className="button button-outline small" onClick={() => void refresh()} disabled={loading || refreshing || Boolean(busyId)}>{refreshing ? 'Refreshing…' : 'Refresh requests ↻'}</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="voice-status" role="status">{notice}</p> : null}
      {loading ? <p className="inbox-v7-loading" role="status">Loading your requests and connections…</p> : null}

      <section className="inbox-section" aria-labelledby="inbox-intros-heading">
        <div className="world-section-heading"><div><div className="section-kicker">01 / APPROVAL FIRST</div><h2 id="inbox-intros-heading">Introduction requests</h2></div><span>{loading ? 'LOADING' : `${items.length.toString().padStart(2, '0')} REQUESTS`}</span></div>
        <div className="stack inbox-list inbox-v7-list">
          {items.map(item => {
            const incoming = item.recipient_id === userId;
            const canApprove = item.status === 'pending' && incoming;
            const canRun = item.status === 'approved';
            return <article className="card inbox-card inbox-v7-card" key={item.id}>
              <div className="inbox-card-head"><span className="section-kicker">{incoming ? 'RECEIVED INTRODUCTION' : 'SENT INTRODUCTION'}</span><span className={`badge inbox-v7-badge ${item.status === 'completed' ? 'is-complete' : ''}`}>{item.status}</span></div>
              {item.status === 'pending' ? <p className="muted">{incoming ? 'Your approval is required before either ECHO can introduce itself.' : 'Waiting for the receiving ECHO owner to approve your request.'}</p> : null}
              {item.status === 'approved' ? <p className="muted">The recipient approved this introduction. Either participant can now generate the approved, public-information-only dialogue.</p> : null}
              {item.status === 'completed' ? <p className="muted">The approved introduction is complete. Both representatives are identified as AI.</p> : null}
              {canApprove ? <button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void action(item.id, () => world.approve(item.id), 'Introduction approved.')}>{busyId === item.id ? 'Approving…' : 'Approve introduction ↗'}</button> : null}
              {canRun ? <button className="button" type="button" disabled={Boolean(busyId)} onClick={() => void action(item.id, () => world.run(item.id), 'Introduction generated.')}>{busyId === item.id ? 'Generating…' : 'Generate introduction ↗'}</button> : null}
              {item.transcript ? <details className="inbox-v7-transcript"><summary>Read introduction transcript</summary><pre className="transcript">{item.transcript}</pre></details> : null}
            </article>;
          })}
          {!loading && !items.length && !error ? <div className="inbox-v7-empty"><h3>No introductions yet.</h3><p>Discover a public ECHO and request an introduction to get started.</p><Link className="text-link" href="/world">Discover ECHOs ↗</Link></div> : null}
        </div>
      </section>

      <section className="inbox-section" aria-labelledby="inbox-connections-heading">
        <div className="world-section-heading"><div><div className="section-kicker">02 / YOUR NETWORK</div><h2 id="inbox-connections-heading">Connections</h2></div><span>{loading ? 'LOADING' : `${connections.length.toString().padStart(2, '0')} CONNECTIONS`}</span></div>
        <div className="stack inbox-list inbox-v7-list">
          {connections.map(connection => {
            const incoming = connection.recipient_id === userId;
            return <article className="card connection-card inbox-v7-card" key={connection.id}>
              <div className="inbox-v7-connection-info"><div className="inbox-v7-initial" aria-hidden="true">{connection.other_name.trim().charAt(0).toUpperCase() || 'E'}</div><div><strong>{connection.other_name}</strong><span className="muted">{connection.status === 'pending' ? incoming ? 'Awaiting your acceptance' : 'Waiting for their response' : 'Connected'} · {connection.status}</span></div></div>
              {connection.status === 'pending' && incoming ? <button type="button" className="button small" disabled={Boolean(busyId)} onClick={() => void action(connection.id, () => world.accept(connection.id), 'Connection accepted.')}>{busyId === connection.id ? 'Accepting…' : 'Accept connection ↗'}</button> : null}
            </article>;
          })}
          {!loading && !connections.length && !error ? <div className="inbox-v7-empty"><h3>Your network starts here.</h3><p>Connections will appear when you exchange requests with other people.</p></div> : null}
        </div>
      </section>
      <p className="inbox-v7-footnote">Introductions currently generate a short, consent-approved public-information summary, not an autonomous AI-to-AI conversation. No private knowledge is included.</p>
    </main>
  </Layout>;
}
