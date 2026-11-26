import { FormEvent, useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { request } from '../../lib/api';

type WorldRoom = { id: string; name: string };

export default function Rooms() {
  const [rooms, setRooms] = useState<WorldRoom[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await request<WorldRoom[]>('/world/rooms');
      setRooms(items);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized || creating) return;
    setCreating(true);
    setError('');
    setNotice('');
    try {
      await request('/world/rooms', { method: 'POST', body: JSON.stringify({ name: normalized }) });
      setName('');
      await load();
      setNotice('Room created. Select it below to join the conversation.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the room.');
    } finally {
      setCreating(false);
    }
  }

  return <Layout loggedIn>
    <Head><title>Live Rooms | ECHO World</title><meta name="description" content="Create or join live ECHO World rooms for text chat, browser voice and 3D shared presence." /></Head>
    <main className="container world-rooms-page world-v5 world-v5-rooms">
      <header className="world-v5-rooms-hero">
        <div><span className="section-kicker">ECHO WORLD / LIVE ROOMS</span>
          <h1>Every conversation<br /><em>starts somewhere.</em></h1>
          <p>Enter a shared space for live messages, browser-based voice and a 3D scene. Your microphone stays off until you choose to start it.</p>
          <Link className="button button-outline" href="/world">← Back to discovery</Link>
        </div>
        <div className="world-v5-rooms-visual" aria-hidden="true"><span>◎</span><i /><i /><i /></div>
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="voice-status" role="status">{notice}</p> : null}

      <section className="room-create-panel world-v5-room-create">
        <div><span className="section-kicker">CREATE A ROOM</span><h2>Make space for an idea.</h2>
          <p>Give your conversation a name and invite people to take part.</p></div>
        <form className="room-create-actions" onSubmit={event => void create(event)}>
          <label htmlFor="new-room-name" className="sr-only">Room name</label>
          <input id="new-room-name" placeholder="e.g. Creators' Lounge" minLength={2} maxLength={100} required value={name} onChange={event => setName(event.target.value)} />
          <button type="submit" className="button" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create room'} <span aria-hidden="true">↗</span></button>
        </form>
      </section>

      <div className="world-section-heading"><div><div className="section-kicker">OPEN DOORS</div><h2>Rooms in ECHO World</h2></div>
        <span>{loading ? 'LOADING' : `${rooms.length.toString().padStart(2, '0')} ROOMS`}</span></div>
      {loading ? <div className="world-v5-loading" role="status">Loading available rooms…</div> :
        <div className="room-list world-v5-room-list">
          {rooms.map((room, index) => <Link className="room-row" key={room.id} href={`/world/immersive/${room.id}`}>
            <span className="community-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="room-presence" aria-hidden="true"><i /><i /><i /></span>
            <span className="community-copy"><strong>{room.name}</strong><small>Text, optional voice and shared 3D scene</small></span>
            <span className="community-arrow">Enter room <i aria-hidden="true">↗</i></span>
          </Link>)}
          {!rooms.length && !error ? <div className="world-v5-empty"><h3>Be the first to open a room.</h3><p>Create a room above to start a conversation.</p></div> : null}
        </div>}
      <p className="world-v5-note">Rooms use a live connection. Voice is peer-to-peer where supported, and permissions are requested only when you enable your microphone. Real-time room messaging may not be stored permanently.</p>
    </main>
  </Layout>;
}
