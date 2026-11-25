import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { auth } from '../lib/api';

const MeetingAvatar = dynamic(() => import('../components/MeetingAvatar'), {
  ssr: false,
  loading: () => <div className="presence-loading" role="status">Loading live avatar controls…</div>,
});

const steps = [
  { number: '01', title: 'Choose a provider', detail: 'Select an available avatar from LiveAvatar or Tavus. Availability depends on your configured account.' },
  { number: '02', title: 'Check your devices', detail: 'Review microphone input, browser permissions and connection diagnostics before starting.' },
  { number: '03', title: 'Start with consent', detail: 'Make your AI use clear, choose the right speaking mode and end the session whenever you want.' },
];

export default function Meeting() {
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
    <Head>
      <title>Live Presence | ECHO</title>
      <meta name="description" content="Configure a supported video avatar session, check your microphone and manage your ECHO presence with consent." />
    </Head>
    <main className="container meeting-page presence-v4">
      <header className="presence-hero">
        <div className="presence-hero-text">
          <div className="section-kicker">ECHO STUDIO / LIVE PRESENCE</div>
          <h1>Show up, on<br /><em>your terms.</em></h1>
          <p>Bring a provider-backed avatar into a browser session. Choose the face, voice mode and permissions that fit your needs—without giving up control.</p>
          <div className="presence-hero-actions">
            <a className="button" href="#session-controls">Set up your session <span aria-hidden="true">↓</span></a>
            <Link className="button button-outline" href="/avatar-lab">Avatar Studio <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <aside className="presence-boundary" aria-label="Meeting integration capabilities">
          <span className="presence-boundary-label"><i /> SESSION CONTROL</span>
          <div className="presence-visual-orbit" aria-hidden="true"><div className="presence-visual-core">E</div></div>
          <strong>A preview, not a virtual camera.</strong>
          <p>A browser-based avatar session does not automatically join Zoom, Google Meet or Microsoft Teams, or create a system webcam.</p>
        </aside>
      </header>

      <section className="presence-setup" aria-labelledby="presence-how-heading">
        <div className="presence-section-title">
          <span className="section-kicker">BEFORE YOU CONNECT</span>
          <h2 id="presence-how-heading">Ready when you are.</h2>
        </div>
        <div className="presence-steps">
          {steps.map(step => <article key={step.number} className="presence-step">
            <span className="presence-step-number">{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
          </article>)}
        </div>
      </section>

      <section id="session-controls" className="presence-session" aria-labelledby="presence-session-title">
        <div className="presence-section-heading">
          <div><span className="section-kicker">YOUR LIVE WORKSPACE</span><h2 id="presence-session-title">Session controls.</h2></div>
          <p>Provider availability and real connection diagnostics appear below. A session starts only when you choose to start it.</p>
        </div>
        <MeetingAvatar />
      </section>

      <section className="presence-trust" aria-label="Privacy and session guidance">
        <div><span className="section-kicker">PRIVACY FIRST</span><h2>Stay in control.</h2><p>AI-operated sessions, third-party provider processing and microphone streaming must be disclosed and used with permission. Review settings before sharing private knowledge.</p></div>
        <Link href="/dashboard" className="button button-outline">Return to Studio <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </Layout>;
}
