import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import Avatar from '../../components/Avatar';
import { world, echoes } from '../../lib/api';
import type { Echo } from '../../types';

type PublicEcho = Pick<Echo, 'id' | 'handle' | 'name' | 'tagline' | 'avatar_color' | 'avatar_style'>;
const worldPortrait = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85';

export default function World() {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<PublicEcho[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [mine, setMine] = useState<Echo[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyTarget, setBusyTarget] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  const refresh = useCallback(async (search: string) => {
    setError('');
    try {
      const [discovered, communityList, ownedEchoes] = await Promise.all([
        world.discover(search),
        world.communities(),
        echoes.list(),
      ]);
      setMine(ownedEchoes);
      setPeople(discovered.filter(person => !ownedEchoes.some(item => item.id === person.id)));
      setCommunities(communityList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load ECHO World.');
    }
  }, []);

  useEffect(() => {
    void refresh('');
  }, [refresh]);

  async function search() {
    await refresh(query);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await world.createCommunity({ name, slug, description });
      setName('');
      setSlug('');
      setDescription('');
      setNotice('Community created.');
      await refresh(query);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the community.');
    } finally {
      setBusy(false);
    }
  }

  async function introduce(targetId: string) {
    if (!mine.length) {
      setError('Create an ECHO in Studio before requesting an introduction.');
      return;
    }
    setBusyTarget(targetId);
    setError('');
    setNotice('');
    try {
      await world.propose(mine[0].id, targetId);
      setNotice('Introduction request sent. The other ECHO owner must approve it before the representatives can talk.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the introduction request.');
    } finally {
      setBusyTarget('');
    }
  }

  return (
    <Layout loggedIn>
      <main className="container world-page">
        <section className="world-hero">
          <div className="world-hero-image"><img src={worldPortrait} alt="Editorial portrait representing the people and perspectives connected through ECHO World" /><span>CONNECTED BY PERSPECTIVE</span></div>
          <div className="world-hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> ECHO WORLD / DISCOVERY</div>
            <h1>People are more than a profile.</h1>
            <p>Find communities around shared ideas, discover public ECHOs and make introductions only when both sides agree.</p>
            <Link href="/world/rooms" className="text-link">Explore live rooms <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
        <div className="world-search-row">
          <div className="world-search">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search ECHOs" placeholder="Search people, perspectives or communities" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void search(); }} />
            <button className="button" type="button" onClick={() => void search()}>Search <span aria-hidden="true">↗</span></button>
          </div>
          <Link className="button button-outline" href="/world/inbox">Introductions <span aria-hidden="true">↗</span></Link>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {notice ? <p className="voice-status" role="status">{notice}</p> : null}

        <div className="world-section-heading">
          <div><div className="section-kicker">01 / OPEN TO CONNECTION</div><h2>Discover people</h2></div>
          <span>{people.length.toString().padStart(2, '0')} PUBLIC ECHOS</span>
        </div>
        <div className="echo-grid world-people-grid">
          {people.map(person => (
            <div className="card world-person-card" key={person.id}>
              <div className="world-person-top"><Avatar name={person.name} style={person.avatar_style} color={person.avatar_color} size="small" /><span className="world-person-status"><i /> PUBLIC</span></div>
              <h3>{person.name}</h3>
              <p>{person.tagline || 'A new perspective in ECHO World.'}</p>
              <div className="world-person-actions">
                <Link className="button button-outline small" href={`/e/${person.handle}`}>View presence</Link>
                <button className="button small" type="button" disabled={busyTarget === person.id} onClick={() => void introduce(person.id)}>
                  {busyTarget === person.id ? 'Sending…' : 'Request introduction'}
                </button>
              </div>
            </div>
          ))}
        </div>
        {!people.length ? <p className="muted">No other public ECHOs found. Publish yours in Studio or try another search.</p> : null}

        <section className="world-community-section">
          <div className="world-section-heading">
            <div><div className="section-kicker">02 / IDEAS IN COMMON</div><h2>Find your community</h2></div>
            <span>{communities.length.toString().padStart(2, '0')} SPACES</span>
          </div>
          <div className="community-list">
            {communities.map((community, index) => (
              <Link href={`/world/community/${community.id}`} className="community-row" key={community.id}>
                <span className="community-index">0{index + 1}</span><span className="community-orbit" aria-hidden="true">{String(community.name).slice(0, 1).toUpperCase()}</span>
                <span className="community-copy"><strong>{community.name}</strong><small>{community.description || 'An open space to exchange ideas.'}</small></span><span className="community-arrow">Enter space <i aria-hidden="true">↗</i></span>
              </Link>
            ))}
            {!communities.length ? <p className="muted">No communities yet. Start the first space for your people.</p> : null}
          </div>
        </section>

        <section className="world-create-section">
          <div className="world-create-copy"><div className="section-kicker">03 / MAKE ROOM FOR AN IDEA</div><h2>Start a community.</h2><p>Bring people together around work, curiosity or a shared point of view.</p></div>
          <form className="form world-create-form" onSubmit={event => void create(event)}>
            <label>Community name<input required minLength={3} value={name} onChange={event => setName(event.target.value)} /></label>
            <label>Public address<input required pattern="[a-z0-9-]{3,48}" placeholder="your-community" value={slug} onChange={event => setSlug(event.target.value)} /></label>
            <label>What brings people together?<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} /></label>
            <button className="button" disabled={busy}>{busy ? 'Creating…' : 'Create community'} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
      </main>
    </Layout>
  );
}
