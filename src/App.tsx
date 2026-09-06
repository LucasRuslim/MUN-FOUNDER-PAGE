import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';
// @ts-ignore
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getMembers, subscribeToMembers, addMember, isMemberByEmail, removeMember, updateMember, toggleMainFounder, getDelegates, subscribeToDelegates, addDelegate, isDelegateByEmail, updateDelegate, removeDelegate, promoteEarliestDelegate, reorderMembers, setBesties, clearBesties, setMemberRoles, setDelegateRoles, type Member, type Delegate } from './storage';
import { useInView } from './useInView';
import { signInWithGoogle, getCachedGoogleUser, renderGoogleButton, type GoogleUser } from './googleAuth';

gsap.registerPlugin(ScrollTrigger);

const MAX = 15;
const SCHOOL = 'Youhua';

/* Avatars live as base64 inside the member document and every Firestore
   snapshot re-downloads them, so the stored size is a bandwidth decision as
   much as a visual one. 192px keeps the 104px detail portrait crisp on 2x
   displays while costing roughly half of what 256 @ q0.85 did. */
const AVATAR_PX = 192;
const AVATAR_QUALITY = 0.72;
const CROP_BOX_PX = 200; // the on-screen cropper, in CSS pixels
const ADMIN_EMAIL = 'lucas1121.lin@gmail.com';
const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

/* Chapters used by the scroll rail + side menu */
const CHAPTERS = [
  { id: 'hero',  label: 'The Chamber' },
  { id: 'value', label: 'The Privilege' },
  { id: 'hall',  label: 'The Founders' },
  { id: 'secretariat', label: 'The Offices' },
  { id: 'delegation', label: 'The Delegation' },
  { id: 'about', label: 'The Mission' },
];

/* ─── The club's offices ───
   Every seat at the round table, in seating order. No office ranks another:
   the two Presidents share one chair beside their directors. A person may hold
   several offices; assignment is an array of role ids on their document. */
type RoleDef = { id: string; en: string; zh: string; hue: string; glyph: string; duty: string };
const ROLES: RoleDef[] = [
  { id: 'president', en: 'The Presidents',          zh: '正副社長', hue: '#f6d789', glyph: '✦', duty: 'Two chairs, one gavel. They run the council and speak for the club.' },
  { id: 'events',    en: 'Directorate of Events',    zh: '活動',     hue: '#f2a0bd', glyph: '❖', duty: 'Designs every session, conference, and occasion the club holds.' },
  { id: 'treasury',  en: 'Directorate of Treasury',  zh: '總務',     hue: '#7fe0c3', glyph: '◈', duty: 'Keeps the ledger, the budget, and the club’s resources in order.' },
  { id: 'academics', en: 'Directorate of Academics', zh: '教學',     hue: '#84b6ff', glyph: '❋', duty: 'Trains delegates in procedure, research, and the art of debate.' },
  { id: 'pr',        en: 'Public Relations',         zh: '公關',     hue: '#b9a6f6', glyph: '◎', duty: 'Carries the club’s name outward: partners, schools, and the public.' },
  { id: 'web',       en: 'Web & Systems',            zh: '網管',     hue: '#8fd3f4', glyph: '◉', duty: 'Runs this site and the systems the club relies on.' },
  { id: 'candidate', en: 'Officer Candidates',       zh: '幹部候選', hue: '#9fb2d8', glyph: '◇', duty: 'Under consideration for office in the coming term.' },
];
const roleById = (id?: string) => (id ? ROLES.find(r => r.id === id) : undefined);
/* Offices a person holds; reads the legacy single `role` field too. */
function rolesOf(p: { role?: string; roles?: string[] }): string[] {
  if (p.roles && p.roles.length) return p.roles.filter(id => roleById(id));
  return p.role && roleById(p.role) ? [p.role] : [];
}

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

/* ─── Counter animation hook ─── */
function useCountUp(target: number, duration = 2000) {
  const ref = useRef<HTMLSpanElement>(null);
  const triggered = useRef(false);
  const rafRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  const start = useCallback(() => {
    if (triggered.current) return;
    const el = ref.current;
    if (!el) return;
    triggered.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = String(target);
      return;
    }
    // Counts by writing to the node directly. Three of these run at once, and
    // via setState that was three React renders per frame for two seconds.
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      el.textContent = String(Math.floor(progress * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [target, duration]);
  return { ref, start };
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

/* ─── Intro timing ───
   The full cinematic is worth 4.5s the first time you land. It is not worth it
   on every reload, so it runs once per browser session and repeat visits get a
   short fade instead. Resolved once at module scope and memoised: `LoadingScreen`
   writes the "seen" flag from a child effect, which fires BEFORE the parent's
   effects, so anything reading sessionStorage later would otherwise disagree
   with the intro that is actually playing. */
const INTRO_SEEN_KEY = 'youhua-mun.intro-seen';
let introPlan: { hold: number; settle: number } | null = null;
function getIntroPlan() {
  if (introPlan) return introPlan;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    introPlan = { hold: 0, settle: 0 };
  } else {
    let seen = false;
    try { seen = sessionStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { /* private mode */ }
    introPlan = seen ? { hold: 400, settle: 600 } : { hold: 2200, settle: 2300 };
  }
  return introPlan;
}

/* ─── Loading Screen ─── */
function LoadingScreen({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // The intro lives INSIDE the hero — no overlay, no second element. The body gets
    // `intro-active` (dark, UI + bg hidden, globe large+bright). Removing it lets the
    // SAME hero globe zoom out + fade its colour into the background via CSS transition.
    document.body.classList.add('intro-active');
    const { hold, settle } = getIntroPlan();
    try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* private mode */ }

    const t1 = setTimeout(() => {
      document.body.classList.remove('intro-active'); // triggers the globe zoom-out + scene reveal
      onReveal();
    }, hold);
    // onDone fires after the globe settle fully finishes → mouse parallax starts cleanly.
    const t2 = setTimeout(() => { setGone(true); onDone(); }, hold + settle);

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

/* ─── Cursor light — a soft azure glow that follows the pointer ─── */
function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    let mx = window.innerWidth / 2, my = window.innerHeight * 0.4, x = mx, y = my, raf = 0;
    const draw = () => { el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; };
    // The loop parks itself once the glow has caught up with the pointer, and a
    // move restarts it. Previously it ran every frame for the life of the page
    // even with the mouse sitting still.
    const loop = () => {
      raf = 0;
      const dx = mx - x, dy = my - y;
      if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) { x = mx; y = my; draw(); return; }
      x += dx * 0.12;
      y += dy * 0.12;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      el.style.opacity = '1';
      kick();
    };
    const onLeave = () => { el.style.opacity = '0'; };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    draw();
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}

/* ─── Hero dust — ambient particles drifting up through the light ─── */
function HeroDust() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas || !canvas.parentElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, running = true, t = 0;
    type P = { x: number; y: number; r: number; s: number; a: number; ph: number; sw: number };
    let pts: P[] = [];
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 14000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.7 + Math.random() * 2.0,
        s: 0.1 + Math.random() * 0.35,
        a: 0.12 + Math.random() * 0.4,
        ph: Math.random() * Math.PI * 2,
        sw: 0.2 + Math.random() * 0.6,
      }));
    };
    resize();
    const onR = () => resize();
    window.addEventListener('resize', onR);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.y -= p.s;
        p.x += Math.sin(t * p.sw + p.ph) * 0.15;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + p.ph); // twinkle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,198,255,${(p.a * tw).toFixed(3)})`;
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    // Pause the loop while the hero is off-screen.
    const io = new IntersectionObserver(([e]) => { running = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onR); io.disconnect(); };
  }, []);
  return <canvas ref={ref} className="hero-dust" aria-hidden="true" />;
}

