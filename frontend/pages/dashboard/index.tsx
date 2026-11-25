import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Avatar from '../../components/Avatar';
import { auth, echoes } from '../../lib/api';
import type { Echo, User } from '../../types';

const portrait = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=960&q=85';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Echo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    auth.me().then(setUser).catch(() => router.replace('/login'));
    echoes.list().then(setItems).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load your ECHOs.'));
  }, [router]);

  return <Layout loggedIn>
    <main className="container dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR STUDIO / OVERVIEW</div>
          <h1>{user ? `Welcome, ${user.name.split(' ')[0]}.` : 'Your presence, in motion.'}</h1>
          <p>One place to shape your digital presence, define its boundaries and take your perspective into ECHO World.</p>
          <Link className="button" href="/creator">Create an ECHO <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="dashboard-portrait">
          <img src={portrait} alt="Editorial portrait illustrating the person behind a digital presence" />
          <div className="portrait-caption"><span className="signal-dot" /> HUMAN-CENTRED INTELLIGENCE <span>01</span></div>
          <span className="dashboard-portrait-label">BUILT AROUND<br />YOUR POINT OF VIEW</span>
        </div>
      </section>

      <div className="dashboard-section-heading">
        <div><div className="section-kicker">01 / YOUR IDENTITIES</div><h2>Your ECHOs</h2></div>
        {items.length > 0 ? <Link className="text-link" href="/creator">Create another <span aria-hidden="true">↗</span></Link> : null}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0
        ? <div className="empty-state dashboard-empty"><span className="empty-index">01</span><h2>Your story starts here.</h2><p>You haven't created an ECHO yet. Give your perspective a presence of its own.</p><Link className="button" href="/creator">Create your first ECHO <span aria-hidden="true">↗</span></Link></div>
        : <div className="echo-grid dashboard-echo-grid">{items.map((item, index) => <Link key={item.id} className="card echo-card" href={`/dashboard/${item.id}`}>
          <div className="echo-card-top"><Avatar name={item.name} color={item.avatar_color} style={item.avatar_style} size="small" /><span className="echo-card-index">0{index + 1}</span></div>
          <h2>{item.name}</h2><p className="muted">{item.tagline || 'Your digital representative'}</p>
          <span className={`badge ${item.is_public ? 'badge-public' : 'badge-private'}`}>{item.is_public ? 'PUBLIC PRESENCE' : 'PRIVATE IDENTITY'}</span>
          <span className="card-arrow">Open Studio <span aria-hidden="true">↗</span></span>
        </Link>)}</div>}

      <section className="dashboard-quick-links">
        <Link href="/avatar-lab"><span className="quick-number">02</span><span><strong>Shape your appearance</strong><small>Explore avatar and voice settings</small></span><i aria-hidden="true">↗</i></Link>
        <Link href="/world"><span className="quick-number">03</span><span><strong>Find your next room</strong><small>Meet people and communities in ECHO World</small></span><i aria-hidden="true">↗</i></Link>
      </section>
    </main>
  </Layout>;
}
