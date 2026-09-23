import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  getMembers, subscribeToMembers, isMemberByEmail, removeMember, toggleMainFounder,
  getDelegates, subscribeToDelegates, isDelegateByEmail, updateDelegate, removeDelegate,
  promoteEarliestDelegate, type Member, type Delegate,
} from './storage';
import { getCachedGoogleUser, type GoogleUser } from './googleAuth';
import ChamberMap, { mapMotion } from './components/ChamberMap';
import { DEMO, demoMembers, demoDelegates } from './demo';
import { HallOfFounders, type EnrichedMember } from './components/Council';
import {
  MAX, SCHOOL, AuthModal, RegistrationModal, ProfileEditorModal, FounderDetailModal,
  Credential, DelegateModal, DelegateDetailModal, GoogleIcon, Monogram, Dialog,
} from './components/Modals';
import {
  useSmoothScroll, useChoreography, useNavTheme, useReveal, useScrollLock,
  scrollToId, prefersReducedMotion,
} from './motion';

const ADMIN_EMAIL = 'lucas1121.lin@gmail.com';
const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

const CHAPTERS = [
  { id: 'hero', label: 'The Chamber' },
  { id: 'value', label: 'The Resolution' },
  { id: 'hall', label: 'The Founders' },
  { id: 'delegation', label: 'The Delegation' },
  { id: 'about', label: 'The Mission' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/* ─── Typographic helpers ─── */
/* A line inside a mask. GSAP moves .line-inner; CSS intro animations move .line-rise. */
function Line({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return (
    <span className="line">
      <span className="line-inner">
        <span className="line-rise" style={{ ['--i' as any]: i }}>{children}</span>
      </span>
    </span>
  );
}

/* Words that light up as they are read. */
function ReadAlong({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`manifesto-text ${className ?? ''}`}>
      {text.split(' ').map((w, i) => <span key={i} className="w">{w} </span>)}
    </p>
  );
}

/* ─── Intro: the document symbol is set, a rule is drawn, the curtain lifts. ─── */
const INTRO_KEY = 'yhmun-intro-seen';
function Curtain({ onLift }: { onLift: () => void }) {
  const [show] = useState(() => {
    try { return !prefersReducedMotion() && !sessionStorage.getItem(INTRO_KEY); } catch { return false; }
  });
  const [gone, setGone] = useState(!show);

  useEffect(() => {
    if (!show) { onLift(); return; }
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* private mode */ }
    const t = setTimeout(onLift, 1250);
    return () => clearTimeout(t);
  }, [show, onLift]);

  if (gone) return null;
  const symbol = 'YH/MUN/2026/1';
  return (
    <div className="curtain" aria-hidden="true" onAnimationEnd={(e) => { if (e.target === e.currentTarget) setGone(true); }}>
      <div className="curtain-inner">
        <span className="curtain-symbol">
          {symbol.split('').map((c, i) => <span key={i} style={{ ['--i' as any]: i }}>{c}</span>)}
        </span>
        <span className="curtain-rule" />
        <span className="curtain-name">{SCHOOL} Model United Nations</span>
      </div>
    </div>
  );
}

/* ─── Ambient sound (procedural drone) ─── */
function AudioToggle() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const ensureGraph = () => {
    if (ctxRef.current) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    filter.Q.value = 0.6;
    filter.connect(master);
    [110, 164.81, 220, 277.18].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 3 ? 'triangle' : 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(g); g.connect(filter); osc.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.025;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 2.2;
      lfo.connect(lfoG); lfoG.connect(osc.detune); lfo.start();
    });
    ctxRef.current = ctx;
    masterRef.current = master;
  };

  const toggle = () => {
    ensureGraph();
    const ctx = ctxRef.current!;
    const master = masterRef.current!;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(playing ? 0 : 0.1, ctx.currentTime + (playing ? 0.8 : 1.4));
    setPlaying((p) => !p);
  };

  return (
    <button className={`sound ${playing ? 'is-on' : ''}`} onClick={toggle} aria-pressed={playing} aria-label="Ambient sound">
      <span className="sound-bars" aria-hidden="true"><span /><span /><span /><span /></span>
      <span className="sound-label">{playing ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}

/* ─── Navigation ─── */
function Nav({ theme, seatsLeft, full, person, onLogin, onMenu }: {
  theme: string;
  seatsLeft: number;
  full: boolean;
  person: (Member | Delegate) | null;
  onLogin: () => void;
  onMenu: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`nav theme-${theme} ${scrolled ? 'is-scrolled' : ''}`} aria-label="Main">
      <button className="nav-mark" onClick={() => scrollToId('hero')} aria-label={`${SCHOOL} MUN, back to top`}>
        <EmblemMark /> <span>{SCHOOL} <em>MUN</em></span>
      </button>
      <div className="nav-right">
        <span className="nav-status num" aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {full ? 'Charter sealed' : `${pad2(seatsLeft)} seat${seatsLeft !== 1 ? 's' : ''} open`}
        </span>
        <button className="nav-login" onClick={onLogin}>
          {person
            ? <>{person.avatar ? <img src={person.avatar} className="avatar avatar-xs" alt="" /> : <Monogram name={person.fullName} size="sm" />}<span>Profile</span></>
            : <><GoogleIcon /><span>Sign in</span></>}
        </button>
        <button className="nav-menu" onClick={onMenu} aria-label="Open menu">
          <span className="nav-menu-lines" aria-hidden="true"><span /><span /></span>
          <span className="nav-menu-text">Menu</span>
        </button>
      </div>
    </nav>
  );
}

