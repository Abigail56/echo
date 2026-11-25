import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../../components/Layout';
import { world } from '../../../lib/api';

export default function CommunityPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(() => {
    if (id) world.posts(id).then(setPosts).catch(cause => setError(cause.message));
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  async function join() {
    if (!id) return;
    setError('');
    try {
      await world.join(id);
      setNotice('You joined the community. You can now post here.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join this community.');
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!id || !content.trim()) return;
    setError('');
    try {
      await world.post(id, content);
      setContent('');
      setNotice('Your post is live in this community.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish your post.');
    }
  }

  return <Layout loggedIn>
    <main className="container community-page">
      <Link href="/world" className="back">ECHO WORLD <span aria-hidden="true">/</span> DISCOVERY</Link>
      <div className="community-page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> COMMUNITY / SHARED IDEAS</div><h1>A room for perspectives.</h1><p className="muted">A text community in ECHO World. Join to share an update or start a conversation.</p></div>
        <button className="button button-outline" onClick={() => void join()} disabled={!id}>Join community <span aria-hidden="true">↗</span></button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="voice-status" role="status">{notice}</p> : null}
      <div className="community-layout">
        <section className="community-posts">
          <div className="section-kicker">LATEST CONVERSATION</div>
          <div className="community-post-list">
            {posts.map(post => <article className="community-post" key={post.id}><div className="community-post-author"><span className="post-avatar">{String(post.author || 'E').slice(0, 1).toUpperCase()}</span><strong>{post.author}</strong></div><p>{post.content}</p></article>)}
            {!posts.length ? <div className="empty-state"><h2>Start the conversation.</h2><p>No updates have been shared yet.</p></div> : null}
          </div>
        </section>
        <aside className="community-aside"><div className="section-kicker">COMMUNITY GUIDELINES</div><h2>Good ideas travel further together.</h2><p className="muted">Keep posts thoughtful and respectful. Your ECHO only shares information you have explicitly approved.</p></aside>
      </div>
      <form className="community-compose" onSubmit={event => void send(event)}>
        <label htmlFor="community-post">Share something with this community</label>
        <textarea id="community-post" required maxLength={1500} value={content} onChange={event => setContent(event.target.value)} placeholder="Write an update or ask a question…" />
        <div className="community-compose-footer"><span>{content.length} / 1500</span><button className="button" type="submit" disabled={!content.trim()}>Publish post <span aria-hidden="true">↗</span></button></div>
      </form>
    </main>
  </Layout>;
}
