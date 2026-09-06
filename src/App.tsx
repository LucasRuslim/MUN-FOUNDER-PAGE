import { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';
// @ts-ignore
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getMembers, subscribeToMembers, addMember, isMemberByEmail, removeMember, updateMember, toggleMainFounder, getDelegates, subscribeToDelegates, addDelegate, isDelegateByEmail, updateDelegate, removeDelegate, promoteEarliestDelegate, reorderMembers, setBesties, clearBesties, type Member, type Delegate } from './storage';
import { useInView } from './useInView';
import { signInWithGoogle, getCachedGoogleUser, renderGoogleButton, type GoogleUser } from './googleAuth';

gsap.registerPlugin(ScrollTrigger);

const MAX = 15;
const SCHOOL = 'Youhua';
const ADMIN_EMAIL = 'lucas1121.lin@gmail.com';
const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

/* Chapters used by the scroll rail + side menu */
const CHAPTERS = [
  { id: 'hero',  label: 'The Chamber' },
  { id: 'value', label: 'The Privilege' },
  { id: 'hall',  label: 'The Founders' },
  { id: 'delegation', label: 'The Delegation' },
  { id: 'about', label: 'The Mission' },
];

/* Module-level smooth-scroll instance so the rail/menu can drive it */
let lenisInstance: any = null;
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisInstance) lenisInstance.scrollTo(el, { offset: -40, duration: 1.4 });
  else el.scrollIntoView({ behavior: 'smooth' });
}

const CONFETTI_BLUES = ['#4c8dff', '#84b6ff', '#2f63d6', '#c4dbff', '#eef3fb'];

/* Distinct, warm-leaning glow colors for bestie pairs so they pop against the blue council */
const BESTIE_COLORS = ['#ff7eb6', '#a78bfa', '#5eead4', '#fcd34d', '#fca5a5', '#7dd3fc', '#86efac', '#f0abfc'];
function nextBestieColor(members: { bestieColor?: string }[]): string {
  const used = new Set(members.map(m => m.bestieColor).filter(Boolean) as string[]);
  return BESTIE_COLORS.find(c => !used.has(c)) || BESTIE_COLORS[Math.floor(Math.random() * BESTIE_COLORS.length)];
}

/* ─── Smooth scroll (Lenis) + ScrollTrigger sync ─── */
function useSmoothScroll() {
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    lenisInstance = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);
}

