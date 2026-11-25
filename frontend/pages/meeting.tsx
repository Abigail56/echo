import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { auth } from '../lib/api';

const MeetingAvatar = dynamic(() => import('../components/MeetingAvatar'), { ssr: false });

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
    return (
      <Layout>
        <main className="container narrow">
          <p className="muted" role="status">Checking your ECHO session…</p>
        </main>
      </Layout>
    );
  }

  return (
    <Layout loggedIn>
      <main className="container meeting-page">
        <div className="page-head">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> ECHO STUDIO / LIVE PRESENCE</div>
            <h1>Step into the room.</h1>
            <p className="muted">Configure a provider-backed video session. Meeting clients and virtual camera output are shown only when available.</p>
          </div>
        </div>
        <MeetingAvatar />
      </main>
    </Layout>
  );
}
