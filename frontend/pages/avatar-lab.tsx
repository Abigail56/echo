import dynamic from 'next/dynamic';
import Link from 'next/link';
import Layout from '../components/Layout';
import AvatarVoiceStudio from '../components/AvatarVoiceStudio';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/api';

const MeetingAvatar = dynamic(() => import('../components/MeetingAvatar'), { ssr: false });

export default function AvatarLab() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    auth.me()
      .then(() => { if (active) setAuthenticated(true); })
      .catch(() => {
        if (!active) return;
        setAuthenticated(false);
        void router.replace('/login');
      });
    return () => { active = false; };
  }, [router]);

  if (authenticated !== true) {
    return <Layout><main className="container narrow"><p className="muted" role="status">Checking your ECHO session…</p></main></Layout>;
  }

  return <Layout loggedIn>
    <main className="container avatar-studio-page">
      <div className="avatar-studio-heading">
        <div><div className="eyebrow"><span className="eyebrow-line" /> ECHO STUDIO / AVATAR</div>
          <h1>Make presence personal.</h1>
          <p className="muted">Configure your video avatar, voice and microphone. Your appearance is always yours to direct.</p></div>
        <span className="studio-state"><i /> PRIVATE STUDIO</span>
      </div>
      <section className="studio-live-preview">
        <div className="studio-live-heading"><div><div className="section-kicker">01 / YOUR LIVE PRESENCE</div><h2>The human at the centre.</h2></div><p>Provider-backed video avatar preview. Video rendering does not require WebGL.</p></div>
        <MeetingAvatar />
      </section>
      <details className="studio-advanced-tools" open>
        <summary><span><strong>Appearance, generation and voice</strong><small>Choose a provider avatar, create a likeness, or configure optional ECHO World tools</small></span><i aria-hidden="true">+</i></summary>
        <div className="studio-advanced-content"><AvatarVoiceStudio /></div>
      </details>
      <div className="voice-integrations">
        <Link className="button button-outline" href="/meeting">Prepare a meeting <span aria-hidden="true">↗</span></Link>
        <Link className="button button-outline" href="/world/rooms">Explore ECHO World <span aria-hidden="true">↗</span></Link>
      </div>
      <p className="muted smallprint">Studio microphone audio stays local. To speak with other people, join an authorized ECHO World room, where browser-to-browser voice is available. Meeting preview does not create a virtual camera or join conferencing services.</p>
    </main>
  </Layout>;
}
