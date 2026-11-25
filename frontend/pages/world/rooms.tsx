import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { request } from '../../lib/api';

export default function Rooms() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = () => request<any[]>('/world/rooms').then(setRooms).catch(cause => setError(cause.message));

  useEffect(() => { void load(); }, []);

  async function create() {
    try {
      await request('/world/rooms', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the room.');
    }
  }

  return <Layout loggedIn>
    <main className="container world-rooms-page">
      <div className="eyebrow"><span className="eyebrow-line" /> ECHO WORLD / ROOMS</div>
      <div className="page-head"><div><h1>Make space for a conversation.</h1><p className="muted">Shared text and browser-to-browser voice rooms. Join a room to meet people live.</p></div></div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="room-create-panel">
        <div><span className="section-kicker">CREATE A ROOM</span><h2>Bring people together.</h2></div>
        <div className="room-create-actions"><input aria-label="New room name" placeholder="Give your room a name" value={name} onChange={event => setName(event.target.value)} /><button className="button" onClick={() => void create()} disabled={!name.trim()}>Create room <span aria-hidden="true">↗</span></button></div>
      </section>
      <div className="world-section-heading"><div><div className="section-kicker">OPEN DOORS</div><h2>Rooms in ECHO World</h2></div><span>{rooms.length.toString().padStart(2, '0')} ROOMS</span></div>
      <div className="room-list">
        {rooms.map((room, index) => <Link className="room-row" key={room.id} href={`/world/immersive/${room.id}`}>
          <span className="community-index">0{index + 1}</span><span className="room-presence" aria-hidden="true"><i /><i /><i /></span>
          <span className="community-copy"><strong>{room.name}</strong><small>Shared conversation · ECHO World</small></span><span className="community-arrow">Enter room <i aria-hidden="true">↗</i></span>
        </Link>)}
        {!rooms.length ? <div className="empty-state"><h2>First room, first conversation.</h2><p>No rooms are open yet. Create one and invite people in.</p></div> : null}
      </div>
    </main>
  </Layout>;
}
