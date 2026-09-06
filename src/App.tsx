import { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';
// @ts-ignore
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getMembers, subscribeToMembers, addMember, isMemberByEmail, removeMember, updateMember, toggleMainFounder, setMemberRoles, migrateDelegatesIntoCouncil, reorderMembers, setBesties, clearBesties, type Member } from './storage';
import { signInWithGoogle, getCachedGoogleUser, renderGoogleButton, type GoogleUser } from './googleAuth';
import { LangProvider, useLang, useT } from './i18n';

gsap.registerPlugin(ScrollTrigger);

const ADMIN_EMAIL = 'lucas1121.lin@gmail.com';
const isAdminEmail = (email?: string | null) => !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

/* Chapters used by the scroll rail + side menu. Labels are keys now, so the
   rail translates with everything else. */
const CHAPTERS = [
  { id: 'hero',        key: 'ch.hero' },
  { id: 'about',       key: 'ch.about' },
  { id: 'council',     key: 'ch.council' },
  { id: 'secretariat', key: 'ch.offices' },
] as const;

/* ─── The club's offices ───
   Ported from the Round Table branch. The ids and the Chinese names are that
   work; the English names and duties live in the dictionary so both languages
   stay in one place. A person may hold several offices. */
type RoleDef = { id: string; zh: string; hue: string; glyph: string };
const ROLES: RoleDef[] = [
  { id: 'president', zh: '正副社長', hue: 'oklch(84% 0.130 88)',  glyph: '✦' },
  { id: 'events',    zh: '活動',     hue: 'oklch(78% 0.120 355)', glyph: '❖' },
  { id: 'treasury',  zh: '總務',     hue: 'oklch(82% 0.110 168)', glyph: '◈' },
  { id: 'academics', zh: '教學',     hue: 'oklch(77% 0.118 258)', glyph: '❋' },
  { id: 'pr',        zh: '公關',     hue: 'oklch(76% 0.120 300)', glyph: '◎' },
  { id: 'web',       zh: '網管',     hue: 'oklch(82% 0.100 220)', glyph: '◉' },
];
const roleById = (id?: string) => (id ? ROLES.find(r => r.id === id) : undefined);
/* Offices a person holds; still reads the older single `role` field. */
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

/* ─── The collar ───
   The ring the emblem sits inside. There is no cap to fill any more, so it is
   not a gauge: it is a slowly turning open arc, the way the table is open. */