/* ─── Starfield — page-wide ambient stars with scroll-depth parallax ─── */
function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, t = 0;
    type S = { x: number; y: number; r: number; a: number; ph: number; d: number };
    let stars: S[] = [];
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.round(Math.min(150, (w * h) / 26000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.4 + Math.random() * 1.3,
        a: 0.05 + Math.random() * 0.3,
        ph: Math.random() * Math.PI * 2,
        d: 0.25 + Math.random() * 0.75, // depth → parallax + twinkle speed
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    // Cached rather than read per frame: `window.scrollY` inside the rAF forces a
    // layout flush in the middle of the frame that Lenis is writing transforms
    // into, which is exactly the wrong moment to ask for one.
    let sy = window.scrollY;
    const onScroll = () => { sy = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    const tick = () => {
      raf = requestAnimationFrame(tick);
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + s.d) + s.ph);
        // Deeper stars drift slower against the scroll → parallax depth.
        const y = (((s.y - sy * 0.06 * s.d) % h) + h) % h;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150,190,255,${(s.a * tw).toFixed(3)})`;
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}

/* ─── Decrypt — section labels resolve out of cipher glyphs when seen ─── */
const DECRYPT_GLYPHS = '◆▮▰·ABCDEFGHIKLMNOPRSTUVZ0123456789';
function Decrypt({ text }: { text: string }) {
  const { ref, visible } = useInView(0.6);
  const outRef = useRef<HTMLSpanElement>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (!visible || ran.current) return;
    ran.current = true;
    const el = outRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0, raf = 0;
    const total = Math.max(30, text.length * 3.2);
    const tick = () => {
      frame++;
      const solved = Math.floor((frame / total) * text.length);
      // Straight to the DOM node. React never re-renders this span (the
      // component holds no state), so the scramble can't fight the render.
      el.textContent = text.split('').map((ch, i) =>
        ch === ' ' ? ' ' : i < solved ? ch : DECRYPT_GLYPHS[(Math.random() * DECRYPT_GLYPHS.length) | 0]
      ).join('');
      if (solved < text.length) raf = requestAnimationFrame(tick);
      else el.textContent = text;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, text]);
  return (
    <span ref={ref as any} style={{ display: 'inline-block' }}>
      <span ref={outRef}>{text}</span>
    </span>
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
  const links = CHAPTERS.map(c => ({ label: c.label, id: c.id }));
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

  const suspendTimer = useRef<number | null>(null);

  const toggle = () => {
    ensureGraph();
    const ctx = ctxRef.current!;
    const master = masterRef.current!;
    if (suspendTimer.current) { clearTimeout(suspendTimer.current); suspendTimer.current = null; }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    // Anchor the ramp to the current value, otherwise cancelling scheduled
    // values can snap the gain before the fade starts.
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    if (!playing) master.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 1.4);
    else {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      // Park the context once it has faded out. Muting only took the gain to
      // zero: four oscillators and their LFOs kept the audio thread running.
      suspendTimer.current = window.setTimeout(() => { ctxRef.current?.suspend(); }, 900);
    }
    setPlaying((p) => !p);
  };

  useEffect(() => () => {
    if (suspendTimer.current) clearTimeout(suspendTimer.current);
    ctxRef.current?.close();
  }, []);

  return (
    <button className={`audio-toggle ${playing ? 'playing' : ''}`} onClick={toggle} aria-label="Toggle ambient sound">
      <span className="audio-bars"><span /><span /><span /><span /></span>
      <span className="audio-label">{playing ? 'Sound On' : 'Ambience'}</span>
    </button>
  );
}

/* Page lock, ref-counted so one dialog closing as another opens can't leave the
   page stuck locked or scrolling. */
let pageLocks = 0;
function lockPage() {
  if (pageLocks++ === 0) {
    lenisInstance?.stop();
    document.documentElement.classList.add('modal-open');
  }
}
function unlockPage() {
  pageLocks = Math.max(0, pageLocks - 1);
  if (pageLocks === 0) {
    document.documentElement.classList.remove('modal-open');
    lenisInstance?.start();
  }
}

/* ─── Modal shell ───
   Shared by every overlay on the page. Stops the smooth-scroll instance so the
   chamber can't scroll away behind the dialog, closes on Escape, keeps Tab
   inside the panel, and returns focus to whatever opened it. */
function Modal({ onClose, overlayClass = 'modal-overlay', panelClass = 'modal', label, panelStyle, children }: {
  onClose: () => void;
  overlayClass?: string;
  panelClass?: string;
  label: string;
  panelStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Held in a ref so inline `onClose={() => setX(null)}` arrows at the call
  // sites don't re-run the lock effect on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    lockPage();

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      unlockPage();
      restoreTo?.focus?.();
    };
  }, []);

  return (
    <div className={overlayClass} onClick={() => closeRef.current()}>
      <div
        ref={panelRef}
        className={panelClass}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Confirm / Notice dialogs ───
   These replace window.confirm and window.alert, which broke the spell of an
   otherwise fully art-directed page. */
type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm();
      onClose();
    } catch (e) {
      // A rejected write (Firestore rules, offline) has to stay on screen —
      // closing here would look exactly like success.
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      setBusy(false);
    }
  };
  return (
    <Modal onClose={busy ? () => {} : onClose} label={request.title} panelStyle={{ maxWidth: 420 }}>
      <div className="modal-title">{request.title}</div>
      <p className="modal-subtitle">{request.body}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="confirm-actions">
        <button className="confirm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`confirm-go ${request.danger ? 'danger' : ''}`} onClick={go} disabled={busy}>
          {busy ? 'Working...' : request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function NoticeDialog({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label={title} panelStyle={{ maxWidth: 420 }}>
      <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
      <div className="modal-title">{title}</div>
      <p className="modal-subtitle">{body}</p>
      <button className="submit-btn" onClick={onClose}>Understood</button>
    </Modal>
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
    <Modal onClose={onClose} label={copy.title} panelStyle={{ maxWidth: 420 }}>
      <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
      <div className="modal-title">{copy.title}</div>
      <p className="modal-subtitle">{copy.sub}</p>
      <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
      {err && <p style={{ color: 'var(--signal)', fontSize: '0.82rem', textAlign: 'center', marginTop: '1rem' }} role="alert">{err}</p>}
    </Modal>
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
      <Modal onClose={onClose} label="The Chamber Is Sealed">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="modal-title">The Chamber Is Sealed</div>
        <p className="modal-subtitle">All 15 Founding Member seats have been claimed. The charter is complete.</p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} label="Claim your founding seat">
      <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>

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
            <p className="modal-subtitle">Seat #{count + 1} of {MAX}. Once engraved, your name stands permanently.</p>

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
    </Modal>
  );
}

/* ─── Profile Editor Modal ─── */
function ProfileEditorModal({ member, onClose, onUpdate, numberLabel, saveFn }: { member: Member; onClose: () => void; onUpdate: () => void; numberLabel?: string; saveFn?: (email: string, updates: Partial<Pick<Member, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>) => Promise<any> }) {
  const [fullName, setFullName] = useState(member.fullName);
  const [grade, setGrade] = useState(member.grade);
  const [classGroup, setClassGroup] = useState(member.classGroup);
  const [bio, setBio] = useState(member.bio || '');
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
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
    setFormError(null);
    const img = new Image();
    // Without this the modal could sit on "Saving..." forever if the file
    // turned out not to be a decodable image.
    img.onerror = () => { setSaving(false); setFormError('That image could not be read. Try a different file.'); };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_PX;
      canvas.height = AVATAR_PX;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#060b18';
        ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);

        const { W, H } = imageDims;
        let w_disp = CROP_BOX_PX;
        let h_disp = CROP_BOX_PX;
        if (W > H) w_disp = CROP_BOX_PX * (W / H);
        else h_disp = CROP_BOX_PX * (H / W);

        // The cropper is CROP_BOX_PX wide on screen; k rescales that geometry
        // into the stored bitmap.
        const k = AVATAR_PX / CROP_BOX_PX;
        const half = CROP_BOX_PX / 2;
        ctx.drawImage(
          img,
          (half + offset.x - (w_disp * zoom) / 2) * k,
          (half + offset.y - (h_disp * zoom) / 2) * k,
          w_disp * zoom * k,
          h_disp * zoom * k,
        );
        setSelectedAvatar({ url: canvas.toDataURL('image/jpeg', AVATAR_QUALITY), name: uploadedFileName || 'Custom Upload' });
        setRawImageSrc(null);
      }
      setSaving(false);
    };
    img.src = rawImageSrc;
  };

  /* Jikan rate-limits at a few requests a second, and this used to swallow
     every failure into console.error, so a throttled or offline search just
     looked like "no results". */
  const searchAbort = useRef<AbortController | null>(null);
  useEffect(() => () => searchAbort.current?.abort(), []);

  const searchAnime = async () => {
    if (!searchQuery.trim() || searching) return;
    searchAbort.current?.abort();
    const ac = new AbortController();
    searchAbort.current = ac;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(searchQuery)}&limit=12`,
        { signal: ac.signal },
      );
      if (res.status === 429) { setSearchError('Searching too fast. Wait a moment and try again.'); return; }
      if (!res.ok) { setSearchError('The character service is unavailable right now.'); return; }
      const data = await res.json();
      const results = data.data || [];
      setAnimeResults(results);
      if (!results.length) setSearchError(`Nothing found for "${searchQuery}".`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSearchError('Search failed. Check your connection and try again.');
    } finally {
      if (searchAbort.current === ac) setSearching(false);
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fullName || !grade || !classGroup) { setFormError('Name, grade, and class are all required.'); return; }
    setFormError(null);
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
    <Modal onClose={onClose} panelClass="modal wide" label="Edit your profile">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
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
                    borderColor: avatarSource === 'upload' ? 'var(--azure)' : 'rgba(76,141,255,0.15)',
                    color: avatarSource === 'upload' ? 'var(--platinum)' : 'var(--silver-dim)',
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
                    borderColor: avatarSource === 'mal' ? 'var(--azure)' : 'rgba(76,141,255,0.15)',
                    color: avatarSource === 'mal' ? 'var(--platinum)' : 'var(--silver-dim)',
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--silver-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                          border: '2px solid var(--azure)',
                          boxShadow: '0 0 0 9999px rgba(3, 6, 14, 0.75)',
                          pointerEvents: 'none'
                        }}
                      />
                    </div>

                    <div className="zoom-control" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '200px', margin: '0 auto 1.25rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--silver-dim)' }}>-</span>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        style={{
                          flex: 1,
                          accentColor: 'var(--azure-bright)',
                          height: '4px',
                          borderRadius: '2px',
                          background: 'rgba(76,141,255,0.2)',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--silver-dim)' }}>+</span>
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
                      e.currentTarget.style.borderColor = 'var(--azure-bright)';
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
                    <div style={{ fontSize: '1.8rem', color: 'var(--azure-bright)', marginBottom: '8px' }}>
                      📷
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--silver)', fontWeight: 600 }}>
                      Click or Drag Image to Upload
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--silver-dim)', marginTop: '4px' }}>
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
                  {searchError && <p className="form-error" role="alert">{searchError}</p>}
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
            <div style={{ fontSize: '0.7rem', color: 'var(--azure-bright)' }}>
              {selectedAvatar?.name || 'No avatar selected'}
            </div>
          </div>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className="submit-btn" onClick={handleSave} disabled={saving} style={{ marginTop: '2rem' }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
    </Modal>
  );
}

/* ─── Founder Detail Modal ─── */
/* Shown in both dossiers: every office this person holds, each in its colour. */
function OfficeBadges({ roles }: { roles: string[] }) {
  const defs = roles.map(id => roleById(id)).filter((d): d is RoleDef => !!d);
  if (!defs.length) return null;
  return (
    <div className="office-badges">
      {defs.map(d => (
        <span key={d.id} className="office-badge" style={{ ['--office' as any]: d.hue }}>
          <span aria-hidden="true">{d.glyph}</span> {d.zh} · {d.en}
        </span>
      ))}
    </div>
  );
}

