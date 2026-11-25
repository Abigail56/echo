import dynamic from 'next/dynamic';
import Link from 'next/link';
import Head from 'next/head';
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
    return <Layout><main className="container narrow"><p className="muted" role="status">{authenticated === null ? 'Checking your ECHO session…' : 'Redirecting to sign in…'}</p></main></Layout>;
  }

  return <Layout loggedIn>
    <Head><title>Avatar Studio | ECHO</title><meta name="description" content="Configure video avatars, test local 3D voice animation and manage your appearance with ECHO." /></Head>
    <main className="container avatar-studio-page avatar-studio-v3">
      <header className="avatar-v3-intro">
        <div>
          <span className="new-section-caption">STUDIO / YOUR DIGITAL PRESENCE</span>
          <h1>A presence that<br /><em>feels like yours.</em></h1>
          <p>Explore provider-backed video avatars or experiment with your own 3D model and voice. Every session starts with your permission.</p>
        </div>
        <Link href="/dashboard" className="button button-outline small">← Studio overview</Link>
      </header>

      <nav className="avatar-v3-jump" aria-label="Avatar Studio sections">
        <a href="#video-presence"><span>01</span> Video presence <span aria-hidden="true">↘</span></a>
        <a href="#three-d-voice"><span>02</span> 3D &amp; voice lab <span aria-hidden="true">↘</span></a>
        <Link href="/meeting"><span>03</span> Meeting setup <span aria-hidden="true">↗</span></Link>
      </nav>

      <section className="avatar-v3-section" id="video-presence" aria-labelledby="avatar-video-heading">
        <div className="avatar-v3-section-head">
          <div><div className="section-kicker">01 / VIDEO AVATAR</div><h2 id="avatar-video-heading">Your live presence.</h2></div>
          <p>Connect a supported video-avatar provider, select an available face and manage a session from the controls below.</p>
        </div>
        <div className="avatar-v3-panel"><MeetingAvatar /></div>
        <p className="avatar-v3-note">Video sessions require a configured provider and may consume third-party credits. This is not an automatic Zoom, Teams or Google Meet participant.</p>
      </section>

      <section className="avatar-v3-section" id="three-d-voice" aria-labelledby="avatar-3d-heading">
        <div className="avatar-v3-section-head">
          <div><div className="section-kicker">02 / PERSONALIZATION</div><h2 id="avatar-3d-heading">3D &amp; voice lab.</h2></div>
          <p>Preview a sample rigged model, import a compatible GLB or animate its mouth from local microphone volume. This is not photorealistic cloning or phoneme-accurate lip sync.</p>
        </div>
        <details className="studio-advanced-tools avatar-v3-tools" open>
          <summary><span><strong>Open your 3D workspace</strong><small>Avatar model, microphone, AI voice and available generation options</small></span><i aria-hidden="true">+</i></summary>
          <div className="studio-advanced-content"><AvatarVoiceStudio /></div>
        </details>
      </section>

      <section className="avatar-v3-bottom">
        <div><span className="section-kicker">NEXT STEPS</span><h2>Where will your ECHO go?</h2><p>Prepare a supported live session or connect with people in ECHO World.</p></div>
        <div className="avatar-v3-links">
          <Link className="button" href="/meeting">Live presence <span aria-hidden="true">↗</span></Link>
          <Link className="button button-outline" href="/world/rooms">Explore rooms <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  </Layout>;
}
