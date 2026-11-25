import Link from 'next/link';
import Layout from '../components/Layout';

const portrait = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=88';

function FiberTrace() {
  return <svg className="fiber-trace" viewBox="0 0 760 680" fill="none" aria-hidden="true">
    <path d="M760 68C584 68 641 228 468 228S305 87 169 184 179 413 17 488" />
    <path d="M760 96C596 96 658 255 480 255S308 124 185 214 191 429 28 511" />
    <path d="M760 124C611 124 677 281 491 281S312 161 201 244 206 446 39 534" />
    <path d="M760 152C629 152 695 307 503 307S317 198 217 274 221 464 50 557" />
    <path d="M760 180C647 180 713 334 514 334S322 235 233 304 235 481 61 580" />
    <circle cx="480" cy="255" r="3" /><circle cx="217" cy="274" r="3" />
  </svg>;
}

export default function Home() {
  return <Layout>
    <main className="landing-page">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> A NEW LAYER OF HUMAN PRESENCE</div>
          <h1>Your presence.<br /><span>Beyond boundaries.</span></h1>
          <p className="hero-lede">A digital presence that carries your point of view into every room, relationship and opportunity — on your terms.</p>
          <div className="hero-actions">
            <Link className="button" href="/register">Create your ECHO <span aria-hidden="true">↗</span></Link>
            <Link className="text-link" href="/world">Explore ECHO World <span aria-hidden="true">→</span></Link>
          </div>
          <div className="hero-index"><span>01 — 03</span><span>INTELLIGENCE THAT TRAVELS WITH YOU</span></div>
        </div>
        <div className="hero-art" aria-label="Portrait representing human presence and global connection">
          <FiberTrace />
          <div className="hero-portrait-frame">
            <img src={portrait} alt="Editorial portrait representing the human presence behind an ECHO" />
            <div className="portrait-shade" />
            <div className="portrait-caption"><span className="signal-dot" /> HUMAN SIGNAL <span>01 / 03</span></div>
          </div>
          <div className="hero-art-note"><span>01</span><span>PERSONAL INTELLIGENCE<br />BUILT AROUND YOU</span></div>
        </div>
        <div className="hero-side-label">ECHO / PERSONAL INTELLIGENCE</div>
      </section>

      <section className="manifesto-section" id="presence">
        <div className="section-kicker">01 / THE PRESENCE LAYER</div>
        <div className="manifesto-grid">
          <h2>Not another profile.<br /><span>A point of view.</span></h2>
          <div>
            <p>Your ECHO is a digital representative shaped by the knowledge you choose to share. It can introduce your work, hold a conversation and bring your perspective into ECHO World.</p>
            <Link href="/register" className="text-link">Build your presence <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="experience-section">
        <div className="experience-heading">
          <div className="section-kicker">02 / ONE IDENTITY, MANY ROOMS</div>
          <p>Designed for real human connection.<br />Built for a world without borders.</p>
        </div>
        <div className="experience-grid">
          <article className="experience-feature experience-studio">
            <div className="feature-number">01</div>
            <div className="feature-copy"><h3>Your Studio</h3><p>Shape what your ECHO knows, how it speaks and what it shares. You set the boundaries.</p><Link href="/dashboard" className="text-link">Enter Studio <span aria-hidden="true">↗</span></Link></div>
            <div className="studio-mark" aria-hidden="true"><span>E</span><i /><b /></div>
          </article>
          <article className="experience-feature experience-world">
            <div className="feature-number">02</div>
            <div className="feature-copy"><h3>ECHO World</h3><p>Meet new perspectives, find your communities and make thoughtful introductions.</p><Link href="/world" className="text-link">Discover the World <span aria-hidden="true">↗</span></Link></div>
            <div className="world-mark" aria-hidden="true"><i /><i /><i /><i /><b /></div>
          </article>
          <article className="experience-feature experience-live">
            <div className="feature-number">03</div>
            <div className="feature-copy"><h3>Live Presence</h3><p>Bring a provider-backed video avatar into your browser. External meeting support is clearly marked by availability.</p><Link href="/meeting" className="text-link">Prepare a session <span aria-hidden="true">↗</span></Link></div>
            <div className="live-mark"><img src={portrait} alt="" /><span>LIVE<br />PRESENCE</span></div>
          </article>
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-art"><FiberTrace /><span className="closing-index">ECHO / 2025</span></div>
        <div className="closing-copy"><div className="section-kicker">03 / YOUR NEXT ROOM IS CLOSER</div><h2>Take your perspective<br />with you.</h2><p>Build a presence that moves with your work, your community and your curiosity.</p><Link className="button" href="/register">Begin with ECHO <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  </Layout>;
}