/* Admin: toggle any number of offices on this person. */
function RoleToggles({ value, onChange }: { value: string[]; onChange: (roles: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(r => r !== id) : [...value, id]);
  return (
    <div className="admin-role-row">
      <span className="admin-role-label">Offices · 職位</span>
      <div className="role-toggles">
        {ROLES.map(r => (
          <button
            key={r.id} type="button"
            className={`role-toggle ${value.includes(r.id) ? 'on' : ''}`}
            style={{ ['--office' as any]: r.hue }}
            aria-pressed={value.includes(r.id)}
            onClick={() => toggle(r.id)}
          >
            <span aria-hidden="true">{r.glyph}</span> {r.zh}
          </button>
        ))}
      </div>
    </div>
  );
}

function FounderDetailModal({ member, displayTitle, onClose, isAdmin, onAdminEdit, onToggleMain, onDelete, onSetRoles }: {
  member: Member;
  displayTitle: string;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (m: Member) => void;
  onToggleMain: (id: string, isMain: boolean) => void;
  onDelete: (id: string, name: string) => void;
  onSetRoles: (id: string, roles: string[]) => void;
}) {
  return (
    <Modal onClose={onClose} overlayClass="detail-overlay" panelClass="detail-card"
      label={`${member.fullName} · dossier`} panelStyle={{ textAlign: 'center' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close dossier">×</button>

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
        <OfficeBadges roles={rolesOf(member)} />

        {member.isMainFounder && (
          <div className="meeting-notice" style={{
            background: 'rgba(76,141,255,0.12)',
            border: '1px solid var(--azure)',
            color: 'var(--azure-bright)',
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
            <div className="admin-panel-label">◆ Administrator Controls</div>
            <RoleToggles value={rolesOf(member)} onChange={(roles) => onSetRoles(member.id, roles)} />
            <div className="admin-panel-actions">
              <button className="admin-act" onClick={() => onAdminEdit(member)}>Edit Photo &amp; Quote</button>
              <button className="admin-act" onClick={() => onToggleMain(member.id, !member.isMainFounder)}>
                {member.isMainFounder ? 'Unset Main Founder' : 'Set as Main Founder'}
              </button>
              <button className="admin-act danger" onClick={() => onDelete(member.id, member.fullName)}>Remove Member</button>
            </div>
          </div>
        )}
    </Modal>
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
    <Modal onClose={onClose} overlayClass="certificate-overlay" panelClass="certificate"
      label={`Founding charter for ${member.fullName}`}>
        <div className="cert-ornament">◆ &nbsp; Founding Charter &nbsp; ◆</div>
        <div className="cert-title">This certifies that</div>
        <div className="cert-name">{member.fullName}</div>
        <div className="cert-number">
          is <strong>Founding Member #{member.memberNumber}</strong> of the<br />
          {SCHOOL} Model United Nations Club
        </div>
        <div className="cert-seal">◆</div>
        <div className="cert-footer">Established 2026 · The Charter Remembers</div>
        <button className="cert-close-btn" onClick={onClose}>Close</button>
    </Modal>
  );
}

/* ─── Value Proposition Section ─── */
function ValueSection() {
  const rows = [
    { title: 'Your Name, On This Wall', text: 'Permanently listed in the Hall of Founders on this website. Not a temporary badge, but a lasting record of your leadership.' },
    { title: 'College Application Ready', text: 'Founding Member status is verifiable and can be listed on Common App, UCAS, or any university portfolio as a leadership credential.' },
    { title: 'You Helped Build This', text: 'First-generation members define the club\'s culture, traditions, and direction. Your voice shapes what this becomes.' },
  ];

  return (
    <section className="section" id="value">
      <span className="section-beam" aria-hidden="true" />
      <div className="section-eyebrow"><Decrypt text="The Privilege" /></div>
      <h2 className="section-title">What Does <span className="gold-accent">Founding Member</span> Mean?</h2>
      <div className="ledger">
        {rows.map((r, i) => (
          <div className="ledger-row" key={i}>
            <span className="ledger-mark" aria-hidden="true">◆</span>
            <h3 className="ledger-title">{r.title}</h3>
            <p className="ledger-text">{r.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Hall of Founders ─── */
type EnrichedMember = Member & { displayTitle: string };

/* ─── Chamber geometry ───
   A true horseshoe: two straight arms joined by a semicircular bend, drawn as
   an architect's plan. Coordinates live in viewBox units and the container is
   locked to the same aspect ratio, so a station at (x, y) maps to
   (x/w, y/h) in percent with no letterboxing to correct for. */
/* `inset` seats the delegate inside the bench, the way someone sits at a desk
   rather than on top of it; `tick0/tick1/num` place the station rule and its
   engraved numeral further into the floor. They live on the geometry because a
   viewBox unit is worth different pixels in the wide and tall rooms, and the
   portrait has to clear the bench line in both. */
type ChamberGeo = {
  w: number; h: number; armL: number; armR: number; armTop: number; armBottom: number;
  r: number; headY: number; seat: number;
  inset: number; tick0: number; tick1: number; num: number;
};

const CHAMBER_WIDE: ChamberGeo = {
  w: 1000, h: 1000, armL: 130, armR: 870, armTop: 150, armBottom: 600, r: 370, headY: 88, seat: 96,
  inset: 44, tick0: 88, tick1: 114, num: 142,
};
/* Phones get a taller room: longer arms buy perimeter, so fifteen stations
   still breathe at 320px wide. The portrait is proportionally much larger
   there, so it stays on the bench and only the numeral steps inside. */
const CHAMBER_TALL: ChamberGeo = {
  w: 1000, h: 1400, armL: 150, armR: 850, armTop: 130, armBottom: 940, r: 350, headY: 78, seat: 132,
  inset: 0, tick0: 78, tick1: 104, num: 132,
};

/* (bx, by) is the point on the bench itself; (x, y) is where the delegate sits,
   stepped inward along the normal. */
type Station = { x: number; y: number; bx: number; by: number; nx: number; ny: number };

/* Walks the bench from the top of the left arm, down and around the bend, back
   up the right arm, and drops `n` stations at even arc-length intervals. */
function chamberStations(geo: ChamberGeo, n: number): Station[] {
  // Spacing is measured along the path the delegates actually sit on, which is
  // inboard of the bench. Distributing along the bench instead packs the seats
  // together around the bend, where the inset costs the most arc length.
  const seatL = geo.armL + geo.inset;
  const seatR = geo.armR - geo.inset;
  const seatR_ = geo.r - geo.inset;
  const arm = geo.armBottom - geo.armTop;
  const bend = Math.PI * seatR_;
  const total = arm + bend + arm;
  const cx = (geo.armL + geo.armR) / 2;
  const out: Station[] = [];
  for (let i = 0; i < n; i++) {
    const d = total * ((i + 0.5) / n);
    let x: number, y: number, nx: number, ny: number;
    if (d <= arm) {
      x = seatL; y = geo.armTop + d; nx = 1; ny = 0;
    } else if (d <= arm + bend) {
      // α sweeps π → 0, tracing the bend through its lowest point.
      const a = Math.PI * (1 - (d - arm) / bend);
      x = cx + seatR_ * Math.cos(a);
      y = geo.armBottom + seatR_ * Math.sin(a);
      nx = -Math.cos(a); ny = -Math.sin(a);
    } else {
      x = seatR; y = geo.armBottom - (d - arm - bend); nx = -1; ny = 0;
    }
    out.push({ x, y, nx, ny, bx: x - nx * geo.inset, by: y - ny * geo.inset });
  }
  return out;
}

/* Fracture lines for the sealing moment: jagged runs striking out from the
   centre of the floor. Seeded rather than random so the same charter always
   cracks the same way, and so React re-renders don't reshuffle them mid-flight. */
/* ─── The Sigil of the Charter ───
   The sealing stamps an engraved sigil into the floor: two rings around the
   mark, fifteen ticks between them (one per founding seat), and — only outside
   the outer ring — tapered splinters where the slab actually gave. Stroked
   polylines can't taper, and taper is what separates "fracture" from
   "scribble", so each splinter is a closed filled polygon: wide at the root,
   needle at the tip. Seeded, so the charter always breaks the same way. */
function sealFractures(cx: number, cy: number, rootR: number, maxR: number, seed = 20260726) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const xy = (r: number, a: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });

  // A spine of vertices becomes a closed sliver: out along one offset edge,
  // back along the other, converging to a point at the tip.
  const taper = (spine: { x: number; y: number }[], w0: number) => {
    const L: string[] = [], R: string[] = [];
    for (let i = 0; i < spine.length; i++) {
      const prev = spine[Math.max(i - 1, 0)], next = spine[Math.min(i + 1, spine.length - 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const w = (w0 * (1 - i / (spine.length - 1))) / 2;
      L.push(`${(spine[i].x - (dy / len) * w).toFixed(1)},${(spine[i].y + (dx / len) * w).toFixed(1)}`);
      R.push(`${(spine[i].x + (dy / len) * w).toFixed(1)},${(spine[i].y - (dx / len) * w).toFixed(1)}`);
    }
    return `M ${L.join(' L ')} L ${R.reverse().join(' L ')} Z`;
  };

  const shards: string[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const ray = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.38;
    const reach = rootR + (maxR - rootR) * (0.55 + rnd() * 0.45);
    const segs = 3 + Math.floor(rnd() * 2);
    const spine = [xy(rootR * 0.985, ray)];
    const verts: { r: number; a: number }[] = [];
    for (let k = 1; k <= segs; k++) {
      const r = rootR + ((reach - rootR) * k) / segs;
      const a = ray + (rnd() - 0.5) * (k === segs ? 0.22 : 0.1);
      spine.push(xy(r, a));
      verts.push({ r, a });
    }
    shards.push(taper(spine, 5 + rnd() * 2.5));

    // Most splinters throw one finer side shard from a mid-spine vertex.
    if (rnd() > 0.4) {
      const v = verts[Math.floor(rnd() * (verts.length - 1))];
      const fa = v.a + (rnd() > 0.5 ? 1 : -1) * (0.5 + rnd() * 0.45);
      const fr = v.r + (reach - v.r) * (0.35 + rnd() * 0.3);
      shards.push(taper([xy(v.r, v.a), xy((v.r + fr) / 2, fa), xy(fr, fa + (rnd() - 0.5) * 0.16)], 3));
    }
  }
  return shards;
}

/* Radiating inlay for the chamber floor: brass hairlines struck from the
   centre out to the guide band, the way a stone medallion is laid. Deterministic,
   no randomness: this is architecture, not a sky. */
function inlayRays(cx: number, cy: number, r0: number, r1: number, count = 48) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const major = i % 4 === 0;
    const from = major ? r0 * 0.72 : r0;
    return {
      x1: cx + Math.cos(a) * from, y1: cy + Math.sin(a) * from,
      x2: cx + Math.cos(a) * r1, y2: cy + Math.sin(a) * r1,
      major,
    };
  });
}

const benchPath = (g: ChamberGeo, inset = 0) =>
  `M ${g.armL + inset},${g.armTop + inset} L ${g.armL + inset},${g.armBottom} ` +
  `A ${g.r - inset},${g.r - inset} 0 0 0 ${g.armR - inset},${g.armBottom} ` +
  `L ${g.armR - inset},${g.armTop + inset}`;

function useChamberGeo(): ChamberGeo {
  const query = '(max-width: 720px)';
  const [tall, setTall] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setTall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return tall ? CHAMBER_TALL : CHAMBER_WIDE;
}

function Seat({ member, isMain, seatNo, onClick, selected, editing }: {
  member: EnrichedMember;
  isMain?: boolean;
  seatNo?: number;
  onClick: (m: EnrichedMember) => void;
  selected?: boolean;
  editing?: boolean;
}) {
  const bestie = member.bestieColor;
  return (
    <button
      className={`seat ${isMain ? 'is-head' : ''} ${selected ? 'selected' : ''} ${bestie ? 'has-bond' : ''}`}
      onClick={() => onClick(member)}
      title={editing ? `Select ${member.firstName}` : `${member.fullName} · read dossier`}
      aria-label={`${member.fullName}, ${isMain ? 'Head of Council' : `seat ${seatNo}`}`}
      style={bestie ? ({ ['--bond' as any]: bestie }) : undefined}
    >
      <span className="seat-portrait">
        {member.avatar
          ? <img src={member.avatar} className="seat-avatar" alt="" />
          : <span className="seat-avatar is-initial" aria-hidden="true">{(member.firstName || '?').charAt(0).toUpperCase()}</span>}
        {isMain && <i className="seat-crown" aria-hidden="true">★</i>}
        {bestie && <i className="seat-bond" style={{ background: bestie }} aria-hidden="true">♥</i>}
      </span>
      <span className="seat-plate">
        <span className="seat-name">{isMain ? member.fullName : member.firstName}</span>
        {isMain && <span className="seat-role">Head of Council</span>}
      </span>
    </button>
  );
}

/* A seat the charter allows but nobody holds yet. It stays on the plan as a
   numbered outline, which is what makes "11 of 15" legible as a room rather
   than a statistic. */
function VacantSeat({ seatNo, onClaim }: { seatNo: number; onClaim?: () => void }) {
  return (
    <button
      className={`seat is-vacant ${onClaim ? 'claimable' : ''}`}
      onClick={onClaim}
      disabled={!onClaim}
      title={onClaim ? `Seat ${seatNo} · yours to claim` : `Seat ${seatNo} · unclaimed`}
      aria-label={onClaim ? `Claim seat ${seatNo}` : `Seat ${seatNo}, unclaimed`}
    >
      <span className="seat-portrait">
        {/* Left empty on purpose: the floor already carries this seat's numeral. */}
        <span className="seat-avatar is-empty" aria-hidden="true" />
      </span>
      <span className="seat-plate">
        <span className="seat-name">{onClaim ? 'Claim' : 'Vacant'}</span>
      </span>
    </button>
  );
}

function HallOfFounders({ members, onSeatClick, isAdmin, onClaimSeat }: {
  members: EnrichedMember[];
  onSeatClick: (m: EnrichedMember) => void;
  isAdmin: boolean;
  onClaimSeat?: () => void;
}) {
  const complete = members.length >= MAX;
  const mains = members.filter(m => m.isMainFounder);
  const others = members.filter(m => !m.isMainFounder);
  const remaining = MAX - members.length;
  const geo = useChamberGeo();

  const [editMode, setEditMode] = useState<'none' | 'arrange' | 'bestie'>('none');
  const [selected, setSelected] = useState<string[]>([]);

  // Leave edit mode if admin logs out.
  useEffect(() => { if (!isAdmin) { setEditMode('none'); setSelected([]); } }, [isAdmin]);

  // Order the non-main members: the admin's explicit `seat` wins, otherwise join order.
  const byJoin = [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const joinIndex = new Map(byJoin.map((m, i) => [m.id, i] as const));
  const orderKey = (m: EnrichedMember) => (typeof m.seat === 'number' ? m.seat : (joinIndex.get(m.id) ?? 0));
  const orderedOthers = [...others].sort((a, b) => orderKey(a) - orderKey(b));

  /* The bench always carries every seat the charter allows, so the room shows
     its own vacancies instead of quietly resizing around them. */
  const benchSeats = Math.max(orderedOthers.length, MAX - mains.length);
  const stations = chamberStations(geo, benchSeats);
  const headXs = mains.map((_, i) =>
    (geo.armL + geo.armR) / 2 + (i - (mains.length - 1) / 2) * (geo.seat * 1.4));

  /* Where every seated founder physically sits, so a bond can be drawn between
     two of them as a chord across the floor. */
  const posById = new Map<string, { x: number; y: number }>();
  mains.forEach((m, i) => posById.set(m.id, { x: headXs[i], y: geo.headY + geo.seat * 0.42 }));
  orderedOthers.forEach((m, i) => { const s = stations[i]; if (s) posById.set(m.id, { x: s.x, y: s.y }); });

  /* A pairing is engraved into the floor as a concordat: a double brass rule
     bowed across the chamber, with a small lozenge seal struck at its midpoint
     carrying the pair's own colour as the gem. Same language as the medallion
     inlay, so it belongs to the room instead of floating over it. */
  const bonds: { key: string; d: string; dIn: string; color: string; sx: number; sy: number; ang: number }[] = [];
  const pairSeen = new Set<string>();
  members.forEach(m => {
    if (!m.bestieWith || !m.bestieColor) return;
    const key = [m.id, m.bestieWith].sort().join('|');
    if (pairSeen.has(key)) return;
    const a = posById.get(m.id);
    const b = posById.get(m.bestieWith);
    if (!a || !b) return;
    pairSeen.add(key);
    const fx = (geo.armL + geo.armR) / 2, fy = geo.armBottom * 0.88;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // Bowed toward the middle of the floor so it reads as crossing the room
    // rather than cutting a straight line through the furniture.
    const c = { x: mx + (fx - mx) * 0.55, y: my + (fy - my) * 0.55 };
    const cIn = { x: mx + (fx - mx) * 0.60, y: my + (fy - my) * 0.60 };
    // Midpoint of the quadratic at t=0.5, where the seal is set.
    const sx = 0.25 * a.x + 0.5 * c.x + 0.25 * b.x;
    const sy = 0.25 * a.y + 0.5 * c.y + 0.25 * b.y;
    bonds.push({
      key, color: m.bestieColor, sx, sy,
      ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      d: `M ${a.x},${a.y} Q ${c.x},${c.y} ${b.x},${b.y}`,
      dIn: `M ${a.x},${a.y} Q ${cIn.x},${cIn.y} ${b.x},${b.y}`,
    });
  });

  /* ─── The chamber's entrance, and the sealing ───
     Owned here rather than in useScrollFX because the seats become new DOM
     nodes the moment the roster loads; a timeline built at app mount would sit
     there animating the placeholder stations it captured.
     Every tween is immediateRender:false, so until this actually plays the room
     rests fully drawn instead of waiting on an animation to become visible. */
  const chamberRef = useRef<HTMLDivElement>(null);

  /* War-table tilt: the tilted plane leans a few degrees toward the cursor.
     Event-driven writes to CSS vars, smoothed by a transform transition — no
     rAF loop to keep alive. */
  const tiltable = useRef(false);
  useEffect(() => {
    tiltable.current =
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !window.matchMedia('(pointer: coarse)').matches;
  }, []);
  const handleTilt = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltable.current || !chamberRef.current) return;
    const r = chamberRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const s = chamberRef.current.style;
    s.setProperty('--lean-y', `${(px * 6).toFixed(2)}deg`);
    s.setProperty('--lean-x', `${(py * -3.5).toFixed(2)}deg`);
    // Cursor as light source for the seat portraits.
    s.setProperty('--lx', `${(34 + px * 46).toFixed(1)}%`);
    s.setProperty('--ly', `${(30 + py * 40).toFixed(1)}%`);
  }, []);
  const resetTilt = useCallback(() => {
    chamberRef.current?.style.setProperty('--lean-y', '0deg');
    chamberRef.current?.style.setProperty('--lean-x', '0deg');
  }, []);
  const floorCx = (geo.armL + geo.armR) / 2;
  const floorCy = (geo.armTop + geo.armBottom + geo.r) / 2;
  // Sigil geometry: rings sized to clear the SEALED wordmark, splinters rooted
  // at the outer ring and contained well inside the bench.
  const sigil = { inner: geo.r * 0.27, tickIn: geo.r * 0.295, tickOut: geo.r * 0.325, outer: geo.r * 0.35 };
  const shards = complete ? sealFractures(floorCx, floorCy, sigil.outer, geo.r * 0.62) : [];
  const rays = useMemo(() => inlayRays(floorCx, floorCy, geo.r * 0.30, geo.r * 0.66), [floorCx, floorCy, geo]);
  const rosterKey = `${benchSeats}|${mains.map(m => m.id).join()}|${orderedOthers.map(m => m.id).join()}|${complete}`;

  useEffect(() => {
    const el = chamberRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });

      tl.fromTo('.plan-bench', { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.6, ease: 'power3.out' })
        .fromTo('.plan-inlay, .inlay-band, .plan-tick', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9 }, '-=1.05')
        .fromTo('.chamber-legend, .chamber-crest', { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.1 }, '-=0.85')
        .fromTo('.plan-numeral', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.55, stagger: 0.022 }, '-=0.8')
        // Seats arrive in protocol order, down the left arm and around the bend.
        // Animated on .seat and never on .seat-station, whose translate(-50%,-50%)
        // is the only thing centring it on the bench.
        .fromTo('.seat', { autoAlpha: 0, y: 14, scale: 0.9 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.62, ease: 'power3.out', stagger: 0.038 }, '-=0.85')
        .fromTo('.chamber-mark-inner', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7 }, '-=0.4')
        .fromTo('.plan-bond-group', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, '-=0.3');

      if (complete) {
        /* THE SEAL. The bench flares, a shock rolls out from the centre, the
           sigil engraves itself — rings draw, the fifteen seat-ticks ignite in
           order — the mark stamps down, and the floor splinters outward from
           the outer ring. Then all of it burns off: the seal is witnessed once
           and leaves the floor clean. */
        tl.addLabel('seal', '-=0.2')
          .to('.plan-bench', { stroke: '#fff6da', duration: 0.1 }, 'seal')
          .fromTo('.seal-flash', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 'seal')
          .fromTo('.seal-wave', { attr: { r: 6 }, autoAlpha: 0.85 },
            { attr: { r: geo.r * 1.02 }, autoAlpha: 0, duration: 1.15, ease: 'power2.out' }, 'seal')
          .fromTo('.sigil-ring', { strokeDashoffset: 1, autoAlpha: 1 },
            { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut', stagger: 0.12 }, 'seal')
          .fromTo('.sigil-tick', { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.16, stagger: 0.028 }, 'seal+=0.25')
          .fromTo('.chamber-mark-inner', { scale: 1.65 },
            { scale: 1, duration: 0.8, ease: 'power4.out' }, 'seal')
          .fromTo('.seal-shard', { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 0.1 }, 'seal+=0.1')
          .fromTo('.fracture-mask', { attr: { r: sigil.outer * 0.9 } },
            { attr: { r: geo.r * 0.72 }, duration: 0.55, ease: 'power3.out' }, 'seal+=0.12')
          .to('.seal-flash', { autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, 'seal+=0.1')
          .to('.plan-bench', { stroke: 'url(#chamber-brass)', duration: 0.9 }, 'seal+=0.12')
          // The seal is a moment, not a residue: after a beat to be seen, the
          // fractures die first, then the sigil, leaving the floor clean.
          .to('.seal-shard', { autoAlpha: 0, duration: 1.2, ease: 'power2.in' }, 'seal+=1.1')
          .to('.sigil-tick, .sigil-ring', { autoAlpha: 0, duration: 1.4, ease: 'power2.in' }, 'seal+=1.35');
      }

      // Plays every time the chamber comes into view, from either direction,
      // and reverses smoothly as it leaves back out the way it came — not a
      // one-shot: scroll away and back, and the room convenes again.
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', end: 'bottom top',
        onEnter: () => tl.play(),
        onEnterBack: () => tl.play(),
        onLeaveBack: () => tl.reverse(),
      });
    }, el);

    return () => ctx.revert();
  }, [rosterKey, complete, geo]);

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

  /* War-table tilt — the chamber leans subtly toward the cursor (desktop only) */
  return (
    <section className="hall" id="hall">
      <div className="hall-inner">
        <span className="section-beam" aria-hidden="true" />
        <div className="section-eyebrow"><Decrypt text="The Charter" /></div>
        <h2 className="section-title">Hall of <span className="gold-accent">Founders</span></h2>
        <p className="hall-subtitle">"These students chose to lead before the room was full."</p>
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

        <div
          ref={chamberRef}
          className={`chamber ${complete ? 'sealed' : ''} ${editing ? 'editing' : ''}`}
          style={{ aspectRatio: `${geo.w} / ${geo.h}` }}
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
        >
          <svg className="chamber-plan" viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true" focusable="false">
            <defs>
              {/* Polished stone, lit from above the far rail. */}
              <radialGradient id="chamber-stone" cx="50%" cy="42%" r="76%">
                <stop offset="0%" stopColor="rgba(28,44,92,0.92)" />
                <stop offset="46%" stopColor="rgba(16,27,60,0.95)" />
                <stop offset="100%" stopColor="rgba(8,14,34,0.98)" />
              </radialGradient>
              {/* Brass, for the inlay and the rail. */}
              <linearGradient id="chamber-brass" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8a6a26" />
                <stop offset="26%" stopColor="#e6c675" />
                <stop offset="50%" stopColor="#fff2c8" />
                <stop offset="74%" stopColor="#d4ab4e" />
                <stop offset="100%" stopColor="#7d5f21" />
              </linearGradient>
              <clipPath id="chamber-floor-clip">
                <path d={`${benchPath(geo)} Z`} />
              </clipPath>
            </defs>

            {/* The floor: polished stone within the rail, with a brass
                medallion inlaid at the centre of the chamber. */}
            <path className="plan-floor" d={`${benchPath(geo)} Z`} fill="url(#chamber-stone)" />
            <g clipPath="url(#chamber-floor-clip)">
              <g className="plan-inlay">
                {rays.map((ry, i) => (
                  <line key={i} className={`inlay-ray ${ry.major ? 'is-major' : ''}`}
                    x1={ry.x1} y1={ry.y1} x2={ry.x2} y2={ry.y2} />
                ))}
              </g>
              {/* Concentric bands: the moulding of the medallion. */}
              <circle className="inlay-band" cx={floorCx} cy={floorCy} r={geo.r * 0.30} />
              <circle className="inlay-band is-hair" cx={floorCx} cy={floorCy} r={geo.r * 0.315} />
              <circle className="inlay-band" cx={floorCx} cy={floorCy} r={geo.r * 0.66} />
              <circle className="inlay-band is-hair" cx={floorCx} cy={floorCy} r={geo.r * 0.675} />
            </g>

            {/* The club's name struck around the medallion, and the emblem
                engraved at its centre. */}
            <path id="chamber-legend-arc" fill="none" stroke="none"
              d={`M ${floorCx - geo.r * 0.485},${floorCy} A ${geo.r * 0.485},${geo.r * 0.485} 0 0 1 ${floorCx + geo.r * 0.485},${floorCy}`} />
            <text className="chamber-legend">
              <textPath href="#chamber-legend-arc" startOffset="50%" textAnchor="middle">
                YOUHUA MODEL UNITED NATIONS
              </textPath>
            </text>
            {/* The lower legend needs sweep-flag 0 so the arc runs left to
                right along the BOTTOM; with flag 1 the path runs right to left
                and the glyphs render mirrored. */}
            <path id="chamber-legend-arc-b" fill="none" stroke="none"
              d={`M ${floorCx - geo.r * 0.485},${floorCy} A ${geo.r * 0.485},${geo.r * 0.485} 0 0 0 ${floorCx + geo.r * 0.485},${floorCy}`} />
            <text className="chamber-legend is-lower">
              <textPath href="#chamber-legend-arc-b" startOffset="50%" textAnchor="middle">
                友華模擬聯合國 · ESTABLISHED 2026
              </textPath>
            </text>
            <image className="chamber-crest" href="/un-emblem.svg"
              x={floorCx - geo.r * 0.20} y={floorCy - geo.r * 0.20}
              width={geo.r * 0.40} height={geo.r * 0.40} />

            {/* Station marks: a rule struck inward off the bench, and the seat
                number engraved on the floor beside it. Keeping the numeral here
                rather than on the nameplate is both truer to a plan drawing and
                what lets the stations sit close together without crowding. */}
            {stations.map((s, i) => (
              <g key={i} className="plan-station">
                <line
                  className="plan-tick"
                  x1={s.bx + s.nx * geo.tick0} y1={s.by + s.ny * geo.tick0}
                  x2={s.bx + s.nx * geo.tick1} y2={s.by + s.ny * geo.tick1}
                />
                <text
                  className="plan-numeral"
                  x={s.bx + s.nx * geo.num} y={s.by + s.ny * geo.num}
                  textAnchor="middle" dominantBaseline="central"
                >{i + 1}</text>
              </g>
            ))}
            {/* The rail: a brass moulding, drawn as a double line the way a
                section drawing renders a solid member. */}
            <path className="plan-rail-outer" d={benchPath(geo, -9)} />
            <path className="plan-bench" d={benchPath(geo)} pathLength={1} stroke="url(#chamber-brass)" />
            {bonds.map(b => (
              <g key={b.key} className="plan-bond-group">
                <path className="plan-bond" d={b.d} />
                <path className="plan-bond is-inner" d={b.dIn} />
                {/* The seal: a struck lozenge holding the pair's colour. */}
                <g className="bond-seal" transform={`translate(${b.sx} ${b.sy}) rotate(${b.ang})`}>
                  <rect className="bond-seal-plate" x={-7} y={-7} width={14} height={14} transform="rotate(45)" />
                  <rect className="bond-seal-gem" x={-3.4} y={-3.4} width={6.8} height={6.8}
                    transform="rotate(45)" style={{ fill: b.color, color: b.color }} />
                </g>
              </g>
            ))}

            {complete && (
              <g className="seal-fx">
                <path className="seal-flash" d={`${benchPath(geo)} Z`} />
                <circle className="seal-wave" cx={floorCx} cy={floorCy} r={6} />
                <circle className="sigil-ring sigil-inner" cx={floorCx} cy={floorCy} r={sigil.inner}
                  pathLength={1} strokeDasharray={1} strokeDashoffset={1} />
                <circle className="sigil-ring sigil-outer" cx={floorCx} cy={floorCy} r={sigil.outer}
                  pathLength={1} strokeDasharray={1} strokeDashoffset={1} />
                {/* Fifteen ticks between the rings — one per founding seat,
                    ignited in order as the seats are counted into the record. */}
                {Array.from({ length: MAX }, (_, i) => {
                  const a = (i / MAX) * Math.PI * 2 - Math.PI / 2;
                  return (
                    <line key={`tick-${i}`} className="sigil-tick"
                      x1={floorCx + Math.cos(a) * sigil.tickIn} y1={floorCy + Math.sin(a) * sigil.tickIn}
                      x2={floorCx + Math.cos(a) * sigil.tickOut} y2={floorCy + Math.sin(a) * sigil.tickOut} />
                  );
                })}
                {/* Splinters grow outward through an expanding radial wipe. */}
                <mask id="seal-fracture-reveal">
                  <circle className="fracture-mask" cx={floorCx} cy={floorCy} r={sigil.outer} fill="#fff" />
                </mask>
                <g mask="url(#seal-fracture-reveal)">
                  {shards.map((d, i) => <path key={`shard-${i}`} className="seal-shard" d={d} />)}
                </g>
              </g>
            )}
          </svg>

          <div
            className="chamber-mark"
            aria-hidden="true"
            /* Below the crest, inside the medallion's outer band: the emblem
               holds the centre, the mark sits under it. */
            style={{ top: `${((floorCy + geo.r * 0.45) / geo.h) * 100}%` }}
          >
            {/* Inner wrapper so the seal can scale the mark without fighting the
                translate(-50%,-50%) that centres it. */}
            <span className="chamber-mark-inner">
              <span className="chamber-mark-glyph">◆</span>
              <span className="chamber-mark-text">{complete ? 'Sealed' : 'The Council'}</span>
            </span>
          </div>

          {/* .seat-stand is the 3D joint: the chamber plane is tilted back like
              a table, and the stand counter-rotates so each founder stands
              upright on it. GSAP keeps animating .seat inside, untouched. */}
          {mains.map((m, i) => (
            <div
              className="seat-station is-head"
              key={m.id}
              style={{ left: `${(headXs[i] / geo.w) * 100}%`, top: `${(geo.headY / geo.h) * 100}%` }}
            >
              <div className="seat-stand">
                <Seat member={m} isMain onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
              </div>
            </div>
          ))}

          {stations.map((s, i) => {
            const m = orderedOthers[i];
            return (
              <div
                className="seat-station"
                key={m ? m.id : `vacant-${i}`}
                style={{ left: `${(s.x / geo.w) * 100}%`, top: `${(s.y / geo.h) * 100}%` }}
              >
                <div className="seat-stand">
                  {m
                    ? <Seat member={m} seatNo={i + 1} onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
                    : <VacantSeat seatNo={i + 1} onClaim={editing ? undefined : onClaimSeat} />}
                </div>
              </div>
            );
          })}
        </div>

        {complete
          ? <div className="complete-banner">◆ The Council is Complete ◆</div>
          : <p className="chamber-hint">
              {remaining} seat{remaining !== 1 ? 's' : ''} still unclaimed.{' '}
              {onClaimSeat ? 'Take one, or open any founder to read their dossier.' : 'Open any founder to read their dossier.'}
            </p>}
      </div>
    </section>
  );
}