function CouncilCollar() {
  const r = 96;
  const circ = 2 * Math.PI * r;
  return (
    <svg className="collar" viewBox="0 0 210 210" aria-hidden="true">
      <circle cx="105" cy="105" r={r} className="ring-bg" />
      <circle cx="105" cy="105" r={r} className="ring-open"
        strokeDasharray={`${(circ * 0.055).toFixed(2)} ${(circ * 0.035).toFixed(2)}`} />
    </svg>
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

  const t = useT();
  return (
    <div className="scroll-rail">
      {CHAPTERS.map((c, i) => (
        <button
          key={c.id}
          className={`rail-node ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}`}
          onClick={() => scrollToId(c.id)}
          aria-label={t(c.key)}
        >
          <span className="rail-line" />
          <span className="rail-diamond" />
          <span className="rail-label">{t(c.key)}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Language toggle ───
   One control, always showing the language it will switch you TO, which is
   the convention that needs no explaining. */
function LangToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <button
      className="lang-toggle"
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
      aria-label={t('nav.langLabel')}
      lang={lang === 'en' ? 'zh-Hant' : 'en'}
    >
      {t('nav.lang')}
    </button>
  );
}

/* ─── Navbar ─── */
function Navbar({ onMenu, count }: { onMenu: () => void; count: number }) {
  const [scrolled, setScrolled] = useState(false);
  const t = useT();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <button className="nav-menu-btn" onClick={onMenu} aria-label={t('nav.menu')}>
        <span className="nav-menu-lines"><span /><span /></span>
        <span className="nav-menu-text">{t('nav.menu')}</span>
      </button>
      <div className="nav-crest">Youhua MUN</div>
      <div className="nav-status">
        <LangToggle />
        <span className="nav-status-text">{t('nav.members', { n: count })}</span>
      </div>
    </nav>
  );
}

/* ─── Slide-out Menu ─── */
function SideMenu({ onClose }: { onClose: () => void }) {
  const t = useT();
  const links = CHAPTERS;
  const go = (id: string) => { onClose(); setTimeout(() => scrollToId(id), 220); };
  return (
    <>
      <div className="menu-overlay" onClick={onClose} />
      <div className="menu-panel">
        <button className="menu-close" onClick={onClose} aria-label="Close menu">×</button>
        {links.map((l) => (
          <button key={l.id} className="menu-link" onClick={() => go(l.id)}>
            <span className="menu-mark" aria-hidden="true">◆</span>{t(l.key)}
          </button>
        ))}
        <div className="menu-footer">Youhua School · Model United Nations · Est. 2026</div>
      </div>
    </>
  );
}

/* ─── Audio Toggle (procedural ambient drone) ─── */
function AudioToggle() {
  const t = useT();
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
      <span className="audio-label">{playing ? t('nav.soundOn') : t('nav.sound')}</span>
    </button>
  );
}

/* ─── Sign-in Modal (reliable rendered Google button) ─── */
function AuthModal({ mode, onUser, onClose }: { mode: 'login' | 'claim' | 'admin'; onUser: (u: GoogleUser) => void; onClose: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = useT();
  const copy = {
    login: { title: t('login.title'), sub: t('login.sub') },
    claim: { title: t('join.title'), sub: t('join.sub') },
    admin: { title: t('admin.title'), sub: t('admin.sub') },
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

/* ─── Join the council ─── */
function RegistrationModal({ onClose, onSuccess, preAuth }: {
  onClose: () => void;
  onSuccess: (m: Member) => void;
  preAuth: GoogleUser | null;
}) {
  const t = useT();
  const [step, setStep] = useState<'auth' | 'form' | 'welcome'>('auth');
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
    const existing = isMemberByEmail(user.email);
    if (existing) { setExistingMember(existing); setStep('welcome'); }
    else { setStep('form'); }
  }, []);

  useEffect(() => { if (preAuth) applyUser(preAuth); }, [preAuth, applyUser]);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try { applyUser(await signInWithGoogle()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'); }
    finally { setLoading(false); }
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t('nav.close')}>×</button>

        {step === 'auth' && (
          <>
            <h2 className="modal-title">{t('join.title')}</h2>
            <p className="modal-subtitle">{t('join.sub')}</p>
            <button className="google-btn" onClick={handleGoogleAuth} disabled={loading}>
              {loading ? <span>{t('join.verifying')}</span> : (<><GoogleIcon /><span>{t('join.google')}</span></>)}
            </button>
            <div id="google-signin-fallback" style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'center' }} />
            {error && <p className="form-error">{error}</p>}
          </>
        )}

        {step === 'welcome' && existingMember && (
          <div className="welcome-back">
            <h2 className="modal-title">{t('join.backTitle', { name: existingMember.firstName })}</h2>
            <p className="modal-subtitle">{t('join.backSub', { n: existingMember.memberNumber })}</p>
          </div>
        )}

        {step === 'form' && (
          <>
            <h2 className="modal-title">{t('join.formTitle')}</h2>
            <p className="modal-subtitle">{t('join.formSub')}</p>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">{t('join.name')}</label>
              <input id="reg-name" className="form-input" value={fullName}
                onChange={e => setFullName(e.target.value)} placeholder={t('join.namePh')} />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-grade">{t('join.grade')}</label>
              <select id="reg-grade" className="form-select" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">{t('join.gradePh')}</option>
                {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-class">{t('join.class')}</label>
              <input id="reg-class" className="form-input" value={classGroup}
                onChange={e => setClassGroup(e.target.value)} placeholder="S1-1 · 904" />
            </div>

            <button className="submit-btn" onClick={handleSubmit}
              disabled={!fullName || !grade || !classGroup || loading}>
              {loading ? t('join.saving') : t('join.submit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Profile Editor Modal ─── */
function ProfileEditorModal({ member, onClose, onUpdate, numberLabel, saveFn }: { member: Member; onClose: () => void; onUpdate: () => void; numberLabel?: string; saveFn?: (email: string, updates: Partial<Pick<Member, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>) => Promise<any> }) {
  const t = useT();
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
              {selectedAvatar?.name || t('avatar.none')}
            </div>
          </div>
        </div>

        <button className="submit-btn" onClick={handleSave} disabled={saving} style={{ marginTop: '2rem' }}>
          {saving ? t('profile.saving') : t('profile.save')}
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
  const t = useT();
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
        <div className="detail-meta">{t('detail.meta', { grade: member.grade, class: member.classGroup })}</div>

        <div className={`detail-badge ${member.isMainFounder ? 'is-chair' : ''}`}>
          {member.isMainFounder && <span aria-hidden="true">★ </span>}{displayTitle}
        </div>

        {member.avatarName && <div className="detail-anime-label">{t('detail.avatar', { name: member.avatarName })}</div>}
        {member.bio && <div className="detail-bio">"{member.bio}"</div>}

        {isAdmin && (
          <div className="admin-panel">
            <div className="admin-panel-label">{t('admin.controls')}</div>
            <div className="admin-panel-actions">
              <button className="admin-act" onClick={() => onAdminEdit(member)}>{t('detail.edit')}</button>
              <button className="admin-act" onClick={() => onToggleMain(member.id, !member.isMainFounder)}>
                {member.isMainFounder ? t('admin.unmakeHead') : t('admin.makeHead')}
              </button>
              <button className="admin-act danger" onClick={() => onDelete(member.id, member.fullName)}>{t('admin.remove')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Certificate ─── */
function Certificate({ member, onClose }: { member: Member; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 }, colors: CONFETTI_BLUES });
    const again = setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { y: 0.4 }, colors: CONFETTI_BLUES }), 600);
    return () => clearTimeout(again);
  }, []);

  return (
    <div className="certificate-overlay" onClick={onClose}>
      <div className="certificate" onClick={e => e.stopPropagation()}>
        <div className="cert-ornament">{t('nav.council')}</div>
        <div className="cert-name">{member.fullName}</div>
        <div className="cert-number">{t('council.seat', { n: member.memberNumber })}</div>
        <div className="cert-seal" aria-hidden="true">◆</div>
        <div className="cert-footer">{t('foot.name')}</div>
        <button className="cert-close-btn" onClick={onClose}>{t('nav.close')}</button>
      </div>
    </div>
  );
}

/* ─── What MUN is, and what the UN is ───
   This replaces the old "why become a founding member" pitch. Nobody needs to
   be sold a seat; they need to know what the thing actually is. Two spreads,
   each a definition rather than a benefit: the club, then the institution it
   models. Set as a definition list, because a row of equal cards would flatten
   three unequal ideas into one shape. */
function MunSection() {
  const t = useT();
  const points = [
    { term: t('mun.p1.term'), desc: t('mun.p1.desc') },
    { term: t('mun.p2.term'), desc: t('mun.p2.desc') },
    { term: t('mun.p3.term'), desc: t('mun.p3.desc') },
  ];
  return (
    <section className="section" id="about">
      <div className="explainer">
        <h2 className="section-title">
          {t('mun.title1')} <span className="gold-accent">{t('mun.titleAccent')}</span> {t('mun.title2')}
        </h2>
        <p className="about-intro">{t('mun.lede')}</p>
      </div>

      <div className="pillars">
        {points.map((p) => (
          <div key={p.term} className="pillar">
            <h3 className="pillar-word">{p.term}</h3>
            <p className="pillar-desc">{p.desc}</p>
          </div>
        ))}
      </div>

      <div className="explainer explainer-un">
        <h2 className="section-title">
          {t('un.title1')} <span className="gold-accent">{t('un.titleAccent')}</span> {t('un.title2')}
        </h2>
        <p className="about-intro">{t('un.lede')}</p>
      </div>
    </section>
  );
}

/* ═══ Seating ═══════════════════════════════════════════════════
   The horseshoe of the Security Council chamber, parameterised by arc length
   so that N members are genuinely evenly spaced for any N, and every seat
   glides to a recomputed position the moment someone joins or leaves.

   The subtlety is that the table is drawn in percentages of a box that is not
   square, so a step of 1% across the bottom is a different physical distance
   from a step of 1% up the side. Walking the path in raw percentage units
   therefore bunches seats around the turns. Everything below is measured in
   an aspect-corrected space (x scaled by the box's width/height ratio), the
   distances are accumulated there, and only the final point is converted back
   to percentages for layout.
════════════════════════════════════════════════════════════════ */

/* Geometry of the table, in percent of the chamber box. */
const TABLE = { left: 15, right: 85, top: 21, bottom: 90, radius: 15 };

type Pt = { x: number; y: number };

/* Samples the horseshoe densely, then walks it at constant physical speed.
   `ratio` is the chamber's width / height, which converts x-percent into the
   same physical unit as y-percent. */
function seatPositions(n: number, ratio: number): Pt[] {
  if (n <= 0) return [];
  const { left, right, top, bottom, radius: r } = TABLE;
  const yBend = bottom - r;

  /* One continuous path: down the left arm, round the bottom-left turn,
     along the bottom, round the bottom-right turn, up the right arm. */
  const path: Pt[] = [];
  const push = (x: number, y: number) => path.push({ x, y });
  const STEPS = 160;

  for (let i = 0; i <= STEPS; i++) push(left, top + (yBend - top) * (i / STEPS));
  for (let i = 1; i <= STEPS; i++) {
    const a = Math.PI - (Math.PI / 2) * (i / STEPS);      // 180° → 90°
    push(left + r + r * Math.cos(a), yBend + r * Math.sin(a));
  }
  for (let i = 1; i <= STEPS; i++) push((left + r) + ((right - r) - (left + r)) * (i / STEPS), bottom);
  for (let i = 1; i <= STEPS; i++) {
    const a = (Math.PI / 2) * (1 - i / STEPS);            // 90° → 0°
    push(right - r + r * Math.cos(a), yBend + r * Math.sin(a));
  }
  for (let i = 1; i <= STEPS; i++) push(right, yBend - (yBend - top) * (i / STEPS));

  /* Cumulative physical length along the sampled path. */
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = (path[i].x - path[i - 1].x) * ratio;
    const dy = path[i].y - path[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];

  /* Walk it at even intervals, half a step in from each end so the first and
     last seats sit inside the arms rather than on their tips. */
  const at = (d: number): Pt => {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid + 1; else hi = mid; }
    if (lo === 0) return path[0];
    const span = cum[lo] - cum[lo - 1];
    const t = span > 0 ? (d - cum[lo - 1]) / span : 0;
    return {
      x: path[lo - 1].x + (path[lo].x - path[lo - 1].x) * t,
      y: path[lo - 1].y + (path[lo].y - path[lo - 1].y) * t,
    };
  };

  return Array.from({ length: n }, (_, i) => at(total * ((i + 0.5) / n)));
}

type EnrichedMember = Member & { displayTitle: string };

function Seat({ member, isMain, onClick, selected, editing, label }: {
  member: EnrichedMember;
  isMain?: boolean;
  onClick: (m: EnrichedMember) => void;
  selected?: boolean;
  editing?: boolean;
  label: string;
}) {
  const bestie = member.bestieColor;
  return (
    <div className="seat-upright">
      <button
        className={`seat filled ${isMain ? 'main' : ''} ${selected ? 'selected' : ''} ${editing ? 'editing' : ''} ${bestie ? 'has-bestie' : ''}`}
        onClick={() => onClick(member)}
        title={member.fullName}
        style={bestie ? ({ ['--bestie' as any]: bestie }) : undefined}
      >
        {member.avatar
          ? <img src={member.avatar} className="seat-avatar" alt="" />
          : <span className="seat-avatar placeholder" aria-hidden="true">{(member.firstName || '?').charAt(0).toUpperCase()}</span>}
        {bestie && <span className="bestie-dot" style={{ background: bestie }} aria-hidden="true" />}
        <span className="seat-label">
          <span className="seat-name">{member.firstName}</span>
          <span className="seat-grade">{label}</span>
        </span>
      </button>
    </div>
  );
}

/* ─── The Council ───
   Reference: the UN Security Council chamber, Arnstein Arneberg, 1952. The
   horseshoe table is his, so that everyone seated can look everyone else in
   the eye. The blue ground carrying a gold damask of corn, hearts and anchors
   — hope, charity and faith — is Else Poulsson's wall fabric for that room,
   drawn here as a real repeating motif rather than a generic glow, and the
   rising form behind the table answers Per Krohg's phoenix on its east wall.

   The table is open: it seats however many people have joined, and every seat
   is recomputed and glides to its new position whenever that number changes. */
function CouncilSection({ members, onSeatClick, isAdmin, onAssignOffice }: {
  members: EnrichedMember[];
  onSeatClick: (m: EnrichedMember) => void;
  isAdmin: boolean;
  onAssignOffice: (m: EnrichedMember) => void;
}) {
  const t = useT();
  const chamberRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(800 / 640);

  /* The seating maths needs the chamber's real aspect to keep spacing even,
     and that changes with the breakpoint, so it is measured rather than
     assumed. */
  useEffect(() => {
    const el = chamberRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setRatio(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [editMode, setEditMode] = useState<'none' | 'arrange' | 'bestie' | 'office'>('none');
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (!isAdmin) { setEditMode('none'); setSelected([]); } }, [isAdmin]);

  const head = members.filter(m => m.isMainFounder);
  const others = members.filter(m => !m.isMainFounder);

  const byJoin = [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const joinIndex = new Map(byJoin.map((m, i) => [m.id, i] as const));
  const orderKey = (m: EnrichedMember) => (typeof m.seat === 'number' ? m.seat : (joinIndex.get(m.id) ?? 0));
  const seated = [...others].sort((a, b) => orderKey(a) - orderKey(b));
  const positions = seatPositions(seated.length, ratio);

  const handleSeatClick = (m: EnrichedMember) => {
    if (editMode === 'none' || !isAdmin) { onSeatClick(m); return; }
    if (editMode === 'office') { onAssignOffice(m); return; }
    setSelected(prev => {
      if (prev.includes(m.id)) return prev.filter(x => x !== m.id);
      const next = [...prev, m.id];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  useEffect(() => {
    if (editMode !== 'arrange' || selected.length !== 2) return;
    const [aId, bId] = selected;
    const ai = seated.findIndex(m => m.id === aId);
    const bi = seated.findIndex(m => m.id === bId);
    if (ai >= 0 && bi >= 0) {
      const next = [...seated];
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
  const tool = (id: 'arrange' | 'bestie' | 'office', label: string) => (
    <button className={`council-tool ${editMode === id ? 'active' : ''}`}
      onClick={() => { setEditMode(editMode === id ? 'none' : id); setSelected([]); }}>{label}</button>
  );

  return (
    <section className="hall" id="council">
      <div className="hall-inner">
        <h2 className="section-title">
          {t('council.title1')} <span className="gold-accent">{t('council.accent')}</span>
        </h2>
        <p className="hall-subtitle">{members.length ? t('council.sub') : t('council.empty')}</p>

        {isAdmin && (
          <div className="council-admin">
            {tool('arrange', t('council.arrange'))}
            {tool('bestie', t('council.besties'))}
            {tool('office', t('council.offices'))}
            {editMode === 'arrange' && <span className="council-hint">{t('council.hintArrange')}</span>}
            {editMode === 'office' && <span className="council-hint">{t('council.hintOffice')}</span>}
            {editMode === 'bestie' && (
              <span className="council-hint">
                {selected.length < 2 ? t('council.hintBestie') : (
                  pairAreBesties
                    ? <button className="council-go danger" onClick={unpair}>{t('council.unpair')}</button>
                    : <button className="council-go" onClick={makeBesties}>{t('council.pair')}</button>
                )}
              </span>
            )}
          </div>
        )}

        <div className={`hall-chamber ${editing ? 'editing' : ''}`} ref={chamberRef}>
          <ChamberRoom />
          <div className="chamber-stage">
            <div className="chamber-dais" />
            <div className="chamber-floor" />
            <div className="chamber-emblem" aria-hidden="true">◆<span>{t('nav.council')}</span></div>
            {head.map((m, i) => (
              <div className="seat-wrap is-main" key={m.id}
                style={{ left: `${50 + (i - (head.length - 1) / 2) * 17}%`, top: '9%' }}>
                <Seat member={m} isMain onClick={handleSeatClick}
                  selected={selected.includes(m.id)} editing={editing} label={t('council.head')} />
              </div>
            ))}
            {seated.map((m, i) => {
              const pt = positions[i];
              if (!pt) return null;
              return (
                <div className="seat-wrap seat-movable" key={m.id}
                  style={{ left: `${pt.x.toFixed(3)}%`, top: `${pt.y.toFixed(3)}%` }}>
                  <Seat member={m} onClick={handleSeatClick}
                    selected={selected.includes(m.id)} editing={editing} label={m.grade} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* The room itself, drawn once. Poulsson's damask is a real tiling motif —
   a sheaf of corn, a heart and an anchor — not an abstract texture. */
function ChamberRoom() {
  return (
    <div className="chamber-room" aria-hidden="true">
      <svg className="chamber-wall" viewBox="0 0 960 800" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <pattern id="poulsson" width="60" height="72" patternUnits="userSpaceOnUse">
            <g className="damask">
              {/* corn — hope */}
              <path d="M15 12 v16 M15 14 q-5 2 -5 6 q5 0 5 -4 M15 14 q5 2 5 6 q-5 0 -5 -4
                       M15 20 q-5 2 -5 6 q5 0 5 -4 M15 20 q5 2 5 6 q-5 0 -5 -4" />
              {/* heart — charity */}
              <path d="M45 22 q-7 -8 -11 -3 q-4 5 4 11 l7 7 l7 -7 q8 -6 4 -11 q-4 -5 -11 3 z" />
              {/* anchor — faith */}
              <path d="M30 48 v20 M30 48 a3 3 0 1 1 0.1 0 M23 55 h14 M20 63 q10 12 20 0" />
            </g>
          </pattern>
          <radialGradient id="phoenix" cx="50%" cy="86%" r="62%">
            <stop offset="0%"   className="ph-hot" />
            <stop offset="46%"  className="ph-mid" />
            <stop offset="100%" className="ph-out" />
          </radialGradient>
        </defs>
        <rect width="960" height="800" className="wall-ground" />
        <rect width="960" height="800" fill="url(#poulsson)" />
        {/* Krohg's phoenix rose from the dark at the bottom of his mural into
            calm at the top; this is that gradient, not a copy of the painting. */}
        <rect width="960" height="800" fill="url(#phoenix)" />
      </svg>
      <span className="chamber-rail" />
    </div>
  );
}

/* ─── The Secretariat ───
   Ported from the Round Table branch: the offices and their duties are that
   work. The presentation is not — the turning nebula table is left behind in
   favour of plates that simply sit still and can be read. */
function SecretariatSection({ members, onSelect }: {
  members: EnrichedMember[];
  onSelect: (m: EnrichedMember) => void;
}) {
  const t = useT();
  return (
    <section className="section" id="secretariat">
      <div className="explainer">
        <h2 className="section-title">
          {t('off.title1')} <span className="gold-accent">{t('off.accent')}</span>
        </h2>
        <p className="section-lede">{t('off.sub')}</p>
      </div>

      <div className="office-grid">
        {ROLES.map((role) => {
          const holders = members.filter(m => rolesOf(m).includes(role.id));
          return (
            <article className={`office ${role.id === 'president' ? 'is-chair' : ''}`}
              key={role.id} style={{ ['--office' as any]: role.hue }}>
              <header className="office-head">
                <span className="office-glyph" aria-hidden="true">{role.glyph}</span>
                <div>
                  <h3 className="office-zh">{t(`role.${role.id}.en` as any)}</h3>
                  <p className="office-en">{role.zh}</p>
                </div>
              </header>
              <p className="office-duty">{t(`role.${role.id}.duty` as any)}</p>
              <footer className="office-holders">
                <span className="office-holders-label">{holders.length ? t('off.heldBy') : t('off.vacant')}</span>
                {holders.length > 0 && (
                  <ul className="office-list">
                    {holders.map(h => (
                      <li key={h.id}>
                        <button className="office-person" onClick={() => onSelect(h)}>
                          {h.avatar
                            ? <img src={h.avatar} alt="" className="office-face" />
                            : <span className="office-face placeholder" aria-hidden="true">{(h.firstName || '?').charAt(0).toUpperCase()}</span>}
                          {h.fullName}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Ticker ─── */
function Ticker({ members }: { members: Member[] }) {
  const t = useT();
  if (members.length === 0) return null;
  const items = [...members, ...members];
  return (
    <div className="ticker-bar" aria-hidden="true">
      <div className="ticker-track">
        {items.map((m, i) => (
          <span key={i} className="ticker-item">
            {t('ticker.joined', { name: m.firstName, grade: m.grade })}
          </span>
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

type DepthOpts = { depth?: number; rise?: number; lift?: number; offset?: number };

/* Nothing here animates a filter. Blurring on scroll reads beautifully and
   costs the earth: the browser re-renders the blurred plane on every frame
   instead of just re-compositing it, which measured out at 8fps on a
   mid-range machine. Perspective already sells the depth, because moving a
   plane along Z scales it against the lens. Transform and opacity are the
   two properties the compositor can animate without repainting, so those
   are the two the rig is allowed to touch. */
function depthReveal(el: Element, opts: DepthOpts = {}) {
  const { depth = 420, rise = 60, lift = 240, offset = 0 } = opts;
  const start = `top ${(P_IN_START * 100 - offset).toFixed(1)}%`;
  const end = `top ${(P_OUT_END * 100 - offset).toFixed(1)}%`;

  const tl = gsap.timeline({
    scrollTrigger: { trigger: el, start, end, scrub: 0.55 },
    defaults: { transformPerspective: LENS, force3D: true },
  });

  tl.fromTo(el,
      { autoAlpha: 0, z: -depth, y: rise, rotateX: 7 },
      { autoAlpha: 1, z: 0, y: 0, rotateX: 0, duration: D_IN, ease: 'expo.out' })
    /* The hold is a real, empty stretch of scroll: the element sits at z:0
       so type renders on the pixel grid while you are actually reading it. */
    .to(el, { duration: D_HOLD })
    .to(el,
      { autoAlpha: 0, z: lift, y: -(rise * 0.85), rotateX: -5,
        duration: D_OUT, ease: 'power2.in' });

  return tl;
}

/* Scroll-driven cinematic FX */
function useScrollFX() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      /* ── HERO: a three-plane camera move ──
         The photograph pushes in and defocuses, the emblem swells and
         passes the lens, the headline flies over your shoulder. Each
         plane is a different element from the one mouse-look drives,
         so the two rigs never overwrite each other's transform. */
      gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.4 } })
        .to('.hero-bg', { scale: 1.24, yPercent: 5, ease: 'none' }, 0)
        /* Haze rising is the defocus. Fading a static gradient is a
           compositor job; animating a blur is a repaint. */
        .to('.hero-haze', { opacity: 1, ease: 'none' }, 0)
        .to('.emblem-dolly', { scale: 1.85, autoAlpha: 0, ease: 'power1.in' }, 0)
        .to('.hero-orb-1', { yPercent: -46, ease: 'none' }, 0)
        .to('.hero-orb-2', { yPercent: -18, ease: 'none' }, 0);

      gsap.fromTo('.hero-content',
        { z: 0, y: 0, autoAlpha: 1 },
        { z: 480, y: -60, autoAlpha: 0,
          transformPerspective: 1100, ease: 'power2.in',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: '66% top', scrub: 0.4 } });

      gsap.to('.scroll-indicator', { autoAlpha: 0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: '12% top', scrub: true } });

      /* ── PAGE PLANES ── */
      gsap.utils.toArray<HTMLElement>('.section-title, .about-intro, .hall-subtitle, .section-lede')
        .forEach((el) => depthReveal(el, { depth: 460, rise: 54 }));

      /* Rows stagger in SCROLL space rather than in time: each card
         starts a little later down the page, so the cascade reads the
         same coming back up as it does going down. */
      const scrollStagger = (sel: string, step: number, o: DepthOpts = {}) =>
        gsap.utils.toArray<HTMLElement>(sel).forEach((el, i) =>
          depthReveal(el, { ...o, offset: i * step }));

      scrollStagger('.pillar', 2.5, { depth: 340, rise: 40 });
      scrollStagger('.office', 2.0, { depth: 380, rise: 46 });

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
      if (chamber && !window.matchMedia('(pointer: coarse)').matches) {
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
         rates for the same head movement. That is the whole parallax.
         The emblem is laid out in the medallion column now rather than
         absolutely centred, so it takes a plain offset: the -50% that used
         to centre it would drag it out of its own cell. */
      if (plate) plate.style.transform = `translate3d(${tx * -26}px, ${ty * -26}px, 0)`;
      if (emblem) emblem.style.transform = `translate3d(${tx * 22}px, ${ty * 20}px, 0)`;
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

/* ─── Main App ─── */
function Site() {
  const t = useT();
  const [members, setMembers] = useState<Member[]>(getMembers());
  const [modalOpen, setModalOpen] = useState(false);
  const [certificate, setCertificate] = useState<Member | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState<Member | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<EnrichedMember | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(getCachedGoogleUser());
  const [adminEditMember, setAdminEditMember] = useState<Member | null>(null);
  const [officeFor, setOfficeFor] = useState<EnrichedMember | null>(null);

  const isAdmin = isAdminEmail(adminEmail);
  const count = members.length;

  /* Council numbers follow arrival order; the chair is titled, not numbered. */
  const enrichedMembers: EnrichedMember[] = members.map(m => ({
    ...m,
    displayTitle: m.isMainFounder ? t('council.head') : t('council.seat', { n: m.memberNumber }),
  }));

  const onLoadDone = useCallback(() => setLoaded(true), []);
  const onIntroComplete = useCallback(() => setIntroComplete(true), []);

  useSmoothScroll();
  useScrollFX();
  useHeroParallax(introComplete);

  useEffect(() => {
    const unsubscribe = subscribeToMembers((newMembers) => {
      setMembers([...newMembers]);
      setLoggedInUser(prev => prev ? newMembers.find(m => m.email === prev.email) || null : null);
    });
    return () => unsubscribe();
  }, []);

  /* Anyone who signed up under the old Founding Delegates tier is folded into
     the council rather than dropped. Idempotent, and a no-op once run. */
  useEffect(() => { migrateDelegatesIntoCouncil().catch(() => {}); }, []);

  const refresh = useCallback(() => {}, []);
  const [authMode, setAuthMode] = useState<null | 'login' | 'claim' | 'admin'>(null);

  const proceedWithUser = (user: GoogleUser, mode: 'login' | 'claim' | 'admin') => {
    setGoogleUser(user);
    if (isAdminEmail(user.email)) setAdminEmail(user.email);
    const member = isMemberByEmail(user.email);
    if (member) setLoggedInUser(member);
    setAuthMode(null);
    if (mode === 'login') {
      if (member) setProfileModalOpen(true);
      else if (!isAdminEmail(user.email)) setModalOpen(true);   // not seated yet: offer a seat
    } else if (mode === 'claim') {
      setModalOpen(true);
    }
  };

  const startAuth = (mode: 'login' | 'claim' | 'admin') => {
    if (mode === 'login' && loggedInUser) { setProfileModalOpen(true); return; }
    const existing = googleUser || getCachedGoogleUser();
    if (existing) { proceedWithUser(existing, mode); return; }
    setAuthMode(mode);
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from the council?`)) await removeMember(id);
  };

  const handleSuccess = (m: Member) => {
    setModalOpen(false);
    setCertificate(m);
    setLoggedInUser(m);
  };

  return (
    <>
      <LoadingScreen onReveal={onLoadDone} onDone={onIntroComplete} />
      <div className="scroll-progress"><div className="scroll-progress-fill" /></div>
      <Navbar onMenu={() => setMenuOpen(true)} count={count} />
      <ScrollProgressRail />
      <AudioToggle />
      <div className="grain-overlay" />
      <div className="vignette-overlay" />

      {menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}

      <button className={`user-login-btn ${loggedInUser ? 'logged-in' : ''}`} onClick={() => startAuth('login')}>
        {loggedInUser ? (
          <>
            {loggedInUser.avatar
              ? <img src={loggedInUser.avatar} className="user-avatar-small" alt="" />
              : <span className="user-avatar-small placeholder" aria-hidden="true">
                  {(loggedInUser.firstName || '?').charAt(0).toUpperCase()}
                </span>}
            {t('nav.editProfile')}
          </>
        ) : (
          <><GoogleIcon /> {t('nav.login')}</>
        )}
      </button>

      {!isAdmin ? (
        <button className="admin-key" onClick={() => startAuth('admin')} aria-label={t('admin.signIn')}>
          <span aria-hidden="true">⚙</span>
        </button>
      ) : (
        <div className="admin-flag">
          <span aria-hidden="true">◆</span> {t('admin.flag')}
          <button onClick={() => setAdminEmail(null)} aria-label={t('admin.signOut')}>✕</button>
        </div>
      )}

      {/* ① The chamber */}
      <section className="hero" id="hero">
        <div className="hero-lens" aria-hidden="true">
          <div className="hero-plate"><div className="hero-bg" /></div>
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-haze" />
        </div>

        <div className="hero-spacer" />

        <div className="hero-content">
          <div className="hero-copy">
            <div className="hero-eyebrow" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.12s' }}>
              {t('hero.eyebrow')}
            </div>
            <div className="gold-rule" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease 0.20s' }} />
            <WordRevealTitle text={t('hero.title')} loaded={loaded} />
            <p className="hero-sub" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.65s' }}>
              {t('hero.sub')}
            </p>

            <div style={{
              opacity: loaded ? 1 : 0,
              transform: loaded ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.8s ease 0.85s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.85s',
            }}>
              {loggedInUser ? (
                <>
                  <MagneticCta onClick={() => scrollToId('council')}>{t('hero.ctaSeated')}</MagneticCta>
                  <p className="cta-sub">
                    {t('hero.welcome', { name: loggedInUser.firstName, n: loggedInUser.memberNumber })}
                  </p>
                </>
              ) : (
                <>
                  <MagneticCta onClick={() => startAuth('claim')}>{t('hero.cta')}</MagneticCta>
                  <p className="cta-sub">{t('hero.ctaSub')}</p>
                </>
              )}
            </div>
          </div>

          <div className="hero-medallion">
            <div className="hero-emblem">
              <div className="emblem-dolly">
                <span className="emblem-halo" />
                <img src="/un-emblem.svg" alt="" className={`emblem-img ${loaded ? 'alive' : ''}`} />
                <span className="intro-scan" />
                <CouncilCollar />
              </div>
            </div>
            <div className="hero-tally" style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.75s' }}>
              <p className="tally-line">
                <span className="tally-num">{count}</span>
                <span className="tally-unit">{count === 1 ? t('hero.tallyOne') : t('hero.tally')}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="hero-spacer" style={{ minHeight: '1.5rem' }} />

        <div className="scroll-indicator" aria-hidden="true">
          <span className="scroll-indicator-text">{t('nav.scroll')}</span>
          <span className="scroll-indicator-line" />
        </div>
      </section>

      {/* ② What MUN and the UN are */}
      <MunSection />

      {/* ③ The council */}
      <CouncilSection
        members={enrichedMembers}
        onSeatClick={(m) => setSelectedMember(m)}
        isAdmin={isAdmin}
        onAssignOffice={(m) => setOfficeFor(m)}
      />

      {/* ④ The secretariat */}
      <SecretariatSection members={enrichedMembers} onSelect={(m) => setSelectedMember(m)} />

      {/* ⑤ Footer */}
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-left">
            <div className="footer-name">{t('foot.name')}</div>
            <div className="footer-est">{t('foot.est')}</div>
            <div className="footer-tagline">{t('foot.tagline')}</div>
          </div>
          <div className="footer-right">
            <div className="footer-contact-label">{t('foot.contact')}</div>
            <a href="https://www.instagram.com/lucasruslim/" target="_blank" rel="noopener noreferrer" className="footer-contact-link">@lucasruslim</a>
            <div className="footer-meta">Instagram</div>
          </div>
        </div>
        <div className="footer-bottom">
          {t('foot.rights')}
          <br />
          <span style={{ opacity: 0.75 }}>
            {t('foot.credit')}{' '}
            <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 2.0</a>.
          </span>
        </div>
      </footer>

      <Ticker members={members} />

      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onUser={(u) => proceedWithUser(u, authMode)} />}
      {modalOpen && <RegistrationModal onClose={() => setModalOpen(false)} onSuccess={handleSuccess} preAuth={googleUser} />}
      {profileModalOpen && loggedInUser && <ProfileEditorModal member={loggedInUser} onClose={() => setProfileModalOpen(false)} onUpdate={refresh} />}
      {adminEditMember && <ProfileEditorModal member={adminEditMember} onClose={() => setAdminEditMember(null)} onUpdate={refresh} />}

      {selectedMember && (
        <FounderDetailModal
          member={selectedMember}
          displayTitle={selectedMember.displayTitle}
          onClose={() => setSelectedMember(null)}
          isAdmin={isAdmin}
          onAdminEdit={(m) => { setSelectedMember(null); setAdminEditMember(m); }}
          onToggleMain={async (id, isMain) => { await toggleMainFounder(id, isMain); setSelectedMember(null); }}
          onDelete={async (id, name) => { await handleDeleteMember(id, name); setSelectedMember(null); }}
        />
      )}

      {officeFor && (
        <OfficePicker
          member={officeFor}
          onClose={() => setOfficeFor(null)}
          onSave={async (roles) => { await setMemberRoles(officeFor.id, roles); setOfficeFor(null); }}
        />
      )}

      {certificate && <Certificate member={certificate} onClose={() => setCertificate(null)} />}
    </>
  );
}

/* ─── Assign offices (admin) ─── */
function OfficePicker({ member, onClose, onSave }: {
  member: EnrichedMember;
  onClose: () => void;
  onSave: (roles: string[]) => void;
}) {
  const t = useT();
  const [picked, setPicked] = useState<string[]>(rolesOf(member));
  const toggle = (id: string) =>
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t('nav.close')}>×</button>
        <h2 className="modal-title">{member.fullName}</h2>
        <p className="modal-subtitle">{t('council.hintOffice')}</p>
        <div className="office-picker">
          {ROLES.map(r => (
            <button key={r.id}
              className={`office-chip ${picked.includes(r.id) ? 'on' : ''}`}
              style={{ ['--office' as any]: r.hue }}
              onClick={() => toggle(r.id)}>
              <span aria-hidden="true">{r.glyph}</span>
              {t(`role.${r.id}.en` as any)}
            </button>
          ))}
        </div>
        <button className="submit-btn" onClick={() => onSave(picked)}>{t('profile.save')}</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <Site />
    </LangProvider>
  );
}
