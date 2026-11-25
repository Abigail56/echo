import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { auth } from '../lib/api';

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true">
    <path d="M7 9h28M7 21h20M7 33h28" />
    <path d="M27 21c7 0 8-12 1-12M21 21c-7 0-8 12-1 12" />
  </svg>;
}

function NavLink({ href, children, number, active, onClick }: {
  href: string;
  children: React.ReactNode;
  number: string;
  active: boolean;
  onClick?: () => void;
}) {
  return <Link href={href} className={`side-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
    <span className="side-link-number">{number}</span><span>{children}</span>
  </Link>;
}

export default function Layout({ children, loggedIn = false }: { children: React.ReactNode; loggedIn?: boolean }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentPath = router.asPath.split('?')[0];
  const worldActive = currentPath.startsWith('/world') || currentPath.startsWith('/e/');
  const studioActive = currentPath.startsWith('/dashboard') || currentPath.startsWith('/creator') ||
    currentPath.startsWith('/avatar-lab') || currentPath.startsWith('/meeting');

  if (!loggedIn) {
    return <div className="shell public-shell">
      <header className="public-header">
        <Link href="/" className="brand-lockup" aria-label="ECHO home"><BrandMark /><span>ECHO</span></Link>
        <nav className="public-nav" aria-label="Main navigation">
          <Link href="/#presence">The presence layer</Link>
          <Link href="/world">ECHO World</Link>
          <Link href="/login">Sign in</Link>
          <Link className="button button-outline small" href="/register">Enter ECHO <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <span>Independent intelligence. Human by design.</span>
        <span>Portrait photography via <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">Unsplash License</a></span>
      </footer>
    </div>;
  }

  return <div className={`shell workspace-shell ${menuOpen ? 'menu-open' : ''}`}>
    <aside className="workspace-sidebar">
      <Link href="/dashboard" className="brand-lockup" aria-label="ECHO Studio home"><BrandMark /><span>ECHO</span></Link>
      <div className="workspace-label"><span className="live-indicator" /> PERSONAL INTELLIGENCE</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <p className="nav-section-label">STUDIO</p>
        <NavLink href="/dashboard" number="01" active={currentPath === '/dashboard' || currentPath.startsWith('/dashboard/') } onClick={() => setMenuOpen(false)}>Overview</NavLink>
        <NavLink href="/creator" number="02" active={currentPath === '/creator'} onClick={() => setMenuOpen(false)}>Create an ECHO</NavLink>
        <NavLink href="/avatar-lab" number="03" active={currentPath === '/avatar-lab'} onClick={() => setMenuOpen(false)}>Avatar Studio</NavLink>
        <NavLink href="/meeting" number="04" active={currentPath === '/meeting'} onClick={() => setMenuOpen(false)}>Live presence</NavLink>
        <p className="nav-section-label nav-section-world">WORLD</p>
        <NavLink href="/world" number="05" active={currentPath === '/world' || currentPath.startsWith('/world/community')} onClick={() => setMenuOpen(false)}>Discover</NavLink>
        <NavLink href="/world/rooms" number="06" active={currentPath === '/world/rooms' || currentPath.startsWith('/world/room') || currentPath.startsWith('/world/immersive')} onClick={() => setMenuOpen(false)}>Rooms</NavLink>
        <NavLink href="/world/inbox" number="07" active={currentPath === '/world/inbox'} onClick={() => setMenuOpen(false)}>Introductions</NavLink>
      </nav>
      <div className="sidebar-bottom">
        <Link href="/billing" className={`side-link ${currentPath === '/billing' ? 'is-active' : ''}`} onClick={() => setMenuOpen(false)}>
          <span className="side-link-number">08</span><span>Account & usage</span>
        </Link>
        <div className="sidebar-note"><span>YOUR DIGITAL PRESENCE</span><strong>Always yours to direct.</strong></div>
        <button className="logout-button" onClick={async () => { await auth.logout(); router.push('/login'); }}>Sign out <span aria-hidden="true">↗</span></button>
      </div>
    </aside>
    {menuOpen ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} /> : null}
    <div className="workspace-main">
      <header className="workspace-topbar">
        <button className="mobile-menu-button" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
          <span /><span />
        </button>
        <div className="workspace-breadcrumb"><span>ECHO</span><i>/</i><span>{worldActive ? 'WORLD' : studioActive ? 'STUDIO' : 'ACCOUNT'}</span></div>
        <Link className="button button-outline small workspace-cta" href="/creator">Create ECHO <span aria-hidden="true">↗</span></Link>
      </header>
      {children}
      <footer className="workspace-footer"><span>ECHO · Personal intelligence, human by design</span><span>AI identities disclose their nature. You remain in control.</span></footer>
    </div>
  </div>;
}