/* ─── The Secretariat: the Round Table ───
   Every office holds an equal seat on one ring around the club's emblem; no
   office sits above another. The ring is a 3D carousel driven by scroll: the
   stage pins, and as you scroll each seat swings to the front and is
   introduced. A person may hold several offices; an office may seat several
   people (the two Presidents share one chair). */
type RosterPerson =
  | { kind: 'member'; person: EnrichedMember }
  | { kind: 'delegate'; person: Delegate };

const SEAT_SCROLL = 420; // px of scroll each seat gets at the front while pinned

/* Sphere shading laid over every body: a highlight that tracks the cursor
   (--lx/--ly are set on the world), a terminator shadow, and a rim light. */
const OrbShade = () => <span className="orb-shade" aria-hidden="true" />;

function SecretariatSection({ members, delegates, isAdmin, onSelect }: {
  members: EnrichedMember[];
  delegates: Delegate[];
  isAdmin: boolean;
  onSelect: (p: RosterPerson) => void;
}) {
  const people: RosterPerson[] = [
    ...members.map(m => ({ kind: 'member', person: m } as RosterPerson)),
    ...delegates.map(d => ({ kind: 'delegate', person: d } as RosterPerson)),
  ];
  const holdersOf = (id: string) => people.filter(p => rolesOf(p.person).includes(id));
  const seats = ROLES
    .filter(r => r.id !== 'candidate' || holdersOf('candidate').length > 0 || isAdmin)
    .map(r => ({ role: r, holders: holdersOf(r.id) }));
  const n = seats.length;
  const floor = people.filter(p => rolesOf(p.person).length === 0);
  const tableRays = useMemo(() => inlayRays(600, 600, 190, 330, 60), []);

  /* Scroll turns the ring. The stage pins for n × SEAT_SCROLL pixels while
     --theta is scrubbed from 0 to the angle that brings the last seat front;
     the seat nearest the camera is marked so its brief can surface. */
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const [front, setFront] = useState(0);

  /* No entrance ceremony here: the table is simply set, always, the moment it
     mounts. The turning itself — bound directly to scroll position, forward
     and back, every pass — is the animation this room earns; it doesn't need
     a one-off light show in front of it too. */
  useEffect(() => {
    const stage = stageRef.current, ring = ringRef.current;
    if (!stage || !ring || n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const turn = gsap.fromTo(ring, { '--theta': '0deg' }, { '--theta': `${(-360 * (n - 1)) / n}deg`, ease: 'none' });
    const st = ScrollTrigger.create({
      trigger: stage, start: 'top top+=72', end: `+=${n * SEAT_SCROLL}`,
      pin: true, scrub: 1.1, anticipatePin: 1, animation: turn,
      onUpdate: self => {
        const i = Math.round(self.progress * (n - 1));
        setFront(prev => (prev === i ? prev : i));
      },
    });
    triggerRef.current = st;
    return () => { st.kill(); turn.kill(); triggerRef.current = null; };
  }, [n]);

  const jumpTo = (i: number) => {
    const st = triggerRef.current;
    if (!st || n < 2) return;
    const y = st.start + (i / (n - 1)) * (st.end - st.start);
    if (lenisInstance) lenisInstance.scrollTo(y, { duration: 1.1 });
    else window.scrollTo({ top: y, behavior: 'smooth' });
  };

  /* The docket cross-dissolves between offices instead of popping: the
     outgoing plaque gets a brief, fast lift-off before the incoming one is
     even mounted, rather than vanishing the instant the ring settles on a new
     seat. If the table keeps turning past it mid-transition, this simply
     re-targets — only where the user actually stops ever plays an entrance. */
  const [docketFront, setDocketFront] = useState(0);
  const [docketLeaving, setDocketLeaving] = useState(false);
  useEffect(() => {
    if (front === docketFront) return;
    setDocketLeaving(true);
    const t = setTimeout(() => { setDocketFront(front); setDocketLeaving(false); }, 220);
    return () => clearTimeout(t);
  }, [front, docketFront]);

  /* The world leans toward the cursor, and the cursor is the light source. */
  const leanable = useRef(false);
  useEffect(() => {
    leanable.current =
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !window.matchMedia('(pointer: coarse)').matches;
  }, []);
  const onLean = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!leanable.current || !worldRef.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const s = worldRef.current.style;
    s.setProperty('--lean-y', `${(px * 9).toFixed(2)}deg`);
    s.setProperty('--lx', `${(34 + px * 46).toFixed(1)}%`);
    s.setProperty('--ly', `${(30 + py * 40).toFixed(1)}%`);
  }, []);
  const offLean = useCallback(() => { worldRef.current?.style.setProperty('--lean-y', '0deg'); }, []);

  const ARC = 'M 52,600 A 548,548 0 1 1 1148,600 A 548,548 0 1 1 52,600';

  return (
    <section className="section secretariat" id="secretariat">
      <span className="section-beam" aria-hidden="true" />
      <div className="section-eyebrow"><Decrypt text="The Secretariat" /></div>
      <h2 className="section-title">The <span className="gold-accent">Round Table</span></h2>
      <p className="secretariat-sub">Every office, an equal seat. Scroll to turn the table · 社團幹部</p>

      <div className="rt-stage" ref={stageRef} onMouseMove={onLean} onMouseLeave={offLean}>
        <div className="rt-world" ref={worldRef}>
          {/* The table top, lying flat: nebula, stars, and the club's name engraved around the rim. */}
          <div className="rt-table">
            <svg className="rt-table-art" viewBox="0 0 1200 1200" aria-hidden="true" focusable="false">
              {/* Brass inlay, matching the council chamber: this is a
                  council table, not a planetarium. Always solid — no reveal. */}
              {tableRays.map((ry, i) => (
                <line key={i} className={`inlay-ray ${ry.major ? 'is-major' : ''}`}
                  x1={ry.x1} y1={ry.y1} x2={ry.x2} y2={ry.y2} />
              ))}
              <circle className="inlay-band" cx={600} cy={600} r={330} />
              <circle className="inlay-band is-hair" cx={600} cy={600} r={344} />
              <path id="rt-rim-arc" d={ARC} fill="none" stroke="none" />
              <text className="rt-table-text">
                <textPath href="#rt-rim-arc" startOffset="0">
                  YOUHUA MODEL UNITED NATIONS · THE SECRETARIAT · 秘書處 ·
                </textPath>
              </text>
            </svg>
          </div>
          <div className="rt-pool" aria-hidden="true" />

          {/* The club's emblem at the centre: the table belongs to the club, not to a chair. */}
          <div className="rt-core" aria-hidden="true">
            <span className="rt-core-ring" />
            <img src="/un-emblem.svg" alt="" className="rt-core-emblem" />
          </div>

          <div className="rt-ring" ref={ringRef} style={{ ['--theta' as any]: '0deg' }}>
            {seats.map((seat, i) => {
              const a = (i * 360) / n;
              const { role, holders } = seat;
              return (
                <Fragment key={role.id}>
                  <span className="rt-shadow" aria-hidden="true" style={{ ['--a' as any]: `${a}deg` }} />
                  <div
                    className={`rt-seat ${i === front ? 'is-front' : ''}`}
                    style={{ ['--a' as any]: `${a}deg`, ['--office' as any]: role.hue }}
                    aria-hidden={i !== front}
                  >
                    <div className="rt-seat-inner">
                      <div className="rt-medals">
                        {holders.length > 0 ? holders.map(h => (
                          <button
                            key={`${h.kind}-${h.person.id}`}
                            className="rt-medal"
                            onClick={() => onSelect(h)}
                            title={`${h.person.fullName} · ${role.zh}`}
                            aria-label={`${h.person.fullName}, ${role.en}`}
                            tabIndex={i === front ? 0 : -1}
                          >
                            {h.person.avatar
                              ? <img src={h.person.avatar} alt="" />
                              : <span className="rt-initial" aria-hidden="true">{(h.person.firstName || '?').charAt(0).toUpperCase()}</span>}
                            <OrbShade />
                          </button>
                        )) : (
                          <div className="rt-medal is-vacant" title={`${role.en} · to be appointed`}>
                            <span className="rt-glyph" aria-hidden="true">{role.glyph}</span>
                            <OrbShade />
                          </div>
                        )}
                      </div>
                      {/* Only the office's name rides the ring. Everything else
                          lives in the flat brief below: upright planes inside a
                          preserve-3d world interleave with the table by depth,
                          so any text here would be cut by the gold rim. */}
                      <div className="rt-office-zh">{role.zh}</div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* The docket: flat 2D and inside the pinned stage, so the table's rim
            can never cut it and it can't scroll away while the ring turns.
            Built as a plaque set down on the table when an office comes to
            front — a docket number stamped in brass at the spine, not a
            centered icon-over-heading card. Cross-dissolves between offices
            via docketFront/docketLeaving above, rather than popping: re-keyed
            only once the outgoing plaque has had its exit, so the CSS
            entrance (rtTabling) plays on genuine arrival, not every tick. */}
        {seats[docketFront] && (
          <div className={`rt-docket ${docketLeaving ? 'is-leaving' : ''}`}
            key={seats[docketFront].role.id} style={{ ['--office' as any]: seats[docketFront].role.hue }}>
            <div className="rt-docket-spine" aria-hidden="true">
              <span className="rt-docket-seal">{seats[docketFront].role.glyph}</span>
              <span className="rt-docket-no">{String(docketFront + 1).padStart(2, '0')}</span>
            </div>
            <div className="rt-docket-body">
              <div className="rt-docket-head">
                <h3 className="rt-docket-zh">{seats[docketFront].role.zh}</h3>
                <span className="rt-docket-en">{seats[docketFront].role.en}</span>
              </div>
              <p className="rt-docket-duty">{seats[docketFront].role.duty}</p>
              <div className="rt-docket-roster">
                <span className="rt-docket-roster-label">Held by</span>
                {seats[docketFront].holders.length > 0 ? (
                  <ul className="rt-docket-list">
                    {seats[docketFront].holders.map(h => (
                      <li key={`${h.kind}-${h.person.id}`}>
                        <button className="rt-docket-person" onClick={() => onSelect(h)}>{h.person.fullName}</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rt-docket-open">seat unassigned · 待任命</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Which seat is at the front; each dot turns the table to that office. */}
        <div className="rt-dots" role="tablist" aria-label="Offices">
          {seats.map((seat, i) => (
            <button
              key={seat.role.id}
              className={`rt-dot ${i === front ? 'on' : ''}`}
              style={{ ['--office' as any]: seat.role.hue }}
              role="tab"
              aria-selected={i === front}
              aria-label={`${seat.role.en} · ${seat.role.zh}`}
              onClick={() => jumpTo(i)}
            />
          ))}
        </div>
      </div>

      <div className="assembly-band">
        <div className="band-title">The Floor · 一般社員</div>
        {floor.length > 0 ? (
          <div className="assembly-grid">
            {floor.map(h => {
              const m = h.person;
              return (
                <button key={`${h.kind}-${m.id}`} className="assembly-chip" onClick={() => onSelect(h)} title={m.fullName}>
                  <span className="assembly-orb">
                    {m.avatar
                      ? <img src={m.avatar} className="assembly-avatar" alt="" />
                      : <span className="assembly-avatar is-initial" aria-hidden="true">{(m.firstName || '?').charAt(0).toUpperCase()}</span>}
                    <OrbShade />
                  </span>
                  <span className="assembly-name">
                    {h.kind === 'member' && <i className="assembly-mark" aria-hidden="true">◆</i>}
                    {m.firstName}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="orr-empty-note">Every member currently holds an office.</p>
        )}
      </div>
    </section>
  );
}

/* ─── About MUN Section ─── */
function AboutSection() {
  const stat1 = useCountUp(193, 2000);
  const stat2 = useCountUp(400, 2000);
  const stat3 = useCountUp(4, 1500);
  const statsRef = useInView(0.3);

  useEffect(() => {
    if (statsRef.visible) { stat1.start(); stat2.start(); stat3.start(); }
  }, [statsRef.visible]);

  const pillars = [
    { word: 'Debate', desc: 'Sharpen your argument. Learn to persuade, not just speak.' },
    { word: 'Diplomacy', desc: 'Navigate complexity. Find consensus where others see conflict.' },
    { word: 'Impact', desc: 'Move beyond the classroom. Shape policy, shape the world.' },
  ];

  return (
    <section className="section about-section" id="about">
      <span className="section-beam" aria-hidden="true" />
      <div className="section-eyebrow"><Decrypt text="The Mission" /></div>
      <h2 className="section-title">What Is <span className="gold-accent">Model United Nations</span>?</h2>
      <p className="about-intro">
        Model United Nations is where students stop being students and start being statesmen.
      </p>

      <div className="pillars">
        {pillars.map((p, i) => (
          <div key={i} className="pillar">
            <div className="pillar-word">{p.word}</div>
            <div className="pillar-desc">{p.desc}</div>
          </div>
        ))}
      </div>

      <div className="stats-row" ref={statsRef.ref}>
        <div className="stat-item">
          <div className="stat-number"><span ref={stat1.ref}>0</span></div>
          <div className="stat-label">UN Member Nations</div>
        </div>
        <div className="stat-item">
          <div className="stat-number"><span ref={stat2.ref}>0</span>K+</div>
          <div className="stat-label">Youth Delegates Globally</div>
        </div>
        <div className="stat-item">
          <div className="stat-number"><span ref={stat3.ref}>0</span>M+</div>
          <div className="stat-label">Resolutions Debated</div>
        </div>
      </div>

      <div className="pull-quote">
        Education is the most powerful weapon which you can use to change the world.
      </div>
      <div className="quote-attr">Nelson Mandela</div>
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

/* ─── Scroll-driven cinematic FX (GSAP ScrollTrigger) ─── */
function useScrollFX() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const heroScrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true as const };

      /* HERO — content lifts away as you scroll (bg + emblem handled by mouse parallax) */
      gsap.to('.hero-content', { yPercent: -22, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '72% top', scrub: true } });
      gsap.to('.scroll-indicator', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '14% top', scrub: true } });
      gsap.to('.torch', { y: -120, opacity: 0, ease: 'none', scrollTrigger: heroScrub });

      // Scroll-scrubbed reveal: each element rises + fades IN as it enters the
      // bottom, then stays put. There used to be a matching swipe-out as the
      // element approached the top, which meant scrolling back to re-read
      // something faded it away from you.
      const reveal = (targets: any, trigger: Element | string, opts: { y?: number; stagger?: any } = {}) => {
        const { y = 50, stagger = 0 } = opts;
        const items = gsap.utils.toArray<HTMLElement>(targets);
        if (!items.length) return;
        gsap.fromTo(items, { autoAlpha: 0, y }, {
          autoAlpha: 1, y: 0, ease: 'power2.out', stagger,
          scrollTrigger: { trigger, start: 'top 90%', end: 'top 60%', scrub: 0.6 },
        });
      };

      gsap.utils.toArray<HTMLElement>('.section-title').forEach((el) => reveal(el, el, { y: 56 }));
      gsap.utils.toArray<HTMLElement>('.section-eyebrow, .about-intro, .hall-subtitle').forEach((el) =>
        reveal(el, el, { y: 26 }));

      reveal('.ledger-row', '.ledger',       { y: 44, stagger: 0.1 });
      reveal('.pillar',     '.pillars',      { y: 48, stagger: 0.1 });
      reveal('.stat-item',  '.stats-row',    { y: 44, stagger: 0.1 });
      reveal('.pull-quote', '.pull-quote',   { y: 56 });
      /* The orrery runs its own entrance from inside SecretariatSection: its
         planets are replaced wholesale when the roster loads. */
      reveal('.assembly-band', '.assembly-band', { y: 30 });

      /* SECTIONS ARRIVE IN 3D: each one lies well back below the fold and
         rights itself as it rises, hinged at its bottom edge. Never hidden, so
         a mis-measure can only leave it dim. The Secretariat is excluded: it
         pins its stage, and position:fixed cannot live inside a transformed
         ancestor. */
      gsap.utils.toArray<HTMLElement>('.section:not(.secretariat), .hall, .delegation').forEach((sec) => {
        gsap.fromTo(sec,
          { rotateX: 16, y: 120, scale: 0.94, autoAlpha: 0.5, transformPerspective: 1400, transformOrigin: '50% 100%' },
          { rotateX: 0, y: 0, scale: 1, autoAlpha: 1, ease: 'none',
            scrollTrigger: { trigger: sec, start: 'top 100%', end: 'top 48%', scrub: 0.6 } });
      });

      /* EDITORIAL MASK — section titles rise out of a clip as they enter */
      gsap.utils.toArray<HTMLElement>('.section-title').forEach((el) => {
        gsap.fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' }, {
          clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
          scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 60%', scrub: 0.6 },
        });
      });

      /* DRAWN FRAMES — plates, pillar dividers and stat separators draw
         themselves once their block enters view (CSS handles the choreography) */
      /* The chamber runs its own entrance from inside HallOfFounders: its seats
         are replaced wholesale when the roster loads, so tweens created here at
         mount would be left holding detached nodes. */

      ['.pillars', '.stats-row', '.ledger'].forEach((sel) => {
        gsap.utils.toArray<HTMLElement>(sel).forEach((el) => {
          ScrollTrigger.create({ trigger: el, start: 'top 80%', once: true, onEnter: () => el.classList.add('drawn') });
        });
      });

      /* LIGHT BEAMS — a thin azure line draws down into each chapter */
      gsap.utils.toArray<HTMLElement>('.section-beam').forEach((el) => {
        gsap.fromTo(el, { scaleY: 0, autoAlpha: 0 }, {
          scaleY: 1, autoAlpha: 1, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 72%', scrub: 0.6 },
        });
      });

      /* TOP SCROLL-PROGRESS BAR */
      gsap.to('.scroll-progress-fill', { scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });
    });

    // Recompute positions once layout/fonts/images settle. The last refresh has
    // to land AFTER the intro finishes — it used to be hardcoded to 3200ms while
    // the intro ran to 4500ms, so the final measurement was taken against a
    // mid-transition layout.
    const { hold, settle } = getIntroPlan();
    const r1 = requestAnimationFrame(() => ScrollTrigger.refresh());
    const t1 = setTimeout(() => ScrollTrigger.refresh(), 600);
    const t2 = setTimeout(() => ScrollTrigger.refresh(), hold + settle + 300);
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('load', onLoad);
      ctx.revert();
    };
  }, []);
}

/* ─── Hero mouse parallax (only AFTER the intro) ─── */
function useHeroParallax(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const bg = document.querySelector('.hero-bg') as HTMLElement | null;
    const emblem = document.querySelector('.hero-emblem') as HTMLElement | null;
    let mx = 0, my = 0, tx = 0, ty = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    const loop = () => {
      tx += (mx - tx) * 0.06;
      ty += (my - ty) * 0.06;
      // .hero-bg already rests at scale(1.07) in CSS, so the parallax engages
      // seamlessly: this first frame (offsets at 0) equals the resting transform —
      // no scale pop, no ramp. Offsets then ease from 0 as the mouse moves.
      if (bg) bg.style.transform = `scale(1.07) translate(${tx * -26}px, ${ty * -26}px)`;
      if (emblem) emblem.style.transform = `translate(calc(-50% + ${tx * 36}px), calc(-50% + ${ty * 32}px))`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      if (bg) bg.style.transform = '';
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
  return (
    <section className="delegation" id="delegation">
      <div className="delegation-inner">
        <span className="section-beam" aria-hidden="true" />
        <div className="section-eyebrow"><Decrypt text="The Delegation" /></div>
        <h2 className="section-title">Founding <span className="gold-accent">Delegates</span></h2>
        <p className="delegation-subtitle">
          The council seats fifteen. The cause belongs to everyone who answers it. Founding Delegates stand on the record beside the founders, without limit.
        </p>
        <div className="delegation-count">
          <span className="delegation-count-num">{delegates.length}</span>
          {delegates.length === 1 ? 'delegate has joined' : 'delegates have joined'}
        </div>

        {delegates.length > 0 ? (
          <div className="delegate-grid">
            {delegates.map((d, i) => (
              <button className="delegate-card" key={d.id} onClick={() => onSelect(d)} title={`${d.fullName} · view`}>
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
              <MagneticCta onClick={onEditProfile}>◆ Edit Your Delegate Profile →</MagneticCta>
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
        setError('Could not register. This account may already be a founder or delegate.');
      }
    } catch {
      setError('Saving failed. The delegate list may not be enabled yet. Ask the admin to publish the Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} label="Join the delegation">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>

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
              <label className="form-label">Biography / Quote <span style={{ color: 'var(--silver-mute)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
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
    </Modal>
  );
}

function DelegateDetailModal({ delegate, onClose, isAdmin, onAdminEdit, onDelete, onSetRoles }: {
  delegate: Delegate;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (d: Delegate) => void;
  onDelete: (id: string, name: string) => void;
  onSetRoles: (id: string, roles: string[]) => void;
}) {
  return (
    <Modal onClose={onClose} overlayClass="detail-overlay" panelClass="detail-card"
      label={`${delegate.fullName} · delegate`} panelStyle={{ textAlign: 'center' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close dossier">×</button>
        {delegate.avatar
          ? <img src={delegate.avatar} className="detail-avatar" alt={delegate.firstName} style={{ margin: '0 auto 1rem', display: 'block' }} />
          : <div className="detail-avatar-placeholder" style={{ margin: '0 auto 1rem' }}>{(delegate.firstName || '?').charAt(0).toUpperCase()}</div>}
        <div className="detail-name">{delegate.fullName}</div>
        <div className="detail-meta">Grade {delegate.grade} · Class {delegate.classGroup}</div>
        <div className="detail-badge">◆ Founding Delegate #{delegate.delegateNumber}</div>
        <OfficeBadges roles={rolesOf(delegate)} />
        {delegate.bio && <div className="detail-bio">"{delegate.bio}"</div>}
        {isAdmin && (
          <div className="admin-panel">
            <div className="admin-panel-label">◆ Administrator Controls</div>
            <RoleToggles value={rolesOf(delegate)} onChange={(roles) => onSetRoles(delegate.id, roles)} />
            <div className="admin-panel-actions">
              <button className="admin-act" onClick={() => onAdminEdit(delegate)}>Edit Photo &amp; Quote</button>
              <button className="admin-act danger" onClick={() => onDelete(delegate.id, delegate.fullName)}>Remove Delegate</button>
            </div>
          </div>
        )}
    </Modal>
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

  /* In-app replacements for window.confirm / window.alert */
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);

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

  const headline = 'The Founding Seats Are Filling.';
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
      else if (!isAdminEmail(user.email)) setNotice({
        title: 'No record yet',
        body: "This account hasn't joined. Claim a Founding Seat, or add your name to the Founding Delegates.",
      });
    } else if (mode === 'claim') {
      setModalOpen(true);
    } else if (mode === 'admin') {
      if (!isAdminEmail(user.email)) setNotice({
        title: 'Access denied',
        body: 'That account does not hold administrator rights.',
      });
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

  const requestRemoveMember = (id: string, name: string) => {
    setSelectedFounder(null);
    setConfirmRequest({
      title: 'Remove this founder?',
      body: `${name} will be struck from the Founding Members. If a delegate is waiting, the longest-waiting one takes the freed seat. This cannot be undone.`,
      confirmLabel: 'Remove Founder',
      danger: true,
      onConfirm: async () => {
        await removeMember(id);
        // If a delegate is waiting, the longest-waiting one fills the freed seat so
        // the council stays at 15. If none are waiting, the seat opens for new founders.
        await promoteEarliestDelegate();
      },
    });
  };

  const requestRemoveDelegate = (id: string, name: string) => {
    setSelectedDelegate(null);
    setConfirmRequest({
      title: 'Remove this delegate?',
      body: `${name} will be struck from the Founding Delegates. This cannot be undone.`,
      confirmLabel: 'Remove Delegate',
      danger: true,
      onConfirm: async () => { await removeDelegate(id); },
    });
  };

  /* Appointments. The realtime listeners refresh the roster; the open dossier
     holds its own snapshot, so it gets patched locally to reflect the change
     without closing. */
  const handleSetMemberRoles = async (id: string, roles: string[]) => {
    await setMemberRoles(id, roles);
    setSelectedFounder(prev => (prev && prev.id === id ? { ...prev, roles, role: undefined } : prev));
  };
  const handleSetDelegateRoles = async (id: string, roles: string[]) => {
    await setDelegateRoles(id, roles);
    setSelectedDelegate(prev => (prev && prev.id === id ? { ...prev, roles, role: undefined } : prev));
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
      <CursorGlow />
      <Starfield />
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
              <div className="user-avatar-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--ice)' }}>◆</div>
            )}
            Edit Profile
          </>
        ) : (
          <><GoogleIcon /> Member Login</>
        )}
      </button>

      {/* Admin login — subtle ⚙ bottom-right (auto-grants if Lucas signs in anywhere) */}
      {!isAdmin ? (
        <button
          onClick={() => startAuth('admin')}
          style={{
            position: 'fixed', bottom: 28, right: 24, zIndex: 940,
            background: 'transparent', border: 'none', color: 'rgba(188,201,226,0.14)',
            fontSize: '0.85rem', cursor: 'pointer', padding: '4px 8px', transition: 'color 0.3s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--silver)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(188,201,226,0.14)')}
          title="Admin Login"
        >⚙</button>
      ) : (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 940,
          background: 'rgba(6,11,24,0.9)', border: '1px solid var(--azure)',
          borderRadius: 999, padding: '6px 14px', fontSize: '0.7rem',
          color: 'var(--azure-bright)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ◆ Admin
          <button onClick={() => setAdminEmail(null)} style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
        </div>
      )}

      {/* ① Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-emblem" aria-hidden="true">
          <span className="emblem-halo" />
          <img src="/un-emblem.svg" alt="" className={`emblem-img ${loaded ? 'alive' : ''}`} />
          <span className="intro-scan" />
        </div>
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
        <div className="torch torch-left"><span className="torch-glow" /><span className="torch-flame" /></div>
        <div className="torch torch-right"><span className="torch-glow" /><span className="torch-flame" /></div>
        <div className="hero-water" />
        <div className="hero-aurora" aria-hidden="true" />
        <HeroDust />

        {/* Top spacer to balance visual layout and center content */}
        <div className="hero-spacer" style={{ flex: '1 1 0%' }} />

        <div className="hero-content">
          <div className="hero-chip" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.05s' }}>
            Session 01 · The Registry
          </div>
          <div className="hero-eyebrow" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.12s' }}>
            Youhua School · Model United Nations
          </div>
          <div className="gold-rule" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.20s' }} />
          <WordRevealTitle text={headline} loaded={loaded} />
          <div className="gold-rule" style={{ marginTop: '1.5rem', opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.55s' }} />
          <p className="hero-sub" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.65s' }}>
            {urgent
              ? '⚡ Almost gone. Only ' + (MAX - count) + ' seat' + (MAX - count !== 1 ? 's' : '') + ' left.'
              : '15 spots. No extensions. No second chances at this title.'}
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
                  <div className="hero-stat-cap">◆ Council · Sealed</div>
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
                ◆ Take Your Seat in the Council →
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
              <MagneticCta onClick={() => scrollToId('delegation')}>◆ See the Delegation →</MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>
                Welcome back, {loggedInDelegate.firstName}. Founding Delegate #{loggedInDelegate.delegateNumber}.
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
              {full && <p className="hero-sealed-note">◆ All 15 Founding Seats Are Sealed</p>}
              <MagneticCta onClick={() => setDelegateModalOpen(true)}>Become a Founding Delegate →</MagneticCta>
              <p className="cta-sub" style={{
                opacity: loaded ? 1 : 0,
                transform: loaded ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.8s ease 0.95s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.95s'
              }}>Unlimited places. Your name still stands on the founding record.</p>
            </div>
          )}
        </div>

        {/* Bottom spacer to prevent overlap between hero-content and scroll-indicator */}
        <div className="hero-spacer" style={{ flex: '1 1 0%', minHeight: '1.5rem' }} />

        <div className="scroll-indicator">
          <span className="scroll-indicator-text">Scroll to Explore</span>
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
        /* A vacant seat is only an invitation for someone who could still take one. */
        onClaimSeat={!full && !loggedInUser && !loggedInDelegate ? () => startAuth('claim') : undefined}
      />

      {/* ③¼ The Secretariat: offices and the floor */}
      <SecretariatSection
        members={enrichedMembers}
        delegates={delegates}
        isAdmin={isAdmin}
        onSelect={(p) => {
          if (p.kind === 'member') setSelectedFounder(p.person as EnrichedMember);
          else setSelectedDelegate(p.person as Delegate);
        }}
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
          © 2026 Youhua MUN · All founding seats recorded on the blockchain of history.
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
          onDelete={requestRemoveMember}
          onSetRoles={handleSetMemberRoles}
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
          onDelete={requestRemoveDelegate}
          onSetRoles={handleSetDelegateRoles}
        />
      )}

      {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />}
      {notice && <NoticeDialog title={notice.title} body={notice.body} onClose={() => setNotice(null)} />}

      {sealedShown && full && (
        <Modal onClose={() => setSealedShown(false)} overlayClass="sealed-overlay"
          panelClass="sealed-panel" label="The chamber is sealed">
          <div className="sealed-stamp">◆</div>
          <h2 className="sealed-title">The Chamber Is Sealed.</h2>
          <p className="sealed-sub">Founding Members have been chosen. The charter is complete.</p>
          <button className="cert-close-btn" onClick={() => setSealedShown(false)}>Close</button>
        </Modal>
      )}
    </>
  );
}
