import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import Avatar from '../../components/Avatar';
import { auth, echoes } from '../../lib/api';
import type { Echo, User } from '../../types';

const tools = [
  {
    number: '01',
    label: 'Avatar Studio',
    description: 'Set up your appearance, choose a provider and test live presence.',
    href: '/avatar-lab',
    action: 'Open avatar studio',
    icon: '◉',
  },
  {
    number: '02',
    label: 'Live Presence',
    description: 'Check your microphone, consent controls and supported video avatar sessions.',
    href: '/meeting',
    action: 'Prepare a session',
    icon: '↗',
  },
  {
    number: '03',
    label: 'ECHO World',
    description: 'Discover public ECHOs, communities and introductions.',
    href: '/world',
    action: 'Explore the world',
    icon: '◎',
  },
  {
    number: '04',
    label: 'Live Rooms',
    description: 'Join a room to exchange messages and use supported browser voice tools.',
    href: '/world/rooms',
    action: 'View rooms',
    icon: '⌁',
  },
];

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Echo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const account = await auth.me();
        if (!mounted) return;
        setUser(account);
      } catch {
        if (mounted) void router.replace('/login');
        return;
      }

      try {
        const owned = await echoes.list();
        if (mounted) setItems(owned);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Could not load your ECHOs.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  const publicCount = items.filter(item => item.is_public).length;
  const privateCount = items.length - publicCount;

  return <Layout loggedIn>
    <main className="container command-page">
      <section className="command-intro">
        <div className="command-intro-copy">
          <span className="command-kicker"><span className="signal-dot" /> YOUR WORKSPACE · ECHO STUDIO</span>
          <h1>Make your presence <em>matter.</em></h1>
          <p>{user ? `Welcome back, ${user.name.split(' ')[0]}. ` : ''}Build your digital representative, choose what it can share, and connect with people across ECHO World.</p>
          <div className="command-actions">
            <Link className="button" href="/creator">Create an ECHO <span aria-hidden="true">↗</span></Link>
            <Link className="button button-outline" href="/avatar-lab">Open Avatar Studio <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <div className="command-orbit" aria-hidden="true">
          <span className="command-orbit-ring command-orbit-ring-one" />
          <span className="command-orbit-ring command-orbit-ring-two" />
          <span className="command-orbit-core">E</span>
          <span className="command-orbit-label">YOUR PRESENCE, YOUR RULES</span>
        </div>
      </section>

      <section aria-label="Identity overview" className="command-stats">
        <div><span>Total identities</span><strong>{loading ? '—' : items.length}</strong><small>Your ECHOs</small></div>
        <div><span>Public identities</span><strong>{loading ? '—' : publicCount}</strong><small>Visible in ECHO World</small></div>
        <div><span>Private identities</span><strong>{loading ? '—' : privateCount}</strong><small>Visible only to you</small></div>
      </section>

      <div className="command-section-title">
        <div><div className="section-kicker">YOUR DIGITAL IDENTITIES</div><h2>Your ECHOs</h2></div>
        <Link href="/creator" className="text-link">New identity <span aria-hidden="true">↗</span></Link>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <div className="command-loading" role="status" aria-live="polite">
          <span className="command-loading-dot" /> Loading your workspace…
        </div>
      ) : items.length === 0 ? (
        <section className="command-empty">
          <div className="command-empty-art" aria-hidden="true">E<span>+</span></div>
          <div><span className="section-kicker">START HERE</span><h3>Give your ideas a presence.</h3>
            <p>There are no ECHOs in your workspace yet. Create a digital representative and decide what it knows and shares.</p>
            <Link className="button" href="/creator">Create your first ECHO <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      ) : (
        <div className="echo-grid command-identity-grid">
          {items.map((item) => <Link key={item.id} className="card echo-card command-identity" href={`/dashboard/${item.id}`}>
            <div className="echo-card-top">
              <Avatar name={item.name} color={item.avatar_color} style={item.avatar_style} size="small" />
              <span className={`badge ${item.is_public ? 'badge-public' : 'badge-private'}`}>{item.is_public ? 'PUBLIC' : 'PRIVATE'}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.tagline || 'Your digital representative'}</p>
            <span className="card-arrow">Manage identity <span aria-hidden="true">↗</span></span>
          </Link>)}
        </div>
      )}

      <div className="command-section-title command-tools-title">
        <div><div className="section-kicker">EXPLORE THE PLATFORM</div><h2>Your creative toolkit</h2></div>
        <p>Everything you need to shape, express and connect.</p>
      </div>
      <div className="command-tool-grid">
        {tools.map(tool => <Link href={tool.href} key={tool.number} className="command-tool">
          <div className="command-tool-top"><span>{tool.number} / ECHO</span><span className="command-tool-icon" aria-hidden="true">{tool.icon}</span></div>
          <div><h3>{tool.label}</h3><p>{tool.description}</p></div>
          <span className="command-tool-action">{tool.action} <span aria-hidden="true">↗</span></span>
        </Link>)}
      </div>

      <section className="command-trust">
        <div><span className="section-kicker">BUILT AROUND YOUR CHOICES</span><h2>Human-led by design.</h2>
          <p>Your knowledge, identity and introductions are yours to control. Live avatar sessions and third-party integrations depend on provider availability and consent.</p>
        </div>
        <Link className="button button-outline" href="/billing">Account &amp; usage <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </Layout>;
}
