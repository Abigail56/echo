import Link from 'next/link';
import Head from 'next/head';
import Layout from '../components/Layout';

const features = [
  { number: '01', category: 'IDENTITY', title: 'Shape your ECHO.', description: 'Create a digital representative and decide what it knows, how it introduces you and what stays private.', href: '/creator', action: 'Create a presence' },
  { number: '02', category: 'PRESENCE', title: 'Find your voice.', description: 'Explore browser-based avatar sessions and compatible providers. Availability is shown before you connect.', href: '/avatar-lab', action: 'Explore Avatar Studio' },
  { number: '03', category: 'CONNECTION', title: 'Meet new perspectives.', description: 'Discover public ECHOs, build communities and request introductions with consent on both sides.', href: '/world', action: 'Enter ECHO World' },
];

function PresenceGraphic() {
  return <div className="new-hero-visual" aria-label="Illustration of an ECHO presence connected to Studio, conversations, and World">
    <div className="new-orbit new-orbit-outer" aria-hidden="true" />
    <div className="new-orbit new-orbit-inner" aria-hidden="true" />
    <div className="new-presence-card">
      <span className="new-preview-label"><i /> ECHO / IDENTITY</span>
      <div className="new-presence-glyph" aria-hidden="true"><span>E</span></div>
      <div className="new-presence-bottom">
        <strong>Your perspective.</strong>
        <span>Your rules.</span>
      </div>
    </div>
    <div className="new-float new-float-one"><span className="new-float-icon">◎</span><span>STUDIO<br /><strong>Personal knowledge</strong></span></div>
    <div className="new-float new-float-two"><span className="new-float-icon">◌</span><span>WORLD<br /><strong>Meaningful connections</strong></span></div>
    <span className="new-preview-disclaimer">PRODUCT CONCEPT / NOT A LIVE AVATAR PREVIEW</span>
  </div>;
}

export default function Home() {
  return <Layout>
    <Head>
      <title>ECHO — Your presence. Beyond boundaries.</title>
      <meta name="description" content="Create an ECHO, control what it knows, explore live avatar experiences and discover new connections in ECHO World." />
    </Head>
    <main className="new-home">
      <section className="new-home-hero">
        <div className="new-home-copy">
          <div className="new-home-eyebrow"><span /> HUMAN PRESENCE, REIMAGINED</div>
          <h1>Your presence.<br /><em>Beyond boundaries.</em></h1>
          <p>Meet ECHO: a personal intelligence space to express who you are, share what you choose, and connect beyond the usual profile.</p>
          <div className="new-home-actions">
            <Link className="button" href="/register">Create your ECHO <span aria-hidden="true">↗</span></Link>
            <Link className="new-home-secondary" href="/world">Discover ECHO World <span aria-hidden="true">→</span></Link>
          </div>
          <div className="new-home-micro"><span className="new-mini-dot" /> YOUR IDENTITY. YOUR CONSENT. YOUR CONTROL.</div>
        </div>
        <PresenceGraphic />
      </section>

      <section className="new-promise" id="presence">
        <div className="new-section-caption">THE IDEA / 001</div>
        <div className="new-promise-grid">
          <h2>More than a profile.<br /><span>A presence with purpose.</span></h2>
          <p>ECHO helps you bring your perspective into conversations and communities. You decide what to share, who to connect with and when your digital representative can act.</p>
        </div>
      </section>

      <section className="new-feature-section" id="experiences">
        <div className="new-feature-head">
          <div><span className="new-section-caption">EXPLORE / 002</span><h2>One identity.<br />More possibilities.</h2></div>
          <p>Start with what matters to you. Every experience is designed to keep you in control.</p>
        </div>
        <div className="new-feature-grid">
          {features.map(feature => <article key={feature.number} className="new-feature-card">
            <div className="new-feature-card-top"><span>{feature.category}</span><span>{feature.number} / 03</span></div>
            <div className="new-feature-symbol" aria-hidden="true">{feature.number === '01' ? 'E' : feature.number === '02' ? '◉' : '◎'}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            <Link href={feature.href}>{feature.action} <span aria-hidden="true">↗</span></Link>
          </article>)}
        </div>
      </section>

      <section className="new-how">
        <div><span className="new-section-caption">GET STARTED / 003</span><h2>Built around<br /><em>your choices.</em></h2></div>
        <div className="new-how-steps">
          <div><span>01</span><strong>Create your identity</strong><p>Sign up and give your ECHO a name, personality and purpose.</p></div>
          <div><span>02</span><strong>Set your boundaries</strong><p>Choose your knowledge, privacy settings and public presence.</p></div>
          <div><span>03</span><strong>Explore the possibilities</strong><p>Enter Studio, try supported avatar experiences and connect in World.</p></div>
        </div>
      </section>

      <section className="new-home-cta">
        <span className="new-section-caption">YOUR NEXT CHAPTER</span>
        <h2>Make room for<br /><em>your next connection.</em></h2>
        <p>Your ECHO starts with you. Build it at your own pace.</p>
        <Link className="button" href="/register">Get started with ECHO <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </Layout>;
}