/* A small drawn version of the emblem's graticule. */
function EmblemMark() {
  return (
    <svg className="emblem-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" /><circle cx="16" cy="16" r="9.5" /><circle cx="16" cy="16" r="5" />
      <path d="M16 2v28M2 16h28M6.1 6.1l19.8 19.8M25.9 6.1L6.1 25.9" />
    </svg>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  useScrollLock(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const go = (id: string) => { onClose(); setTimeout(() => scrollToId(id), 60); };
  return (
    <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <button className="menu-close" onClick={onClose} aria-label="Close menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <ol className="menu-list">
        {CHAPTERS.map((c, i) => (
          <li key={c.id} style={{ ['--i' as any]: i }}>
            <button ref={i === 0 ? firstRef : undefined} className="menu-link" onClick={() => go(c.id)}>{c.label}</button>
          </li>
        ))}
      </ol>
      <div className="menu-foot">
        <AudioToggle />
        <a href="https://www.instagram.com/lucasruslim/" target="_blank" rel="noopener noreferrer">Instagram @lucasruslim</a>
      </div>
    </div>
  );
}

/* ─── Seats counter: fifteen ticks, one per seat ─── */
function SeatTally({ count }: { count: number }) {
  return (
    <div className="tally" role="img" aria-label={`${count} of ${MAX} founding seats claimed`}>
      <div className="tally-figure num"><span>{pad2(count)}</span><span className="tally-of">/{MAX}</span></div>
      <div className="tally-ticks" aria-hidden="true">
        {Array.from({ length: MAX }, (_, i) => <span key={i} className={i < count ? 'is-on' : ''} style={{ ['--i' as any]: i }} />)}
      </div>
      <div className="tally-label">founding seats claimed</div>
    </div>
  );
}

/* ─── Delegation: the roll call ─── */
function Delegation({ delegates, onJoin, onSelect, loggedInDelegate, isFounder, onEditProfile }: {
  delegates: Delegate[];
  onJoin: () => void;
  onSelect: (d: Delegate) => void;
  loggedInDelegate: Delegate | null;
  isFounder: boolean;
  onEditProfile: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useReveal(listRef);
  return (
    <section className="delegation" id="delegation" data-theme="ink">
      <div className="container delegation-grid">
        <header className="section-head is-left delegation-head">
          <h2 className="display-2 rise"><Line>The</Line> <Line><em>Delegation</em></Line></h2>
          <p className="lede">The council seats fifteen. The cause belongs to everyone who answers it. Founding Delegates stand on the record beside the founders, without limit.</p>
          <p className="roll-count num"><strong>{pad2(delegates.length)}</strong> {delegates.length === 1 ? 'delegate present' : 'delegates present'}</p>
          <div className="delegation-cta">
            {loggedInDelegate ? (
              <>
                <button className="btn btn-primary" onClick={onEditProfile}>Edit your delegate profile</button>
                <p className="fine">You are Founding Delegate {loggedInDelegate.delegateNumber}.</p>
              </>
            ) : isFounder ? (
              <p className="fine">You hold a founding seat. Your place is at the table above.</p>
            ) : (
              <>
                <button className="btn btn-primary" onClick={onJoin}>Answer the roll</button>
                <p className="fine">Unlimited places. Your name is recorded permanently.</p>
              </>
            )}
          </div>
        </header>

        <ol ref={listRef} className="roll" aria-label="Founding Delegates">
          {delegates.length > 0 ? delegates.map((d, i) => (
            <li key={d.id} className="roll-item" style={{ ['--i' as any]: Math.min(i, 12) }}>
              <button className="roll-row" onClick={() => onSelect(d)}>
                <span className="roll-no num">{pad2(d.delegateNumber ?? i + 1)}</span>
                {d.avatar ? <img src={d.avatar} className="avatar avatar-sm" alt="" /> : <Monogram name={d.fullName} size="sm" />}
                <span className="roll-name">{d.fullName}</span>
                <span className="roll-meta num">{d.grade} · {d.classGroup}</span>
                <span className="roll-present">Present</span>
              </button>
            </li>
          )) : (
            <li className="roll-item roll-empty">
              <span className="roll-name">The floor is open.</span>
              <span className="roll-meta">Be the first delegate to answer the roll.</span>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [members, setMembers] = useState<Member[]>(DEMO ? demoMembers : getMembers());
  const [modalOpen, setModalOpen] = useState(false);
  const [certificate, setCertificate] = useState<Member | null>(DEMO && window.location.search.includes('credential') ? demoMembers[3] : null);
  const [sealedShown, setSealedShown] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navTheme, setNavTheme] = useState('ink');
  const [lifted, setLifted] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState<Member | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<EnrichedMember | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(getCachedGoogleUser());
  const [adminEditMember, setAdminEditMember] = useState<Member | null>(null);

  /* Founding Delegates (unlimited tier) */
  const [delegates, setDelegates] = useState<Delegate[]>(DEMO ? demoDelegates : getDelegates());
  const [loggedInDelegate, setLoggedInDelegate] = useState<Delegate | null>(null);
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);
  const [delegateProfileOpen, setDelegateProfileOpen] = useState(false);
  const [selectedDelegate, setSelectedDelegate] = useState<Delegate | null>(null);
  const [adminEditDelegate, setAdminEditDelegate] = useState<Delegate | null>(null);

  const isAdmin = isAdminEmail(adminEmail);
  const count = members.length;
  const remaining = MAX - count;
  const urgent = count >= 13 && count < MAX;
  const full = count >= MAX;
  const loggedInPerson = loggedInUser || loggedInDelegate;

  let regularCount = 0;
  const enrichedMembers: EnrichedMember[] = members.map((m) => {
    if (m.isMainFounder) return { ...m, displayTitle: 'Main Founder' };
    regularCount++;
    return { ...m, displayTitle: `Founding Member ${regularCount}` };
  });

  const onLift = useCallback(() => {
    mapMotion.introAt = performance.now();
    setLifted(true);
  }, []);

  useSmoothScroll();
  useChoreography();
  useNavTheme(setNavTheme);

  useEffect(() => {
    if (DEMO) return;
    const unsubscribe = subscribeToMembers((newMembers) => {
      setMembers([...newMembers]);
      setLoggedInUser((prev) => (prev ? newMembers.find((m) => m.email === prev.email) || null : null));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (DEMO) return;
    const unsubscribe = subscribeToDelegates((newDelegates) => {
      setDelegates([...newDelegates]);
      setLoggedInDelegate((prev) => (prev ? newDelegates.find((d) => d.email === prev.email) || null : null));
    });
    return () => unsubscribe();
  }, []);

  const refresh = useCallback(() => {}, []);
  const [authMode, setAuthMode] = useState<null | 'login' | 'claim' | 'admin'>(null);

  /* Apply a freshly signed-in user, then route based on what they were doing. */
  const proceedWithUser = (user: GoogleUser, mode: 'login' | 'claim' | 'admin') => {
    setGoogleUser(user);
    if (isAdminEmail(user.email)) setAdminEmail(user.email);
    const member = isMemberByEmail(user.email);
    const delegate = isDelegateByEmail(user.email);
    if (member) setLoggedInUser(member);
    if (delegate) setLoggedInDelegate(delegate);
    setAuthMode(null);
    if (mode === 'login') {
      if (member) setProfileModalOpen(true);
      else if (delegate) setDelegateProfileOpen(true);
      else if (!isAdminEmail(user.email)) alert("You haven't joined yet. Claim a founding seat or answer the roll as a Founding Delegate first.");
    } else if (mode === 'claim') {
      setModalOpen(true);
    } else if (mode === 'admin') {
      if (!isAdminEmail(user.email)) alert('Access denied. You are not the administrator.');
    }
  };

  /* Single entry point. Reuses an existing session; otherwise opens the sign-in modal. */
  const startAuth = (mode: 'login' | 'claim' | 'admin') => {
    if (mode === 'login' && loggedInUser) { setProfileModalOpen(true); return; }
    if (mode === 'login' && loggedInDelegate) { setDelegateProfileOpen(true); return; }
    const existing = googleUser || getCachedGoogleUser();
    if (existing) { proceedWithUser(existing, mode); return; }
    setAuthMode(mode);
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from the Founding Members? This cannot be undone.`)) {
      await removeMember(id);
      // If a delegate is waiting, the longest-waiting one fills the freed seat so
      // the council stays at 15. If none are waiting, the seat opens for new founders.
      await promoteEarliestDelegate();
    }
  };

  const handleDeleteDelegate = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from the Founding Delegates? This cannot be undone.`)) await removeDelegate(id);
  };

  const handleSuccess = (m: Member) => {
    setModalOpen(false);
    setCertificate(m);
    setLoggedInUser(m);
    if (members.length + 1 >= MAX && !sealedShown) setTimeout(() => setSealedShown(true), 3500);
  };

  /* One primary action, chosen by who is looking. */
  const primary: { label: string; note: string; run: () => void } = loggedInUser
    ? { label: 'Take your seat', note: `Welcome back, ${loggedInUser.firstName}. You hold seat ${loggedInUser.memberNumber}.`, run: () => scrollToId('hall') }
    : loggedInDelegate
      ? { label: 'See the delegation', note: `Welcome back, ${loggedInDelegate.firstName}. Founding Delegate ${loggedInDelegate.delegateNumber}.`, run: () => scrollToId('delegation') }
      : (!full && delegates.length === 0)
        ? { label: 'Claim a founding seat', note: 'Takes a minute. Stays on the record for good.', run: () => startAuth('claim') }
        : { label: 'Join the delegation', note: 'Unlimited places. Your name still stands on the founding record.', run: () => setDelegateModalOpen(true) };

  const heroLines = full ? ['The fifteen', 'are chosen.'] : ['Be one of', 'the fifteen.'];
  const heroSub = full
    ? 'The founding council is complete. The delegation stays open to everyone who wants their name on the record.'
    : urgent
      ? `Only ${remaining} seat${remaining !== 1 ? 's' : ''} left. When they are gone, the charter closes for good.`
      : 'Youhua Model United Nations is being founded now. Fifteen founding seats, each name engraved on the register. When they are gone, the charter closes.';

  const recordNames = [...members.map((m) => m.firstName), ...delegates.map((d) => d.firstName)];

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Curtain onLift={onLift} />
      <Nav theme={navTheme} seatsLeft={remaining} full={full} person={loggedInPerson} onLogin={() => startAuth('login')} onMenu={() => setMenuOpen(true)} />
      {menuOpen && <Menu onClose={() => setMenuOpen(false)} />}

      {!isAdmin ? (
        <button className="admin-key" onClick={() => startAuth('admin')} aria-label="Administrator sign in">
          <EmblemMark />
        </button>
      ) : (
        <div className="admin-badge">
          Admin
          <button onClick={() => setAdminEmail(null)} aria-label="Leave admin mode">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}

      <main id="main">
        {/* ① Hero: the map assembles, then tilts down into a floor as you scroll */}
        <section className={`hero ${lifted ? 'is-lifted' : ''}`} id="hero" data-theme="ink">
          <div className="hero-stage">
            <ChamberMap claimed={count} />
            <div className="hero-grid container">
              <div className="hero-meta">
                <div className="hero-in">
                  <span>{SCHOOL} School</span>
                  <span>Model United Nations</span>
                  <span className="num">Est. 2026</span>
                </div>
              </div>
              <h1 className="hero-headline" aria-label={heroLines.join(' ')}>
                <Line i={0}>{heroLines[0]}</Line>
                <Line i={1}><em>{heroLines[1]}</em></Line>
              </h1>
              <div className="hero-aside">
                <div className="hero-in">
                  <p className="hero-sub">{heroSub}</p>
                  <SeatTally count={count} />
                  <div className="cta-block">
                    <button className="btn btn-primary btn-lg" onClick={primary.run}>
                      {primary.label}
                      <svg className="btn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                    <p className="fine">{primary.note}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-scroll" aria-hidden="true"><span /></div>
          </div>
        </section>

        {/* ② Manifesto: drenched in UN blue, words light as they are read */}
        <section className="manifesto" data-theme="blue" aria-label="Manifesto">
          <div className="container">
            <ReadAlong text="In 1945 the United Nations began with fifty-one founding members and a single charter. Every debate since started there." />
            <ReadAlong className="is-strong" text="Youhua MUN begins the same way: with a charter, and fifteen people willing to sign it first." />
          </div>
        </section>

        {/* ③ The Resolution: what a founding seat means, drafted the way MUN drafts it */}
        <section className="resolution" id="value" data-theme="paper">
          <div className="container resolution-grid">
            <header className="doc-head">
              <div className="doc-meta num">
                <span>Distr.: General</span>
                <span>Original: English</span>
                <span>Session 2026</span>
              </div>
              <div className="doc-symbol">Draft resolution YH/MUN/2026/L.1</div>
              <h2 className="display-2">What a founding seat <em>means</em></h2>
              <p className="doc-sponsor">Submitted by the Founding Council</p>
            </header>

            <div className="clauses">
              <p className="clause is-pre"><em>Recognizing</em> that every institution starts with the people who show up before it exists,</p>
              <p className="clause is-pre"><em>Noting</em> that a founding seat can be held by fifteen students, and never again,</p>
              <ol className="operative">
                <li className="clause"><span className="verb">Resolves<span className="verb-rule" /></span> that each Founding Member's name be engraved in the Hall of Founders on this site, as a lasting record rather than a temporary badge;</li>
                <li className="clause"><span className="verb">Affirms<span className="verb-rule" /></span> that Founding Member status is a verifiable leadership credential, fit for the Common App, UCAS, or any university portfolio;</li>
                <li className="clause"><span className="verb">Entrusts<span className="verb-rule" /></span> the first fifteen with shaping the culture, traditions and direction of the club;</li>
                <li className="clause"><span className="verb">Decides<span className="verb-rule" /></span> to remain actively seized of the matter.</li>
              </ol>
              <div className="clause signature">
                <div className="sign-line">
                  <span className="sign-name">{loggedInUser ? loggedInUser.fullName : ''}</span>
                </div>
                <div className="sign-row">
                  <span className="fine">{loggedInUser ? `Signed, seat ${loggedInUser.memberNumber} of ${MAX}` : 'Signature of a founding member'}</span>
                  {!loggedInUser && !loggedInDelegate && !full && (
                    <button className="btn btn-ink" onClick={() => startAuth('claim')}>Sign the charter</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ④ Hall of Founders */}
        <HallOfFounders members={enrichedMembers} onSeatClick={(m) => setSelectedFounder(m)} isAdmin={isAdmin} />

        {/* ⑤ Founding Delegates */}
        <Delegation
          delegates={delegates}
          loggedInDelegate={loggedInDelegate}
          isFounder={!!loggedInUser}
          onJoin={() => setDelegateModalOpen(true)}
          onEditProfile={() => setDelegateProfileOpen(true)}
          onSelect={(d) => setSelectedDelegate(d)}
        />

        {/* ⑥ The Mission: the General Assembly opens up, then three words */}
        <section className="assembly" id="about" data-theme="ink" aria-label="The Mission">
          <div className="assembly-frame">
            <img className="assembly-img" src="/un-hall.jpg" alt="The United Nations General Assembly Hall in New York, rows of delegate desks facing the gold emblem wall" />
          </div>
          <div className="assembly-caption container">
            <p className="display-2 on-photo"><Line>Where students stop</Line> <Line>being students and</Line> <Line><em>start being delegates.</em></Line></p>
          </div>
        </section>

        <section className="lexicon" data-theme="ink" aria-label="What Model UN teaches">
          <div className="container">
            <dl className="lex">
              <div className="lex-row"><dt className="lex-word">Debate</dt><dd>Sharpen the argument. Learn to persuade, not just to speak.</dd></div>
              <div className="lex-row"><dt className="lex-word"><em>Diplomacy</em></dt><dd>Navigate complexity. Find consensus where others only see conflict.</dd></div>
              <div className="lex-row"><dt className="lex-word">Impact</dt><dd>Move past the classroom. Shape policy, and with it a little of the world.</dd></div>
            </dl>
            <figure className="quote">
              <blockquote className="rise"><Line>“Education is the most powerful weapon</Line> <Line>which you can use to change the world.”</Line></blockquote>
              <figcaption>Nelson Mandela</figcaption>
            </figure>
          </div>
        </section>

        {/* ⑦ Closing call: one decision, drenched in blue */}
        <section className="closing" id="join" data-theme="blue">
          <div className="container closing-inner">
            <h2 className="display-1 rise">
              {full ? <><Line>The charter</Line> <Line><em>is sealed.</em></Line></> : <><Line>The charter</Line> <Line><em>is open.</em></Line></>}
            </h2>
            <div className="closing-side">
              <p className="lede">{full ? 'Fifteen names are on the register. The delegation is still taking names.' : `${remaining} of ${MAX} founding seats are still open. After that, the title closes for good.`}</p>
              <button className="btn btn-ink btn-lg" onClick={primary.run}>{primary.label}</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer" data-theme="ink">
        {recordNames.length > 0 && (
          <div className="record" aria-label="Names on the record">
            <div className="record-track">
              {[0, 1].map((k) => (
                <span key={k} className="record-set" aria-hidden={k === 1}>
                  {recordNames.map((n, i) => <span key={i}>{n}</span>)}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="container footer-grid">
          <div>
            <p className="footer-tag">Shaped by fifteen. Built for the world.</p>
            <p className="fine">{SCHOOL} School Model United Nations, established 2026.</p>
          </div>
          <div className="footer-links">
            <span className="field-label">Contact</span>
            <a href="https://www.instagram.com/lucasruslim/" target="_blank" rel="noopener noreferrer">Instagram @lucasruslim</a>
            <AudioToggle />
          </div>
        </div>
        <div className="wordmark" aria-hidden="true">
          {`${SCHOOL} MUN`.split('').map((c, i) => <span key={i} className="ch-mask"><span className="ch">{c === ' ' ? ' ' : c}</span></span>)}
        </div>
        <div className="container footer-legal">
          <span>© 2026 {SCHOOL} MUN. Every founding seat is recorded here for good.</span>
          <span>
            Photo: UN General Assembly Hall by Patrick Gruban,{' '}
            <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 2.0</a>
          </span>
        </div>
      </footer>

      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onUser={(u) => proceedWithUser(u, authMode)} />}
      {modalOpen && <RegistrationModal onClose={() => setModalOpen(false)} onSuccess={handleSuccess} count={count} preAuth={googleUser} />}
      {profileModalOpen && loggedInUser && <ProfileEditorModal member={loggedInUser} onClose={() => setProfileModalOpen(false)} onUpdate={refresh} />}
      {adminEditMember && <ProfileEditorModal member={adminEditMember} onClose={() => setAdminEditMember(null)} onUpdate={refresh} />}
      {selectedFounder && (
        <FounderDetailModal
          member={selectedFounder}
          displayTitle={selectedFounder.displayTitle}
          onClose={() => setSelectedFounder(null)}
          isAdmin={isAdmin}
          onAdminEdit={(m) => { setSelectedFounder(null); setAdminEditMember(m); }}
          onToggleMain={async (id, isMain) => { await toggleMainFounder(id, isMain); setSelectedFounder(null); }}
          onDelete={async (id, name) => { await handleDeleteMember(id, name); setSelectedFounder(null); }}
        />
      )}
      {certificate && <Credential member={certificate} onClose={() => setCertificate(null)} />}

      {delegateModalOpen && (
        <DelegateModal onClose={() => setDelegateModalOpen(false)} onSuccess={(d) => setLoggedInDelegate(d)} preAuth={googleUser} />
      )}
      {delegateProfileOpen && loggedInDelegate && (
        <ProfileEditorModal
          member={loggedInDelegate as unknown as Member}
          numberLabel={`Founding Delegate ${loggedInDelegate.delegateNumber}`}
          saveFn={updateDelegate}
          onClose={() => setDelegateProfileOpen(false)}
          onUpdate={refresh}
        />
      )}
      {adminEditDelegate && (
        <ProfileEditorModal
          member={adminEditDelegate as unknown as Member}
          numberLabel={`Founding Delegate ${adminEditDelegate.delegateNumber}`}
          saveFn={updateDelegate}
          onClose={() => setAdminEditDelegate(null)}
          onUpdate={refresh}
        />
      )}
      {selectedDelegate && (
        <DelegateDetailModal
          delegate={selectedDelegate}
          onClose={() => setSelectedDelegate(null)}
          isAdmin={isAdmin}
          onAdminEdit={(d) => { setSelectedDelegate(null); setAdminEditDelegate(d); }}
          onDelete={async (id, name) => { await handleDeleteDelegate(id, name); setSelectedDelegate(null); }}
        />
      )}

      {sealedShown && full && (
        <Dialog onClose={() => setSealedShown(false)} label="The charter is sealed" tone="ink">
          <div className="sealed">
            <div className="sealed-stamp" aria-hidden="true">Sealed</div>
            <h2 className="dialog-title">The chamber is sealed.</h2>
            <p className="dialog-sub">All fifteen founding members have been chosen. The charter is complete.</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