/* ─── Word reveal headline ─── */
function WordRevealTitle({ text, loaded }: { text: string; loaded: boolean }) {
  const words = text.split(' ');
  return (
    <h1 className="typing-text" style={{ overflow: 'visible' }}>
      {words.map((word, i) => (
        <span key={i} className="hero-title-word" style={{ marginRight: '0.3em' }}>
          <span
            className="hero-title-word-inner"
            style={{
              animationDelay: loaded ? `${500 + i * 70}ms` : '9999s',
              animationPlayState: loaded ? 'running' : 'paused',
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </h1>
  );
}

/* ─── Progress Ring ─── */
function ProgressRing({ count }: { count: number }) {
  const r = 88;
  const circ = 2 * Math.PI * r;
  const offset = circ - (count / MAX) * circ;
  const urgent = count >= 13 && count < MAX;
  const full = count >= MAX;

  return (
    <div className="ring-container">
      <svg viewBox="0 0 210 210">
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2f63d6" />
            <stop offset="55%" stopColor="#4c8dff" />
            <stop offset="100%" stopColor="#84b6ff" />
          </linearGradient>
        </defs>
        <circle cx="105" cy="105" r={r} className="ring-bg" />
        <circle
          cx="105" cy="105" r={r}
          className={`ring-fill ${urgent ? 'urgent' : ''} ${full ? 'full' : ''}`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-text">
        <span className="ring-number">{count}</span>
        <span className="ring-label">of {MAX} claimed</span>
      </div>
    </div>
  );
}

/* ─── Delegate Ring (open / unlimited — never "full") ─── */
function DelegateRing({ count }: { count: number }) {
  const r = 88;
  const circ = 2 * Math.PI * r;
  return (
    <div className="ring-container delegate-ring">
      <svg viewBox="0 0 210 210">
        <defs>
          <linearGradient id="delRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#84b6ff" />
            <stop offset="100%" stopColor="#c4dbff" />
          </linearGradient>
        </defs>
        <circle cx="105" cy="105" r={r} className="ring-bg" />
        <circle cx="105" cy="105" r={r} className="ring-open" strokeDasharray={`${circ * 0.16} ${circ * 0.09}`} />
      </svg>
      <div className="ring-text">
        <span className="ring-number">{count}</span>
        <span className="ring-label">delegates</span>
      </div>
    </div>
  );
}

/* ─── Loading Screen ─── */
function LoadingScreen({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // The intro lives INSIDE the hero — no overlay, no second element. The body gets
    // `intro-active` (dark, UI + bg hidden, globe large+bright). Removing it lets the
    // SAME hero globe zoom out + fade its colour into the background via CSS transition.
    document.body.classList.add('intro-active');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const settleDelay = reduced ? 0 : 2200;
    const t1 = setTimeout(() => {
      document.body.classList.remove('intro-active'); // triggers the globe zoom-out + scene reveal
      onReveal();
    }, settleDelay);
    // onDone fires after the 2s globe settle fully finishes → mouse parallax starts cleanly.
    const t2 = setTimeout(() => { setGone(true); onDone(); }, settleDelay + (reduced ? 0 : 2300));

    return () => { clearTimeout(t1); clearTimeout(t2); document.body.classList.remove('intro-active'); };
  }, [onReveal, onDone]);

  if (gone) return null;
  return <div className="intro-word">Youhua <span>MUN</span></div>;
}

/* ─── Magnetic CTA Button ─── */
function MagneticCta({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el || disabled) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * 0.28}px, ${y * 0.28}px)`;
  };
  const handleMouseLeave = () => { if (wrapRef.current) wrapRef.current.style.transform = ''; };
  return (
    <div ref={wrapRef} className="magnetic-wrapper" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <button className="cta-btn" onClick={onClick} disabled={disabled}>{children}</button>
    </div>
  );
}

/* ─── Scroll Progress Rail (left timeline) ─── */
function ScrollProgressRail() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = CHAPTERS.findIndex((c) => c.id === e.target.id);
            if (idx >= 0) setActive(idx);
          }
        });
      },
      { threshold: 0.01, rootMargin: '-45% 0px -45% 0px' }
    );
    CHAPTERS.forEach((c) => { const el = document.getElementById(c.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="scroll-rail">
      {CHAPTERS.map((c, i) => (
        <button
          key={c.id}
          className={`rail-node ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}`}
          onClick={() => scrollToId(c.id)}
          aria-label={`Go to ${c.label}`}
        >
          <span className="rail-line" />
          <span className="rail-diamond" />
          <span className="rail-label">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Navbar ─── */
function Navbar({ onMenu, seatsLeft, full }: { onMenu: () => void; seatsLeft: number; full: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <button className="nav-menu-btn" onClick={onMenu} aria-label="Open menu">
        <span className="nav-menu-lines"><span /><span /></span>
        <span className="nav-menu-text">Menu</span>
      </button>
      <div className="nav-crest">Youhua MUN</div>
      <div className="nav-status">
        <span className="live-dot" />
        <span className="nav-status-text">{full ? 'Charter Sealed' : `${seatsLeft} Seat${seatsLeft !== 1 ? 's' : ''} Remain`}</span>
      </div>
    </nav>
  );
}

/* ─── Slide-out Menu ─── */
function SideMenu({ onClose }: { onClose: () => void }) {
  const links = [
    { label: 'The Chamber', id: 'hero' },
    { label: 'The Privilege', id: 'value' },
    { label: 'The Founders', id: 'hall' },
    { label: 'The Delegation', id: 'delegation' },
    { label: 'The Mission', id: 'about' },
  ];
  const go = (id: string) => { onClose(); setTimeout(() => scrollToId(id), 220); };
  return (
    <>
      <div className="menu-overlay" onClick={onClose} />
      <div className="menu-panel">
        <button className="menu-close" onClick={onClose} aria-label="Close menu">×</button>
        {links.map((l) => (
          <button key={l.id} className="menu-link" onClick={() => go(l.id)}>
            <span className="menu-mark" aria-hidden="true">◆</span>{l.label}
          </button>
        ))}
        <div className="menu-footer">Youhua School · Model United Nations · Est. 2026</div>
      </div>
    </>
  );
}

/* ─── Audio Toggle (procedural ambient drone) ─── */
function AudioToggle() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const ensureGraph = () => {
    if (ctxRef.current) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    filter.Q.value = 0.6;
    filter.connect(master);
    // Soft sustained chord (A minor-ish pad)
    const freqs = [110, 164.81, 220, 277.18];
    freqs.forEach((f, i) => {
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
    if (!playing) master.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 1.4);
    else master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setPlaying((p) => !p);
  };

  return (
    <button className={`audio-toggle ${playing ? 'playing' : ''}`} onClick={toggle} aria-label="Toggle ambient sound">
      <span className="audio-bars"><span /><span /><span /><span /></span>
      <span className="audio-label">{playing ? 'Sound On' : 'Ambience'}</span>
    </button>
  );
}

/* ─── Sign-in Modal (reliable rendered Google button) ─── */
function AuthModal({ mode, onUser, onClose }: { mode: 'login' | 'claim' | 'admin'; onUser: (u: GoogleUser) => void; onClose: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const copy = {
    login: { title: 'Member Sign-In', sub: 'Sign in with Google to access your founding profile.' },
    claim: { title: 'Verify Your Identity', sub: 'Sign in with Google to secure your seat and prevent duplicates.' },
    admin: { title: 'Administrator Access', sub: 'Sign in with the administrator Google account.' },
  }[mode];

  useEffect(() => {
    let cancelled = false;
    if (btnRef.current) {
      renderGoogleButton(btnRef.current)
        .then((u) => { if (!cancelled) onUser(u); })
        .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title">{copy.title}</div>
        <p className="modal-subtitle">{copy.sub}</p>
        <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
        {err && <p style={{ color: 'var(--signal)', fontSize: '0.82rem', textAlign: 'center', marginTop: '1rem' }}>{err}</p>}
      </div>
    </div>
  );
}

/* ─── Google SVG Icon ─── */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

/* ─── Registration Modal ─── */
function RegistrationModal({ onClose, onSuccess, count, preAuth }: {
  onClose: () => void;
  onSuccess: (m: Member) => void;
  count: number;
  preAuth: GoogleUser | null;
}) {
  const [step, setStep] = useState<'auth' | 'form' | 'welcome' | 'blocked'>('auth');
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [existingMember, setExistingMember] = useState<Member | null>(null);

  const applyUser = useCallback((user: { name: string; email: string }) => {
    setAuthUser({ name: user.name, email: user.email });
    setFullName((prev) => prev || user.name);
    // One account can't be both: block if this email is already a Founding Delegate.
    if (isDelegateByEmail(user.email)) { setStep('blocked'); return; }
    const existing = isMemberByEmail(user.email);
    if (existing) { setExistingMember(existing); setStep('welcome'); }
    else { setStep('form'); }
  }, []);

  // Already signed in elsewhere on the site → skip the auth step entirely.
  useEffect(() => {
    if (preAuth) applyUser(preAuth);
  }, [preAuth, applyUser]);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      applyUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName || !grade || !classGroup || !authUser) return;
    setLoading(true);
    const member = await addMember({
      fullName,
      firstName: fullName.split(' ')[0],
      grade,
      classGroup,
      email: authUser.email,
    });
    setLoading(false);
    if (member) onSuccess(member);
  };

  if (count >= MAX) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <div className="modal-title">The Chamber Is Sealed</div>
          <p className="modal-subtitle">All 15 Founding Member seats have been claimed. The charter is complete.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        {step === 'auth' && (
          <>
            <div className="modal-title">Verify Your Identity</div>
            <p className="modal-subtitle">Sign in with Google to prevent duplicate registrations and secure your seat.</p>
            <button className="google-btn" onClick={handleGoogleAuth} disabled={loading}>
              {loading ? <span>Verifying...</span> : (<><GoogleIcon /><span>Continue with Google</span></>)}
            </button>
            <div id="google-signin-fallback" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }} />
            {error && <p style={{ color: 'var(--signal)', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>{error}</p>}
          </>
        )}

        {step === 'welcome' && existingMember && (
          <div className="welcome-back">
            <div className="modal-title">Welcome back, {existingMember.firstName}.</div>
            <p className="modal-subtitle">Your seat is secured. You are Founding Member #{existingMember.memberNumber}.</p>
            <div className="wb-badge">◆ Founding Member</div>
          </div>
        )}

        {step === 'blocked' && (
          <div className="welcome-back">
            <div className="modal-title">You're already a Founding Delegate</div>
            <p className="modal-subtitle">This account is registered as a Delegate. One account can be a Founder or a Delegate, not both.</p>
            <div className="wb-badge">◆ Founding Delegate</div>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="modal-title">Claim Your Founding Seat</div>
            <p className="modal-subtitle">Seat #{count + 1} of {MAX}. Once engraved, your name stands.</p>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>

            <div className="form-group">
              <label className="form-label">Grade</label>
              <select className="form-select" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">Select grade</option>
                {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Class</label>
              <input className="form-input" value={classGroup} onChange={e => setClassGroup(e.target.value)} placeholder="e.g. S1-1, 904" />
            </div>

            <button className="submit-btn" onClick={handleSubmit} disabled={!fullName || !grade || !classGroup || loading}>
              {loading ? 'Engraving...' : 'Engrave My Name'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Profile Editor Modal ─── */
function ProfileEditorModal({ member, onClose, onUpdate, numberLabel, saveFn }: { member: Member; onClose: () => void; onUpdate: () => void; numberLabel?: string; saveFn?: (email: string, updates: Partial<Pick<Member, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>) => Promise<any> }) {
  const [fullName, setFullName] = useState(member.fullName);
  const [grade, setGrade] = useState(member.grade);
  const [classGroup, setClassGroup] = useState(member.classGroup);
  const [bio, setBio] = useState(member.bio || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<{ url: string; name: string } | null>(
    member.avatar ? { url: member.avatar, name: member.avatarName || 'Anime Character' } : null
  );
  const [avatarSource, setAvatarSource] = useState<'upload' | 'mal'>('upload');

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState({ W: 1, H: 1 });
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageDims({ W: img.width, H: img.height });
        setRawImageSrc(event.target?.result as string);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = offset;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX, y: touch.clientY };
    offsetStart.current = offset;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.current.x;
    const dy = touch.clientY - dragStart.current.y;
    setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
  };

  const handleSaveCrop = () => {
    if (!rawImageSrc) return;
    setSaving(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#060b18';
        ctx.fillRect(0, 0, 256, 256);

        const W = imageDims.W;
        const H = imageDims.H;
        let w_disp = 200;
        let h_disp = 200;
        if (W > H) {
          w_disp = 200 * (W / H);
        } else {
          h_disp = 200 * (H / W);
        }

        const w_canvas = w_disp * zoom * 1.28;
        const h_canvas = h_disp * zoom * 1.28;
        const x_canvas = (100 + offset.x - (w_disp * zoom) / 2) * 1.28;
        const y_canvas = (100 + offset.y - (h_disp * zoom) / 2) * 1.28;

        ctx.drawImage(img, x_canvas, y_canvas, w_canvas, h_canvas);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setSelectedAvatar({ url: compressedDataUrl, name: uploadedFileName || 'Custom Upload' });
        setRawImageSrc(null);
      }
      setSaving(false);
    };
    img.src = rawImageSrc;
  };

  const searchAnime = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(searchQuery)}&limit=12`);
      const data = await res.json();
      setAnimeResults(data.data || []);
    } catch (err) {
      console.error('Anime search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fullName || !grade || !classGroup) { alert('Name, grade, and class are required.'); return; }
    setSaving(true);
    await (saveFn ?? updateMember)(member.email, {
      fullName, grade, classGroup, bio,
      avatar: selectedAvatar?.url || '',
      avatarName: selectedAvatar?.name || '',
    });
    setSaving(false);
    onUpdate();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title">Your Profile</div>
        <p className="modal-subtitle">{numberLabel ?? `Founding Member #${member.memberNumber}`}</p>

        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: 1, maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Grade</label>
                <select className="form-select" value={grade} onChange={e => setGrade(e.target.value)}>
                  {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (<option key={g} value={g}>{g}</option>))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Class</label>
                <input className="form-input" value={classGroup} onChange={e => setClassGroup(e.target.value)} placeholder="e.g. 904" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Biography / Quote</label>
              <textarea
                className="form-textarea"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Leave your mark. A quote, a bio, or your vision for MUN."
                maxLength={150}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Avatar Selection</label>
              <div className="avatar-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className={`avatar-tab ${avatarSource === 'upload' ? 'active' : ''}`}
                  onClick={() => setAvatarSource('upload')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: avatarSource === 'upload' ? 'rgba(76,141,255,0.18)' : 'rgba(3,6,14,0.3)',
                    border: '1px solid',
                    borderColor: avatarSource === 'upload' ? 'var(--accent)' : 'rgba(76,141,255,0.15)',
                    color: avatarSource === 'upload' ? 'var(--text-strong)' : 'var(--text-muted)',
                    borderRadius: '3px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                >
                  Upload Photo
                </button>
                <button
                  type="button"
                  className={`avatar-tab ${avatarSource === 'mal' ? 'active' : ''}`}
                  onClick={() => setAvatarSource('mal')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: avatarSource === 'mal' ? 'rgba(76,141,255,0.18)' : 'rgba(3,6,14,0.3)',
                    border: '1px solid',
                    borderColor: avatarSource === 'mal' ? 'var(--accent)' : 'rgba(76,141,255,0.15)',
                    color: avatarSource === 'mal' ? 'var(--text-strong)' : 'var(--text-muted)',
                    borderRadius: '3px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                >
                  Search MyAnimeList
                </button>
              </div>

              {avatarSource === 'upload' ? (
                rawImageSrc ? (
                  <div className="cropper-container" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Drag to Position • Slider to Zoom
                    </div>
                    <div
                      className="crop-box"
                      style={{
                        position: 'relative',
                        width: '200px',
                        height: '200px',
                        margin: '0 auto 1rem',
                        overflow: 'hidden',
                        background: '#040710',
                        cursor: 'move',
                        borderRadius: '3px',
                        border: '1px solid rgba(76,141,255,0.15)'
                      }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleMouseUp}
                    >
                      <img
                        src={rawImageSrc}
                        alt="Crop target"
                        style={{
                          position: 'absolute',
                          left: `${(200 - (imageDims.W > imageDims.H ? 200 * (imageDims.W / imageDims.H) : 200)) / 2}px`,
                          top: `${(200 - (imageDims.H >= imageDims.W ? 200 * (imageDims.H / imageDims.W) : 200)) / 2}px`,
                          width: `${imageDims.W > imageDims.H ? 200 * (imageDims.W / imageDims.H) : 200}px`,
                          height: `${imageDims.H >= imageDims.W ? 200 * (imageDims.H / imageDims.W) : 200}px`,
                          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                          transformOrigin: 'center center',
                          pointerEvents: 'none',
                          userSelect: 'none'
                        }}
                      />
                      {/* Circle viewfinder overlay with cutout */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          border: '2px solid var(--accent)',
                          boxShadow: '0 0 0 9999px rgba(3, 6, 14, 0.75)',
                          pointerEvents: 'none'
                        }}
                      />
                    </div>

                    <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '200px', margin: '0 auto 1.25rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        style={{
                          flex: 1,
                          accentColor: 'var(--accent-lift)',
                          height: '4px',
                          borderRadius: '2px',
                          background: 'rgba(76,141,255,0.2)',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>+</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', width: '200px', margin: '0 auto' }}>
                      <button
                        type="button"
                        onClick={handleSaveCrop}
                        className="submit-btn"
                        style={{ margin: 0, padding: '8px 12px', fontSize: '0.75rem', flex: 1 }}
                      >
                        Apply Crop
                      </button>
                      <button
                        type="button"
                        onClick={() => setRawImageSrc(null)}
                        className="admin-act"
                        style={{ margin: 0, padding: '8px 12px', fontSize: '0.75rem', flex: 1, background: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.4)', color: '#ff8a8e' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="upload-zone"
                    style={{
                      border: '2px dashed rgba(76,141,255,0.3)',
                      borderRadius: '4px',
                      padding: '2.5rem 1.5rem',
                      textAlign: 'center',
                      background: 'rgba(3,6,14,0.4)',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'border-color 0.3s, background-color 0.3s'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'var(--accent-lift)';
                      e.currentTarget.style.backgroundColor = 'rgba(76,141,255,0.06)';
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'rgba(76,141,255,0.3)';
                      e.currentTarget.style.backgroundColor = 'rgba(3,6,14,0.4)';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.borderColor = 'rgba(76,141,255,0.3)';
                      e.currentTarget.style.backgroundColor = 'rgba(3,6,14,0.4)';
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        const input = document.getElementById('avatar-file-input') as HTMLInputElement;
                        if (input) {
                          const dataTransfer = new DataTransfer();
                          dataTransfer.items.add(file);
                          input.files = dataTransfer.files;
                          const event = { target: input } as unknown as React.ChangeEvent<HTMLInputElement>;
                          handleFileUpload(event);
                        }
                      }
                    }}
                    onClick={() => document.getElementById('avatar-file-input')?.click()}
                  >
                    <input
                      type="file"
                      id="avatar-file-input"
                      accept="image/*"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontSize: '1.8rem', color: 'var(--accent-lift)', marginBottom: '8px' }}>
                      📷
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-body)', fontWeight: 600 }}>
                      Click or Drag Image to Upload
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Supports JPG, PNG, GIF. Auto-resized for performance.
                    </div>
                  </div>
                )
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="form-input"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchAnime()}
                      placeholder="Search characters (e.g. Levi, Makima)..."
                    />
                    <button className="submit-btn" style={{ width: 'auto', marginTop: 0, padding: '0 16px' }} onClick={searchAnime} disabled={searching}>
                      {searching ? '...' : 'Search'}
                    </button>
                  </div>

                  {animeResults.length > 0 && (
                    <div className="anime-grid">
                      {animeResults.map(char => (
                        <div
                          key={char.mal_id}
                          className={`anime-card ${selectedAvatar?.url === char.images.jpg.image_url ? 'selected' : ''}`}
                          onClick={() => setSelectedAvatar({ url: char.images.jpg.image_url, name: char.name })}
                        >
                          <img src={char.images.jpg.image_url} alt={char.name} />
                          <div className="anime-card-name">{char.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {animeResults.length === 0 && searching && <div className="anime-loading">Searching dimensions...</div>}
                </>
              )}
            </div>
          </div>

          <div style={{ width: '120px', textAlign: 'center' }}>
            <label className="form-label">Preview</label>
            {selectedAvatar ? (
              <img src={selectedAvatar.url} className="profile-avatar-preview" alt="Avatar" />
            ) : (
              <div className="profile-avatar-placeholder">◆</div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--accent-lift)' }}>
              {selectedAvatar?.name || 'No avatar selected'}
            </div>
          </div>
        </div>

        <button className="submit-btn" onClick={handleSave} disabled={saving} style={{ marginTop: '2rem' }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

/* ─── Founder Detail Modal ─── */
function FounderDetailModal({ member, displayTitle, onClose, isAdmin, onAdminEdit, onToggleMain, onDelete }: {
  member: Member;
  displayTitle: string;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (m: Member) => void;
  onToggleMain: (id: string, isMain: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <button className="modal-close" onClick={onClose}>×</button>

        {member.avatar ? (
          <img src={member.avatar} className="detail-avatar" alt={member.firstName} style={{ margin: '0 auto 1rem', display: 'block' }} />
        ) : (
          <div className="detail-avatar-placeholder" style={{ margin: '0 auto 1rem' }}>◆</div>
        )}

        <div className="detail-name">{member.fullName}</div>
        <div className="detail-meta">Grade {member.grade} • Class {member.classGroup}</div>

        <div className="detail-badge" style={{
          background: member.isMainFounder ? 'linear-gradient(135deg, #2f63d6, #84b6ff)' : '',
          color: member.isMainFounder ? '#fff' : '',
          borderColor: member.isMainFounder ? '#84b6ff' : '',
          fontWeight: member.isMainFounder ? 700 : 600
        }}>
          {member.isMainFounder && '★ '} {displayTitle}
        </div>

        {member.isMainFounder && (
          <div className="meeting-notice" style={{
            background: 'rgba(76,141,255,0.12)',
            border: '1px solid var(--accent)',
            color: 'var(--accent-lift)',
            padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem',
            marginTop: '1rem', marginBottom: '1rem', fontWeight: 600,
          }}>
            A meeting is gonna be host soon, stay updated.
          </div>
        )}

        {member.avatarName && <div className="detail-anime-label">Represented by {member.avatarName}</div>}
        {member.bio && <div className="detail-bio">"{member.bio}"</div>}

        {isAdmin && (
          <div className="admin-panel">
            <div className="admin-panel-label">Administrator Controls</div>
            <div className="admin-panel-actions">
              <button className="admin-act" onClick={() => onAdminEdit(member)}>Edit Photo &amp; Quote</button>
              <button className="admin-act" onClick={() => onToggleMain(member.id, !member.isMainFounder)}>
                {member.isMainFounder ? 'Unset Main Founder' : 'Set as Main Founder'}
              </button>
              <button className="admin-act danger" onClick={() => onDelete(member.id, member.fullName)}>Remove Member</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Certificate ─── */
function Certificate({ member, onClose }: { member: Member; onClose: () => void }) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 }, colors: CONFETTI_BLUES });
    const t = setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { y: 0.4 }, colors: CONFETTI_BLUES }), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="certificate-overlay" onClick={onClose}>
      <div className="certificate" onClick={e => e.stopPropagation()}>
        <div className="cert-ornament">Founding Charter</div>
        <div className="cert-title">This certifies that</div>
        <div className="cert-name">{member.fullName}</div>
        <div className="cert-number">
          is <strong>Founding Member #{member.memberNumber}</strong> of the<br />
          {SCHOOL} Model United Nations Club
        </div>
        <div className="cert-seal">◆</div>
        <div className="cert-footer">Established 2026 · Youhua School</div>
        <button className="cert-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ─── The Privilege ───
   Three plates, deliberately unequal: the lead plate owns both rows and
   carries the argument, the two short plates annotate it. A row of three
   identical cards would say the same thing three times. */
function ValueSection() {
  const cards = [
    {
      title: 'Your name stays on this wall',
      text: 'Every founder is listed in the Hall of Founders on this site, by name and by number, for as long as the club exists. It is a record, not a badge that expires when you graduate.',
      featured: true,
    },
    {
      title: 'It holds up on an application',
      text: 'Founding Member is a verifiable position you can put on the Common App, UCAS, or any university portfolio, and defend in an interview.',
    },
    {
      title: 'You write the rules first',
      text: 'The first fifteen decide how this club debates, who it sends to conference, and what it stands for. Everyone after you inherits those decisions.',
    },
  ];

  return (
    <section className="section" id="value">
      <div className="value-head">
        <h2 className="section-title">What a <span className="gold-accent">founding seat</span> actually gets you</h2>
        <p className="section-lede">
          Three things, and they outlast the year you claim them in.
        </p>
      </div>
      <div className="cards-grid">
        {cards.map((c, i) => (<ValueCard key={i} {...c} />))}
      </div>
    </section>
  );
}

/* The tilt lives on the inner face, never on the card itself: the scroll
   rig owns the card's transform, and two rigs writing one transform is
   how you get jitter. The title and body sit at their own Z inside the
   face, so tilting shows real parallax between them instead of sliding
   one flat sheet around. */
function ValueCard({ title, text, featured }: { title: string; text: string; featured?: boolean }) {
  const faceRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const face = faceRef.current;
    if (!face) return;
    const rect = face.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rx = ((y - rect.height / 2) / rect.height) * -6;
    const ry = ((x - rect.width / 2) / rect.width) * 6;
    face.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    face.style.setProperty('--mx', `${((x / rect.width) * 100).toFixed(1)}%`);
    face.style.setProperty('--my', `${((y / rect.height) * 100).toFixed(1)}%`);
  };
  const handleMouseLeave = () => { if (faceRef.current) faceRef.current.style.transform = ''; };

  return (
    <div className={`value-card ${featured ? 'featured' : ''}`}>
      <div
        className="value-card-face"
        ref={faceRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <h3 className="card-title">{title}</h3>
        <p className="card-text">{text}</p>
      </div>
    </div>
  );
}

/* ─── Hall of Founders ─── */
/* Seat coordinates (in %) evenly spaced along a ROUNDED U / horseshoe (opens at top).
   Rounded corners spread the seats smoothly so they never bunch at the 90° turns. */
function uSeatPositions(n: number) {
  const left = 17, right = 83, top = 22, bottom = 88, r = 13;
  const arm = (bottom - r) - top;        // vertical arm length
  const corner = (Math.PI / 2) * r;      // quarter-circle arc length
  const base = (right - r) - (left + r); // straight bottom run
  const total = arm + corner + base + corner + arm;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    let d = total * ((i + 0.5) / n);
    let x: number, y: number;
    if (d <= arm) {                                   // left arm (down)
      x = left; y = top + d;
    } else if (d <= arm + corner) {                   // bottom-left corner
      const ang = Math.PI - (d - arm) / r;            // 180° → 90°
      x = (left + r) + r * Math.cos(ang);
      y = (bottom - r) + r * Math.sin(ang);
    } else if (d <= arm + corner + base) {            // bottom run
      x = (left + r) + (d - arm - corner); y = bottom;
    } else if (d <= arm + corner + base + corner) {   // bottom-right corner
      const ang = (Math.PI / 2) - (d - arm - corner - base) / r; // 90° → 0°
      x = (right - r) + r * Math.cos(ang);
      y = (bottom - r) + r * Math.sin(ang);
    } else {                                          // right arm (up)
      x = right; y = (bottom - r) - (d - arm - corner - base - corner);
    }
    pts.push({ x, y });
  }
  return pts;
}
type EnrichedMember = Member & { displayTitle: string };

function Seat({ member, isMain, onClick, selected, editing }: {
  member: EnrichedMember | null;
  isMain?: boolean;
  onClick: (m: EnrichedMember) => void;
  selected?: boolean;
  editing?: boolean;
}) {
  /* .seat-upright counter-rotates the floor's tilt, so the seat stands
     up out of the plane instead of lying flat on it. The scroll rig
     animates .seat itself, which is why the counter-rotation needs its
     own element rather than sharing one transform. */
  if (!member) {
    return (
      <div className="seat-upright">
        <div className={`seat vacant ${isMain ? 'main' : ''}`}>
          <div className="seat-avatar vacant" aria-hidden="true">{isMain ? '★' : ''}</div>
          <div className="seat-label">{isMain ? 'Main Founder' : 'Vacant'}</div>
        </div>
      </div>
    );
  }
  const bestie = member.bestieColor;
  return (
    <div className="seat-upright">
      <button
        className={`seat filled ${isMain ? 'main' : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${bestie ? 'has-bestie' : ''}`}
        onClick={() => onClick(member)}
        title={editing ? `Select ${member.firstName}` : `View ${member.fullName}'s dossier`}
        style={bestie ? ({ ['--bestie' as any]: bestie }) : undefined}
      >
        {member.avatar
          ? <img src={member.avatar} className="seat-avatar" alt="" />
          : <div className="seat-avatar placeholder" aria-hidden="true">◆</div>}
        {bestie && <span className="bestie-badge" style={{ background: bestie }}>♥ bestie</span>}
        <span className="seat-label">
          {isMain && <span aria-hidden="true">★ </span>}
          <span className="seat-name">{member.firstName}</span>
          <span className="seat-grade">{isMain ? 'Head of Council' : member.grade}</span>
        </span>
      </button>
    </div>
  );
}

function HallOfFounders({ members, onSeatClick, isAdmin }: { members: EnrichedMember[]; onSeatClick: (m: EnrichedMember) => void; isAdmin: boolean }) {
  const { ref } = useInView(0.1);
  const complete = members.length >= MAX;
  const mains = members.filter(m => m.isMainFounder);
  const others = members.filter(m => !m.isMainFounder);
  const remaining = MAX - members.length;

  const [editMode, setEditMode] = useState<'none' | 'arrange' | 'bestie'>('none');
  const [selected, setSelected] = useState<string[]>([]);

  // Leave edit mode if admin logs out.
  useEffect(() => { if (!isAdmin) { setEditMode('none'); setSelected([]); } }, [isAdmin]);

  const headSpacing = 17; // % between adjacent heads

  // Order the non-main members: the admin's explicit `seat` wins, otherwise join order.
  const byJoin = [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const joinIndex = new Map(byJoin.map((m, i) => [m.id, i] as const));
  const orderKey = (m: EnrichedMember) => (typeof m.seat === 'number' ? m.seat : (joinIndex.get(m.id) ?? 0));
  const orderedOthers = [...others].sort((a, b) => orderKey(a) - orderKey(b));
  // The horseshoe sizes itself to exactly however many people there are —
  // evenly spaced, no vacant seats, nobody hidden.
  const positions = uSeatPositions(orderedOthers.length);

  const handleSeatClick = (m: EnrichedMember) => {
    if (editMode === 'none' || !isAdmin) { onSeatClick(m); return; }
    setSelected(prev => {
      if (prev.includes(m.id)) return prev.filter(x => x !== m.id);
      const next = [...prev, m.id];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  // Arrange mode: as soon as two are selected, swap their seats (smooth glide).
  useEffect(() => {
    if (editMode !== 'arrange' || selected.length !== 2) return;
    const [aId, bId] = selected;
    const ai = orderedOthers.findIndex(m => m.id === aId);
    const bi = orderedOthers.findIndex(m => m.id === bId);
    if (ai >= 0 && bi >= 0) {
      const next = [...orderedOthers];
      [next[ai], next[bi]] = [next[bi], next[ai]];
      reorderMembers(next.map(m => m.id));
    }
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editMode]);

  const pairAreBesties = selected.length === 2 &&
    members.find(m => m.id === selected[0])?.bestieWith === selected[1];

  const makeBesties = async () => {
    if (selected.length !== 2) return;
    await setBesties(selected[0], selected[1], nextBestieColor(members));
    setSelected([]);
  };
  const unpair = async () => {
    if (selected.length !== 2) return;
    await clearBesties(selected[0], selected[1]);
    setSelected([]);
  };

  const editing = editMode !== 'none';

  return (
    <section className="hall" id="hall" ref={ref}>
      <div className="hall-inner">
        <h2 className="section-title">The <span className="gold-accent">Hall of Founders</span></h2>
        <p className="hall-subtitle">Everyone here signed on before the room was full.</p>
        <div className="hall-divider" />

        {isAdmin && (
          <div className="council-admin">
            <button className={`council-tool ${editMode === 'arrange' ? 'active' : ''}`}
              onClick={() => { setEditMode(editMode === 'arrange' ? 'none' : 'arrange'); setSelected([]); }}>
              ↔ Arrange Seats
            </button>
            <button className={`council-tool ${editMode === 'bestie' ? 'active' : ''}`}
              onClick={() => { setEditMode(editMode === 'bestie' ? 'none' : 'bestie'); setSelected([]); }}>
              ♥ Besties
            </button>
            {editMode === 'arrange' && <span className="council-hint">Tap two founders to swap their seats.</span>}
            {editMode === 'bestie' && (
              <span className="council-hint">
                {selected.length < 2 ? 'Tap two founders to pair them.' : (
                  pairAreBesties
                    ? <button className="council-go danger" onClick={unpair}>Unpair</button>
                    : <button className="council-go" onClick={makeBesties}>Make Besties ♥</button>
                )}
              </span>
            )}
          </div>
        )}

        {/* The horseshoe is not drawn in perspective, it is in it: the stage
            plane is rotated on X, the emblem lies flat on that floor, and
            every seat stands upright out of it. The scroll rig scrubs
            --tilt, so the camera lifts as you descend into the room. */}
        <div className={`hall-chamber ${complete ? 'complete' : ''} ${editing ? 'editing' : ''}`}>
          <div className="chamber-stage">
            <div className="chamber-dais" />
            <div className="chamber-floor" />
            <div className="chamber-emblem" aria-hidden="true">◆<span>The Council</span></div>

            {/* Head of the U — Main Founder(s) only; nothing shown if there is none */}
            {mains.map((m, i) => {
              const x = 50 + (i - (mains.length - 1) / 2) * headSpacing;
              return (
                <div className="seat-wrap is-main" key={m.id} style={{ left: `${x}%`, top: '13%' }}>
                  <Seat member={m} isMain onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
                </div>
              );
            })}

            {/* Perimeter — exactly the non-main members, evenly spaced, no vacancies */}
            {orderedOthers.map((m, i) => {
              const p = positions[i];
              return (
                <div className="seat-wrap seat-movable" key={m.id} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <Seat member={m} onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
                </div>
              );
            })}
          </div>
        </div>

        {complete
          ? <div className="complete-banner">The Council is Complete</div>
          : <p className="chamber-hint">{remaining} seat{remaining !== 1 ? 's' : ''} still open in the chamber. Select any founder to read their dossier.</p>}
      </div>
    </section>
  );
}

/* ─── The Mission ───
   A definition list rather than a card row: each term is weighted by the
   space it is given, and the rules run the full measure. The metric strip
   that used to sit here quoted numbers this club has no way to stand
   behind, so it is gone. */
function AboutSection() {
  const pillars = [
    { word: 'Debate', desc: 'You take a position you did not choose, and you defend it against a room that has read the same brief. It is the fastest way anyone has found to learn what your own argument is actually made of.' },
    { word: 'Diplomacy', desc: 'A resolution passes when enough delegates who disagree can still sign the same page. Getting there is a skill, and it is the one that transfers to everything else you will do.' },
    { word: 'Record', desc: 'Committees keep minutes. Positions are attributed. What you said in session is written down under your country and your name, which is a rarer kind of accountability than most classrooms offer.' },
  ];

  return (
    <section className="section about-section" id="about">
      <h2 className="section-title">What Model United Nations <span className="gold-accent">actually is</span></h2>
      <p className="about-intro">
        You are assigned a country. You read its position on a real question in front of the real UN,
        and then you spend a session arguing it in a room of people doing the same for theirs.
      </p>

      <div className="pillars">
        {pillars.map((p) => (
          <div key={p.word} className="pillar">
            <h3 className="pillar-word">{p.word}</h3>
            <p className="pillar-desc">{p.desc}</p>
          </div>
        ))}
      </div>

      <figure className="quote-block">
        <blockquote className="pull-quote">
          Education is the most powerful weapon which you can use to change the world.
        </blockquote>
        <figcaption className="quote-attr">Nelson Mandela</figcaption>
      </figure>
    </section>
  );
}

/* ─── Ticker ─── */
function Ticker({ members }: { members: Member[] }) {
  if (members.length === 0) return null;
  const items = [...members, ...members];
  return (
    <div className="ticker-bar">
      <div className="ticker-track">
        {items.map((m, i) => (
          <span key={i} className="ticker-item">{m.firstName}, {m.grade} just joined</span>
        ))}
      </div>
    </div>
  );
}

/* ═══ THE DEPTH RIG ═══════════════════════════════════════════════
   Every animated element is a plane at a Z position under a fixed
   focal length. One scrubbed timeline owns each plane for its whole
   journey: it rises out of depth, holds flat and perfectly crisp
   through the reading zone, then dollies PAST the lens on the way
   out. Because a single timeline covers all three phases, scrolling
   back up is the same move played backwards — the element falls away
   from the camera, settles, and sinks back into depth. No second
   tween to disagree with the first, no state that only exists in one
   direction.

   Phase boundaries are expressed in viewport fractions and converted
   to timeline durations once, so a heading and a card share the same
   rhythm regardless of their height.
════════════════════════════════════════════════════════════════ */
const LENS = 1400;

/* Where the element's top sits, as a fraction of the viewport. */
const P_IN_START = 0.92;   // begins rising
const P_IN_END   = 0.62;   // fully settled, crisp, flat
const P_OUT_START = 0.16;  // begins leaving
const P_OUT_END = -0.22;   // gone
const SPAN = P_IN_START - P_OUT_END;
const D_IN   = (P_IN_START - P_IN_END) / SPAN;
const D_HOLD = (P_IN_END - P_OUT_START) / SPAN;
const D_OUT  = (P_OUT_START - P_OUT_END) / SPAN;

type DepthOpts = { depth?: number; rise?: number; lift?: number; blur?: number; offset?: number };

function depthReveal(el: Element, opts: DepthOpts = {}) {
  const { depth = 420, rise = 60, lift = 240, blur = 0, offset = 0 } = opts;
  const start = `top ${(P_IN_START * 100 - offset).toFixed(1)}%`;
  const end = `top ${(P_OUT_END * 100 - offset).toFixed(1)}%`;

  const tl = gsap.timeline({
    scrollTrigger: { trigger: el, start, end, scrub: 0.55 },
    defaults: { transformPerspective: LENS, force3D: true },
  });

  tl.fromTo(el,
      { autoAlpha: 0, z: -depth, y: rise, rotateX: 7, filter: blur ? `blur(${blur}px)` : 'none' },
      { autoAlpha: 1, z: 0, y: 0, rotateX: 0, filter: blur ? 'blur(0px)' : 'none',
        duration: D_IN, ease: 'expo.out' })
    /* The hold is a real, empty stretch of scroll: the element sits at
       z:0 with no filter, so type renders on the pixel grid while you
       are actually reading it. */
    .to(el, { duration: D_HOLD })
    .to(el,
      { autoAlpha: 0, z: lift, y: -(rise * 0.85), rotateX: -5,
        filter: blur ? `blur(${blur * 0.8}px)` : 'none',
        duration: D_OUT, ease: 'power2.in' });

  return tl;
}

/* Scroll-driven cinematic FX */
function useScrollFX() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    /* Depth blur is the single most expensive thing here, so it is
       spent only on the few large planes where defocus actually reads. */
    const softBlur = coarse ? 0 : 6;

    const ctx = gsap.context(() => {
      /* ── HERO: a three-plane camera move ──
         The photograph pushes in and defocuses, the emblem swells and
         passes the lens, the headline flies over your shoulder. Each
         plane is a different element from the one mouse-look drives,
         so the two rigs never overwrite each other's transform. */
      gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4 } })
        .to('.hero-bg', { scale: 1.24, yPercent: 5, filter: `blur(${coarse ? 0 : 8}px)`, ease: 'none' }, 0)
        .to('.emblem-dolly', { scale: 1.85, autoAlpha: 0, ease: 'power1.in' }, 0)
        .to('.hero-orb-1', { yPercent: -46, ease: 'none' }, 0)
        .to('.hero-orb-2', { yPercent: -18, ease: 'none' }, 0);

      gsap.fromTo('.hero-content',
        { z: 0, y: 0, autoAlpha: 1, filter: 'blur(0px)' },
        { z: 480, y: -60, autoAlpha: 0, filter: `blur(${coarse ? 0 : 10}px)`,
          transformPerspective: 1100, ease: 'power2.in',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: '66% top', scrub: 0.4 } });

      gsap.to('.scroll-indicator', { autoAlpha: 0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: '12% top', scrub: true } });

      /* ── PAGE PLANES ── */
      gsap.utils.toArray<HTMLElement>('.section-title, .about-intro, .hall-subtitle, .delegation-subtitle, .section-lede')
        .forEach((el) => depthReveal(el, { depth: 460, rise: 54, blur: softBlur }));

      gsap.utils.toArray<HTMLElement>('.pull-quote')
        .forEach((el) => depthReveal(el, { depth: 520, rise: 60, lift: 300, blur: softBlur }));

      /* Rows stagger in SCROLL space rather than in time: each card
         starts a little later down the page, so the cascade reads the
         same coming back up as it does going down. */
      const scrollStagger = (sel: string, step: number, o: DepthOpts = {}) =>
        gsap.utils.toArray<HTMLElement>(sel).forEach((el, i) =>
          depthReveal(el, { ...o, offset: i * step }));

      scrollStagger('.value-card', 3.5, { depth: 480, rise: 64, blur: softBlur });
      scrollStagger('.pillar', 2.5, { depth: 340, rise: 40 });
      scrollStagger('.delegate-card', 1.2, { depth: 300, rise: 34 });

      /* ── THE CHAMBER ──
         The seats stand on a floor plane, so they get shallower depth
         than page content: any more and they tear away from the floor
         they are supposed to be bolted to. */
      gsap.utils.toArray<HTMLElement>('.seat').forEach((el) => {
        const wrap = el.closest('.seat-wrap') as HTMLElement | null;
        const fromCentre = wrap ? Math.abs(parseFloat(wrap.style.left || '50') - 50) / 50 : 0;
        depthReveal(el, { depth: 220, rise: 26, lift: 140, offset: (1 - fromCentre) * 5 });
      });

      /* The camera lifts as you descend into the room: an overhead
         plan of the horseshoe rotates up towards eye level. Driven
         through a plain object so the custom property is written as a
         string the compositor can interpolate. */
      const chamber = document.querySelector('.hall-chamber') as HTMLElement | null;
      if (chamber && !coarse) {
        const cam = { tilt: 26 };
        gsap.to(cam, {
          tilt: 10, ease: 'none',
          scrollTrigger: { trigger: '.hall', start: 'top bottom', end: 'top 26%', scrub: 0.7 },
          onUpdate: () => chamber.style.setProperty('--tilt', `${cam.tilt.toFixed(2)}deg`),
        });
      }

      /* ── TOP PROGRESS BAR ── */
      gsap.to('.scroll-progress-fill', { scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });

      /* ── DEPTH OF FIELD ──
         Scroll velocity tightens and darkens the frame, the way a lens
         does when a camera whips between marks, and opens again the
         moment you settle. One property, one fixed element. */
      const root = document.documentElement;
      const dof = { v: 0 };
      const easeSpeed = gsap.quickTo(dof, 'v', {
        duration: 0.5, ease: 'power2.out',
        onUpdate: () => root.style.setProperty('--speed', dof.v.toFixed(3)),
      });
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: (self) => easeSpeed(Math.min(Math.abs(self.getVelocity()) / 3000, 1)),
      });
    });

    /* Recompute once layout, fonts and the live member list settle. */
    const r1 = requestAnimationFrame(() => ScrollTrigger.refresh());
    const t1 = setTimeout(() => ScrollTrigger.refresh(), 600);
    const t2 = setTimeout(() => ScrollTrigger.refresh(), 3200); // after the intro exits
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('load', onLoad);
      document.documentElement.style.removeProperty('--speed');
      ctx.revert();
    };
  }, []);
}

