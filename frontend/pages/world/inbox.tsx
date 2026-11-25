import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { world } from '../../lib/api';

export default function Inbox() {
  const [items, setItems] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    world.intros().then(setItems).catch(cause => setError(cause.message));
    world.connections().then(setConnections).catch(() => undefined);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function action(run: () => Promise<any>) {
    setError('');
    try {
      await run();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The requested action failed.');
    }
  }

  return <Layout loggedIn>
    <main className="container inbox-page">
      <div className="eyebrow"><span className="eyebrow-line" /> ECHO WORLD / INTRODUCTIONS</div>
      <div className="page-head"><div><h1>Good connections begin with consent.</h1><p className="muted">AI introductions are reviewed by the recipient. Private memories are never shared.</p></div></div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="inbox-section">
        <div className="world-section-heading"><div><div className="section-kicker">01 / APPROVAL FIRST</div><h2>Introduction requests</h2></div><span>{items.length.toString().padStart(2, '0')} REQUESTS</span></div>
        <div className="stack inbox-list">
          {items.map(item => <article className="card inbox-card" key={item.id}>
            <div className="inbox-card-head"><span className="section-kicker">AI INTRODUCTION</span><span className="badge">{item.status}</span></div>
            {item.status === 'pending' ? <p className="muted">Review the request before allowing either ECHO to begin a conversation.</p> : null}
            {item.status === 'pending' && <button className="button" onClick={() => void action(() => world.approve(item.id))}>Approve introduction</button>}
            {item.status === 'approved' && <button className="button" onClick={() => void action(() => world.dialogue(item.id))}>Generate approved introduction</button>}
            {item.transcript && <pre className="transcript">{item.transcript}</pre>}
          </article>)}
          {!items.length ? <div className="empty-state"><h2>No requests waiting.</h2><p>Approved introductions will appear here for review.</p></div> : null}
        </div>
      </section>
      <section className="inbox-section">
        <div className="world-section-heading"><div><div className="section-kicker">02 / YOUR NETWORK</div><h2>Connections</h2></div><span>{connections.length.toString().padStart(2, '0')} CONNECTIONS</span></div>
        <div className="stack inbox-list">
          {connections.map(connection => <article className="card connection-card" key={connection.id}>
            <div><strong>{connection.other_name}</strong><span className="muted">Connection status: {connection.status}</span></div>
            {connection.status === 'pending' && <button className="button small" onClick={() => void action(() => world.accept(connection.id))}>Accept connection</button>}
          </article>)}
          {!connections.length ? <p className="muted">Your accepted connections will appear here.</p> : null}
        </div>
      </section>
    </main>
  </Layout>;
}