/* Hero mouse-look. Owns the OUTER plates only; the scroll rig owns the
   inner ones, so the two never fight over a transform. */
function useHeroParallax(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const plate = document.querySelector('.hero-plate') as HTMLElement | null;
    const emblem = document.querySelector('.hero-emblem') as HTMLElement | null;
    let mx = 0, my = 0, tx = 0, ty = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    const loop = () => {
      tx += (mx - tx) * 0.06;
      ty += (my - ty) * 0.06;
      /* The plates sit at different Z, so they travel at different
         rates for the same head movement. That is the whole parallax. */
      if (plate) plate.style.transform = `translate3d(${tx * -26}px, ${ty * -26}px, 0)`;
      if (emblem) emblem.style.transform = `translate3d(calc(-50% + ${tx * 38}px), calc(-50% + ${ty * 34}px), 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      if (plate) plate.style.transform = '';
      if (emblem) emblem.style.transform = '';
    };
  }, [active]);
}

/* ─── Founding Delegates (unlimited tier) ─── */
function DelegateAvatar({ d, i }: { d: Delegate; i: number }) {
  if (d.avatar) return <img src={d.avatar} className="delegate-avatar" alt={d.firstName} />;
  const hue = 205 + (i * 17) % 38;
  return (
    <div
      className="delegate-avatar mono"
      style={{ background: `linear-gradient(155deg, hsl(${hue} 52% 32%), hsl(${hue} 58% 17%))` }}
    >
      {(d.firstName || d.fullName || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function DelegationSection({ delegates, onJoin, onSelect, loggedInDelegate, isFounder, onEditProfile }: {
  delegates: Delegate[];
  onJoin: () => void;
  onSelect: (d: Delegate) => void;
  loggedInDelegate: Delegate | null;
  isFounder: boolean;
  onEditProfile: () => void;
}) {
  const { ref } = useInView(0.1);
  return (
    <section className="delegation" id="delegation" ref={ref}>
      <div className="delegation-inner">
        <h2 className="section-title">Founding <span className="gold-accent">Delegates</span></h2>
        <p className="delegation-subtitle">
          The council seats fifteen. The club does not. Founding Delegates are recorded beside the
          founders, in join order, with no cap on how many.
        </p>
        <div className="delegation-count">
          <span className="delegation-count-num">{delegates.length}</span>
          {delegates.length === 1 ? 'delegate has joined' : 'delegates have joined'}
        </div>

        {delegates.length > 0 ? (
          <div className="delegate-grid">
            {delegates.map((d, i) => (
              <button className="delegate-card" key={d.id} onClick={() => onSelect(d)} title={`View ${d.fullName}`}>
                <DelegateAvatar d={d} i={i} />
                <div className="delegate-name">{d.firstName}</div>
                <div className="delegate-meta">{d.grade} · {d.classGroup}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="delegation-empty">No delegates yet. Be the first to stand on the founding record.</div>
        )}

        <div className="delegation-cta-wrap">
          {loggedInDelegate ? (
            <>
              <MagneticCta onClick={onEditProfile}>Edit Your Delegate Profile →</MagneticCta>
              <p className="cta-sub">You're Founding Delegate #{loggedInDelegate.delegateNumber}. Your name stands on the record.</p>
            </>
          ) : isFounder ? (
            <p className="cta-sub" style={{ fontSize: '0.8rem' }}>
              You're a Founding Member. Your seat is in the council above.
            </p>
          ) : (
            <>
              <MagneticCta onClick={onJoin}>Become a Founding Delegate →</MagneticCta>
              <p className="cta-sub">Unlimited places. Your name is recorded permanently.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DelegateModal({ onClose, onSuccess, preAuth }: {
  onClose: () => void;
  onSuccess: (d: Delegate) => void;
  preAuth: GoogleUser | null;
}) {
  const [step, setStep] = useState<'auth' | 'form' | 'welcome' | 'blocked'>('auth');
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [bio, setBio] = useState('');
  const [created, setCreated] = useState<Delegate | null>(null);

  const applyUser = useCallback((user: { name: string; email: string }) => {
    setAuthUser({ name: user.name, email: user.email });
    setFullName(prev => prev || user.name);
    // One account can't be both: block if this email already holds a Founding Seat.
    if (isMemberByEmail(user.email)) { setStep('blocked'); return; }
    const existing = isDelegateByEmail(user.email);
    if (existing) { setCreated(existing); setStep('welcome'); }
    else setStep('form');
  }, []);

  useEffect(() => { if (preAuth) applyUser(preAuth); }, [preAuth, applyUser]);

  // Reliable sign-in: render the official Google button. (The One-Tap prompt
  // often silently fails to appear, which left "Verifying..." stuck forever.)
  const btnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== 'auth' || !btnRef.current) return;
    let cancelled = false;
    renderGoogleButton(btnRef.current)
      .then(u => { if (!cancelled) applyUser(u); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [step, applyUser]);

  const handleSubmit = async () => {
    if (!fullName || !grade || !classGroup || !authUser) return;
    setLoading(true);
    setError(null);
    try {
      const d = await addDelegate({
        fullName,
        firstName: fullName.split(' ')[0],
        grade, classGroup, bio,
        email: authUser.email,
      });
      if (d) {
        setCreated(d);
        setStep('welcome');
        onSuccess(d);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, colors: CONFETTI_BLUES });
      } else {
        setError('Could not register. This account may already be a founder or a delegate.');
      }
    } catch {
      setError('Saving failed. The delegate list may not be enabled yet. Ask the admin to publish the Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        {step === 'auth' && (
          <>
            <div className="modal-title">Join the Delegation</div>
            <p className="modal-subtitle">Sign in with Google to add your name to the Founding Delegates.</p>
            <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
            {error && <p style={{ color: 'var(--signal)', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>{error}</p>}
          </>
        )}

        {step === 'form' && (
          <>
            <div className="modal-title">Become a Founding Delegate</div>
            <p className="modal-subtitle">No seat limit. Your name joins the founding record permanently.</p>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="form-group">
              <label className="form-label">Grade</label>
              <select className="form-select" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">Select grade</option>
                {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Class</label>
              <input className="form-input" value={classGroup} onChange={e => setClassGroup(e.target.value)} placeholder="e.g. S1-1, 904" />
            </div>
            <div className="form-group">
              <label className="form-label">Biography / Quote <span style={{ color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea className="form-textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="A line about why you're here." maxLength={150} />
            </div>

            <button className="submit-btn" onClick={handleSubmit} disabled={!fullName || !grade || !classGroup || loading}>
              {loading ? 'Adding...' : 'Add My Name'}
            </button>
          </>
        )}

        {step === 'welcome' && created && (
          <div className="welcome-back">
            <div className="modal-title">Welcome, {created.firstName}.</div>
            <p className="modal-subtitle">You are Founding Delegate #{created.delegateNumber}. Your name now stands on the record.</p>
            <div className="wb-badge">◆ Founding Delegate</div>
          </div>
        )}

        {step === 'blocked' && (
          <div className="welcome-back">
            <div className="modal-title">You're already a Founding Member</div>
            <p className="modal-subtitle">This account holds a Founding Seat. One account can be a Founder or a Delegate, not both.</p>
            <div className="wb-badge">◆ Founding Member</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DelegateDetailModal({ delegate, onClose, isAdmin, onAdminEdit, onDelete }: {
  delegate: Delegate;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (d: Delegate) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <button className="modal-close" onClick={onClose}>×</button>
        {delegate.avatar
          ? <img src={delegate.avatar} className="detail-avatar" alt={delegate.firstName} style={{ margin: '0 auto 1rem', display: 'block' }} />
          : <div className="detail-avatar-placeholder" style={{ margin: '0 auto 1rem' }}>{(delegate.firstName || '?').charAt(0).toUpperCase()}</div>}
        <div className="detail-name">{delegate.fullName}</div>
        <div className="detail-meta">Grade {delegate.grade} · Class {delegate.classGroup}</div>
        <div className="detail-badge">◆ Founding Delegate #{delegate.delegateNumber}</div>
        {delegate.bio && <div className="detail-bio">"{delegate.bio}"</div>}
        {isAdmin && (
          <div className="admin-panel">
            <div className="admin-panel-label">Administrator Controls</div>
            <div className="admin-panel-actions">
              <button className="admin-act" onClick={() => onAdminEdit(delegate)}>Edit Photo &amp; Quote</button>
              <button className="admin-act danger" onClick={() => onDelete(delegate.id, delegate.fullName)}>Remove Delegate</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [modalOpen, setModalOpen] = useState(false);
  const [certificate, setCertificate] = useState<Member | null>(null);
  const [sealedShown, setSealedShown] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState<Member | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<(Member & { displayTitle: string }) | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(getCachedGoogleUser());
  const [adminEditMember, setAdminEditMember] = useState<Member | null>(null);

  /* Founding Delegates (unlimited tier) */
  const [delegates, setDelegates] = useState<Delegate[]>(getDelegates());
  const [loggedInDelegate, setLoggedInDelegate] = useState<Delegate | null>(null);
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);
  const [delegateProfileOpen, setDelegateProfileOpen] = useState(false);
  const [selectedDelegate, setSelectedDelegate] = useState<Delegate | null>(null);
  const [adminEditDelegate, setAdminEditDelegate] = useState<Delegate | null>(null);

  const isAdmin = isAdminEmail(adminEmail);
  const count = members.length;
  const urgent = count >= 13 && count < MAX;
  const full = count >= MAX;
  const loggedInPerson = loggedInUser || loggedInDelegate;

  let regularCount = 0;
  const enrichedMembers = members.map(m => {
    if (m.isMainFounder) return { ...m, displayTitle: 'Main Founder' };
    regularCount++;
    return { ...m, displayTitle: `Founding Member #${regularCount}` };
  });

  // The headline has to agree with the register: once the charter is sealed,
  // "filling" is a lie the page keeps telling.
  const headline = full ? 'The Founding Seats Are Taken.' : 'The Founding Seats Are Filling.';
  const onLoadDone = useCallback(() => setLoaded(true), []);
  const onIntroComplete = useCallback(() => setIntroComplete(true), []);

  useSmoothScroll();
  useScrollFX();
  useHeroParallax(introComplete); // mouse parallax only after the intro fully settles

  useEffect(() => {
    const unsubscribe = subscribeToMembers((newMembers) => {
      setMembers([...newMembers]);
      setLoggedInUser(prev => prev ? newMembers.find(m => m.email === prev.email) || null : null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToDelegates((newDelegates) => {
      setDelegates([...newDelegates]);
      setLoggedInDelegate(prev => prev ? newDelegates.find(d => d.email === prev.email) || null : null);
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
      else if (!isAdminEmail(user.email)) alert("You haven't joined yet. Claim a Founding Seat or become a Founding Delegate first.");
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

  return (
    <>
      <LoadingScreen onReveal={onLoadDone} onDone={onIntroComplete} />
      <div className="scroll-progress"><div className="scroll-progress-fill" /></div>
      <Navbar onMenu={() => setMenuOpen(true)} seatsLeft={MAX - count} full={full} />
      <ScrollProgressRail />
      <AudioToggle />
      <div className="grain-overlay" />
      <div className="vignette-overlay" />

      {menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}

      {/* User Profile / Login Button */}
      <button className={`user-login-btn ${loggedInPerson ? 'logged-in' : ''}`} onClick={() => startAuth('login')}>
        {loggedInPerson ? (
          <>
            {loggedInPerson.avatar ? (
              <img src={loggedInPerson.avatar} className="user-avatar-small" alt={loggedInPerson.firstName} />
            ) : (
              <div className="user-avatar-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--accent-veil)' }}>◆</div>
            )}
            Edit Profile
          </>
        ) : (
          <><GoogleIcon /> Member Login</>
        )}
      </button>

      {/* Admin login, bottom-right. It stays quiet, but it is a real control:
          a 40px target with a label and enough contrast to be findable. */}
      {!isAdmin ? (
        <button className="admin-key" onClick={() => startAuth('admin')} aria-label="Administrator sign-in">
          <span aria-hidden="true">⚙</span>
        </button>
      ) : (
        <div className="admin-flag">
          <span aria-hidden="true">◆</span> Admin
          <button onClick={() => setAdminEmail(null)} aria-label="Sign out of administrator mode">✕</button>
        </div>
      )}

      {/* ① Hero */}
      <section className="hero" id="hero">
        {/* The camera. Three planes at three depths under one focal
            length: the photograph furthest back, the emblem at mid
            depth, the light field nearest the lens. Mouse-look drives
            the outer plates, the scroll dolly drives the inner ones. */}
        <div className="hero-lens" aria-hidden="true">
          <div className="hero-plate">
            <div className="hero-bg" />
          </div>
          <div className="hero-emblem">
            <div className="emblem-dolly">
              <span className="emblem-halo" />
              <img src="/un-emblem.svg" alt="" className={`emblem-img ${loaded ? 'alive' : ''}`} />
              <span className="intro-scan" />
            </div>
          </div>
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>

        <div className="hero-spacer" />

        <div className="hero-content">
          <div className="hero-eyebrow" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.12s' }}>
            Youhua School · Model United Nations
          </div>
          <div className="gold-rule" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.20s' }} />
          <WordRevealTitle text={headline} loaded={loaded} />
          <p className="hero-sub" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.65s' }}>
            {urgent
              ? `Almost gone. ${MAX - count} seat${MAX - count !== 1 ? 's' : ''} left before the charter is sealed.`
              : 'Fifteen seats, filled once. There is no second founding year.'}
          </p>

          <div
            style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
              transition: 'opacity 0.8s ease 0.75s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.75s'
            }}
          >
            {full ? (
              <div className="hero-stats">
                <div className="hero-stat">
                  <ProgressRing count={count} />
                  <div className="hero-stat-cap">Council · Sealed</div>
                </div>
                <div className="hero-stat">
                  <DelegateRing count={delegates.length} />
                  <div className="hero-stat-cap open"><span className="cap-dot" /> Delegates · Open</div>
                </div>
              </div>
            ) : (
              <ProgressRing count={count} />
            )}
          </div>

          {loggedInUser ? (
            <div
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s ease 0.85s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.85s'
              }}
            >
              <MagneticCta onClick={() => scrollToId('hall')}>
                Take Your Seat in the Council →
              </MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>
                Welcome back, {loggedInUser.firstName}. You are Founding Member #{loggedInUser.memberNumber}.
              </p>
            </div>
          ) : loggedInDelegate ? (
            <div
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s ease 0.85s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.85s'
              }}
            >
              <MagneticCta onClick={() => scrollToId('delegation')}>See the Delegation →</MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>
                Welcome back, {loggedInDelegate.firstName}. You are Founding Delegate #{loggedInDelegate.delegateNumber}.
              </p>
            </div>
          ) : (!full && delegates.length === 0) ? (
            <div
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s ease 0.85s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.85s'
              }}
            >
              <MagneticCta onClick={() => startAuth('claim')}>Claim My Founding Seat →</MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>Takes 60 seconds. Lasts on your college application forever.</p>
            </div>
          ) : (
            <div
              style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.8s ease 0.85s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.85s'
              }}
            >
              {full && <p className="hero-sealed-note">All fifteen founding seats are sealed.</p>}
              <MagneticCta onClick={() => setDelegateModalOpen(true)}>Become a Founding Delegate →</MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>Unlimited places. Your name still stands on the founding record.</p>
            </div>
          )}
        </div>

        <div className="hero-spacer" style={{ minHeight: '1.5rem' }} />

        <div className="scroll-indicator" aria-hidden="true">
          <span className="scroll-indicator-text">Scroll</span>
          <span className="scroll-indicator-line" />
        </div>
      </section>

      {/* ② Value Proposition */}
      <ValueSection />

      {/* ③ Hall of Founders */}
      <HallOfFounders
        members={enrichedMembers}
        onSeatClick={(m) => setSelectedFounder(m)}
        isAdmin={isAdmin}
      />

      {/* ③½ Founding Delegates */}
      <DelegationSection
        delegates={delegates}
        loggedInDelegate={loggedInDelegate}
        isFounder={!!loggedInUser}
        onJoin={() => setDelegateModalOpen(true)}
        onEditProfile={() => setDelegateProfileOpen(true)}
        onSelect={(d) => setSelectedDelegate(d)}
      />

      {/* ④ About MUN */}
      <AboutSection />

      {/* ⑤ Footer */}
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-left">
            <div className="footer-name">{SCHOOL} Model United Nations</div>
            <div className="footer-est">Est. 2026</div>
            <div className="footer-tagline">"Shaped by 15. Built for the world."</div>
          </div>
          <div className="footer-right">
            <div className="footer-contact-label">Contact</div>
            <a href="https://www.instagram.com/lucasruslim/" target="_blank" rel="noopener noreferrer" className="footer-contact-link">@lucasruslim</a>
            <div className="footer-meta">Instagram</div>
          </div>
        </div>
        <div className="footer-bottom">
          © 2026 Youhua School Model United Nations. The founding register is kept on this page.
          <br />
          <span style={{ opacity: 0.7 }}>
            Hero image: UN General Assembly Hall by Patrick Gruban, <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>CC BY-SA 2.0</a>.
          </span>
        </div>
      </footer>

      <Ticker members={members} />

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
          onToggleMain={async (id, isMain) => {
            await toggleMainFounder(id, isMain);
            setSelectedFounder(null);
          }}
          onDelete={async (id, name) => { await handleDeleteMember(id, name); setSelectedFounder(null); }}
        />
      )}
      {certificate && <Certificate member={certificate} onClose={() => setCertificate(null)} />}

      {delegateModalOpen && (
        <DelegateModal
          onClose={() => setDelegateModalOpen(false)}
          onSuccess={(d) => setLoggedInDelegate(d)}
          preAuth={googleUser}
        />
      )}
      {delegateProfileOpen && loggedInDelegate && (
        <ProfileEditorModal
          member={loggedInDelegate as unknown as Member}
          numberLabel={`Founding Delegate #${loggedInDelegate.delegateNumber}`}
          saveFn={updateDelegate}
          onClose={() => setDelegateProfileOpen(false)}
          onUpdate={refresh}
        />
      )}
      {adminEditDelegate && (
        <ProfileEditorModal
          member={adminEditDelegate as unknown as Member}
          numberLabel={`Founding Delegate #${adminEditDelegate.delegateNumber}`}
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
        <div className="sealed-overlay" onClick={() => setSealedShown(false)}>
          <div className="sealed-stamp">◆</div>
          <h2 className="sealed-title">The Chamber Is Sealed.</h2>
          <p className="sealed-sub">Founding Members have been chosen. The charter is complete.</p>
        </div>
      )}
    </>
  );
}
