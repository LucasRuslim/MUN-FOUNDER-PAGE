import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { addMember, isMemberByEmail, updateMember, addDelegate, isDelegateByEmail, type Member, type Delegate } from '../storage';
import { signInWithGoogle, renderGoogleButton, type GoogleUser } from '../googleAuth';
import { useScrollLock } from '../motion';

export const MAX = 15;
export const SCHOOL = 'Youhua';
const GRADES = ['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

/* ─── Dialog shell: one document-like sheet, Escape to close, focus kept inside ─── */
export function Dialog({ onClose, children, label, wide, tone = 'paper' }: {
  onClose: () => void;
  children: ReactNode;
  label: string;
  wide?: boolean;
  tone?: 'paper' | 'ink';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useScrollLock(true);
  // Mount-only: parents re-render on live data, which must not steal focus.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.dialog-close)');
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className={`dialog ${wide ? 'is-wide' : ''} tone-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <button className="dialog-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

function DialogHead({ symbol, title, sub }: { symbol?: string; title: string; sub?: string }) {
  return (
    <header className="dialog-head">
      {symbol && <div className="doc-symbol">{symbol}</div>}
      <h2 className="dialog-title">{title}</h2>
      {sub && <p className="dialog-sub">{sub}</p>}
    </header>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="g-icon">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/* Shared name / grade / class block */
function IdentityFields({ fullName, setFullName, grade, setGrade, classGroup, setClassGroup, withBlank }: {
  fullName: string; setFullName: (v: string) => void;
  grade: string; setGrade: (v: string) => void;
  classGroup: string; setClassGroup: (v: string) => void;
  withBlank?: boolean;
}) {
  return (
    <>
      <label className="field">
        <span className="field-label">Full name</span>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="As it should be engraved" autoComplete="name" />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Grade</span>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {withBlank && <option value="">Select</option>}
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Class</span>
          <input className="input" value={classGroup} onChange={(e) => setClassGroup(e.target.value)} placeholder="e.g. S1-1, 904" />
        </label>
      </div>
    </>
  );
}

/* ─── Sign-in (rendered Google button) ─── */
export function AuthModal({ mode, onUser, onClose }: { mode: 'login' | 'claim' | 'admin'; onUser: (u: GoogleUser) => void; onClose: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const copy = {
    login: { title: 'Sign in', sub: 'Use your Google account to open your founding profile.' },
    claim: { title: 'Verify your identity', sub: 'One Google account holds one seat. This keeps the register honest.' },
    admin: { title: 'Administrator access', sub: 'Sign in with the administrator Google account.' },
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
    <Dialog onClose={onClose} label={copy.title}>
      <DialogHead symbol="YH/MUN/ID" title={copy.title} sub={copy.sub} />
      <div ref={btnRef} className="gsi-slot" />
      {err && <p className="form-error" role="alert">{err}</p>}
    </Dialog>
  );
}

/* ─── Claim a founding seat ─── */
export function RegistrationModal({ onClose, onSuccess, count, preAuth }: {
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
  useEffect(() => { if (preAuth) applyUser(preAuth); }, [preAuth, applyUser]);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      applyUser(await signInWithGoogle());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName || !grade || !classGroup || !authUser) return;
    setLoading(true);
    const member = await addMember({ fullName, firstName: fullName.split(' ')[0], grade, classGroup, email: authUser.email });
    setLoading(false);
    if (member) onSuccess(member);
  };

  if (count >= MAX) {
    return (
      <Dialog onClose={onClose} label="The charter is sealed">
        <DialogHead symbol="YH/MUN/2026/1" title="The charter is sealed" sub="All fifteen founding seats have been claimed." />
      </Dialog>
    );
  }

  return (
    <Dialog onClose={onClose} label="Claim a founding seat">
      {step === 'auth' && (
        <>
          <DialogHead symbol="YH/MUN/ID" title="Verify your identity" sub="One Google account holds one seat. This keeps the register honest." />
          <button className="btn btn-google" onClick={handleGoogleAuth} disabled={loading}>
            {loading ? 'Verifying…' : <><GoogleIcon /> Continue with Google</>}
          </button>
          <div id="google-signin-fallback" className="gsi-slot" />
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      )}

      {step === 'welcome' && existingMember && (
        <DialogHead symbol={`Seat ${existingMember.memberNumber} of ${MAX}`} title={`Welcome back, ${existingMember.firstName}.`} sub={`Your seat is secured. You are Founding Member ${existingMember.memberNumber}.`} />
      )}

      {step === 'blocked' && (
        <DialogHead symbol="Founding Delegate" title="You're already a Founding Delegate" sub="One account can be a Founder or a Delegate, not both." />
      )}

      {step === 'form' && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <DialogHead symbol={`Seat ${count + 1} of ${MAX}`} title="Claim your founding seat" sub="Once engraved, your name stays on the register permanently." />
          <IdentityFields {...{ fullName, setFullName, grade, setGrade, classGroup, setClassGroup }} withBlank />
          <button type="submit" className="btn btn-primary btn-block" disabled={!fullName || !grade || !classGroup || loading}>
            {loading ? 'Engraving…' : 'Engrave my name'}
          </button>
        </form>
      )}
    </Dialog>
  );
}

/* ─── Profile editor (founders and delegates) ─── */
type ProfileUpdates = Partial<Pick<Member, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>;

export function ProfileEditorModal({ member, onClose, onUpdate, numberLabel, saveFn }: {
  member: Member;
  onClose: () => void;
  onUpdate: () => void;
  numberLabel?: string;
  saveFn?: (email: string, updates: ProfileUpdates) => Promise<any>;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const [grade, setGrade] = useState(member.grade);
  const [classGroup, setClassGroup] = useState(member.classGroup);
  const [bio, setBio] = useState(member.bio || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [animeResults, setAnimeResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<{ url: string; name: string } | null>(
    member.avatar ? { url: member.avatar, name: member.avatarName || 'Anime Character' } : null,
  );
  const [avatarSource, setAvatarSource] = useState<'upload' | 'mal'>('upload');
  const [saving, setSaving] = useState(false);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState({ W: 1, H: 1 });
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = (file: File) => {
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

  const startDrag = (x: number, y: number) => { setIsDragging(true); dragStart.current = { x, y }; offsetStart.current = offset; };
  const moveDrag = (x: number, y: number) => {
    if (!isDragging) return;
    setOffset({ x: offsetStart.current.x + x - dragStart.current.x, y: offsetStart.current.y + y - dragStart.current.y });
  };
  const endDrag = () => setIsDragging(false);

  // Crop box is 200px; the displayed image covers it on its short side.
  const BOX = 200;
  const dispW = imageDims.W > imageDims.H ? BOX * (imageDims.W / imageDims.H) : BOX;
  const dispH = imageDims.H >= imageDims.W ? BOX * (imageDims.H / imageDims.W) : BOX;

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
        ctx.fillStyle = '#10131c';
        ctx.fillRect(0, 0, 256, 256);
        const s = 256 / BOX;
        const w = dispW * zoom * s, h = dispH * zoom * s;
        const x = (BOX / 2 + offset.x - (dispW * zoom) / 2) * s;
        const y = (BOX / 2 + offset.y - (dispH * zoom) / 2) * s;
        ctx.drawImage(img, x, y, w, h);
        setSelectedAvatar({ url: canvas.toDataURL('image/jpeg', 0.85), name: uploadedFileName || 'Custom Upload' });
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
    <Dialog onClose={onClose} label="Your profile" wide>
      <DialogHead symbol={numberLabel ?? `Founding Member ${member.memberNumber}`} title="Your profile" />

      <div className="profile-layout">
        <div className="profile-fields">
          <IdentityFields {...{ fullName, setFullName, grade, setGrade, classGroup, setClassGroup }} />

          <label className="field">
            <span className="field-label">Statement <span className="field-hint">{bio.length}/150</span></span>
            <textarea className="input textarea" value={bio} onChange={(e) => setBio(e.target.value)}
              placeholder="A line for the record. A quote, a conviction, your vision for the club." maxLength={150} />
          </label>

          <fieldset className="field">
            <legend className="field-label">Portrait</legend>
            <div className="segmented" role="tablist">
              <button type="button" role="tab" aria-selected={avatarSource === 'upload'} className={avatarSource === 'upload' ? 'is-on' : ''} onClick={() => setAvatarSource('upload')}>Upload a photo</button>
              <button type="button" role="tab" aria-selected={avatarSource === 'mal'} className={avatarSource === 'mal' ? 'is-on' : ''} onClick={() => setAvatarSource('mal')}>Search MyAnimeList</button>
            </div>

            {avatarSource === 'upload' ? (
              rawImageSrc ? (
                <div className="cropper">
                  <p className="field-hint">Drag to position, slide to zoom</p>
                  <div
                    className="crop-box"
                    onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
                    onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
                    onMouseUp={endDrag}
                    onMouseLeave={endDrag}
                    onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchEnd={endDrag}
                  >
                    <img
                      src={rawImageSrc}
                      alt="Your photo, being positioned"
                      style={{
                        left: (BOX - dispW) / 2, top: (BOX - dispH) / 2, width: dispW, height: dispH,
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                      }}
                    />
                    <span className="crop-ring" />
                  </div>
                  <input className="range" type="range" min="1" max="3" step="0.05" value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))} aria-label="Zoom" />
                  <div className="btn-pair">
                    <button type="button" className="btn btn-primary" onClick={handleSaveCrop}>Apply crop</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setRawImageSrc(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`dropzone ${dropHover ? 'is-hover' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDropHover(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDropHover(false); }}
                  onDrop={(e) => { e.preventDefault(); setDropHover(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
                  <span className="dropzone-title">Choose a photo or drop it here</span>
                  <span className="field-hint">JPG, PNG or GIF. Resized automatically.</span>
                </button>
              )
            ) : (
              <>
                <div className="search-row">
                  <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchAnime(); } }}
                    placeholder="Search characters, e.g. Levi, Makima" />
                  <button type="button" className="btn btn-primary" onClick={searchAnime} disabled={searching}>{searching ? '…' : 'Search'}</button>
                </div>
                {animeResults.length > 0 && (
                  <div className="anime-grid">
                    {animeResults.map((char) => (
                      <button type="button" key={char.mal_id}
                        className={`anime-card ${selectedAvatar?.url === char.images.jpg.image_url ? 'is-on' : ''}`}
                        onClick={() => setSelectedAvatar({ url: char.images.jpg.image_url, name: char.name })}>
                        <img src={char.images.jpg.image_url} alt={char.name} />
                        <span>{char.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searching && animeResults.length === 0 && <p className="field-hint" aria-live="polite">Searching…</p>}
              </>
            )}
          </fieldset>
        </div>

        <aside className="profile-preview">
          <span className="field-label">Preview</span>
          {selectedAvatar ? <img src={selectedAvatar.url} className="avatar avatar-lg" alt="Your portrait" /> : <Monogram name={fullName} size="lg" />}
          <span className="field-hint">{selectedAvatar?.name || 'No portrait yet'}</span>
        </aside>
      </div>

      <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    </Dialog>
  );
}

export function Monogram({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${size} monogram`} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

/* ─── Founder dossier ─── */
export function FounderDetailModal({ member, displayTitle, onClose, isAdmin, onAdminEdit, onToggleMain, onDelete }: {
  member: Member;
  displayTitle: string;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (m: Member) => void;
  onToggleMain: (id: string, isMain: boolean) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <Dialog onClose={onClose} label={`${member.fullName}, dossier`}>
      <div className="dossier">
        {member.avatar ? <img src={member.avatar} className="avatar avatar-xl" alt={`Portrait of ${member.firstName}`} /> : <Monogram name={member.fullName} size="lg" />}
        <div className="doc-symbol">{member.isMainFounder ? 'Head of Council' : displayTitle}</div>
        <h2 className="dialog-title">{member.fullName}</h2>
        <p className="dossier-meta">Grade {member.grade} · Class {member.classGroup}</p>
        {member.isMainFounder && <p className="notice">A founding meeting will be scheduled soon. Stay close to the register.</p>}
        {member.bio && <blockquote className="dossier-quote">{member.bio}</blockquote>}
        {member.avatarName && <p className="field-hint">Portrait: {member.avatarName}</p>}
      </div>
      {isAdmin && (
        <div className="admin-panel">
          <div className="field-label">Administrator</div>
          <button className="btn btn-ghost btn-block" onClick={() => onAdminEdit(member)}>Edit photo and statement</button>
          <button className="btn btn-ghost btn-block" onClick={() => onToggleMain(member.id, !member.isMainFounder)}>
            {member.isMainFounder ? 'Unset Head of Council' : 'Set as Head of Council'}
          </button>
          <button className="btn btn-danger btn-block" onClick={() => onDelete(member.id, member.fullName)}>Remove member</button>
        </div>
      )}
    </Dialog>
  );
}

/* ─── Credential: issued when a seat is claimed. Styled on a passport data page. ─── */
const mrzClean = (s: string) =>
  s.normalize('NFD').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().replace(/\s+/g, '<');
const mrzPad = (s: string, len: number) => (s + '<'.repeat(len)).slice(0, len);

export function Credential({ member, onClose }: { member: Member; onClose: () => void }) {
  const parts = member.fullName.trim().split(/\s+/);
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const seat = String(member.memberNumber).padStart(2, '0');
  const issued = new Date(member.joinedAt || Date.now());
  const date = issued.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const line1 = mrzPad(`P<YHMUN${mrzClean(surname)}<<${mrzClean(given)}`, 44);
  const line2 = mrzPad(`FM${seat}<${mrzClean(member.grade)}<${mrzClean(member.classGroup)}<<2026`, 44);

  return (
    <Dialog onClose={onClose} label="Your founding credential" tone="ink" wide>
      <div className="credential">
        <div className="credential-top">
          <span>{SCHOOL} Model United Nations</span>
          <span>Founding Credential</span>
        </div>
        <div className="credential-body">
          {member.avatar ? <img src={member.avatar} className="credential-photo" alt={`Portrait of ${member.firstName}`} /> : <Monogram name={member.fullName} size="lg" />}
          <dl className="credential-fields">
            <div><dt>Surname</dt><dd>{surname}</dd></div>
            <div><dt>Given names</dt><dd>{given || '·'}</dd></div>
            <div><dt>Seat</dt><dd className="num">{seat} / {MAX}</dd></div>
            <div><dt>Grade · Class</dt><dd>{member.grade} · {member.classGroup}</dd></div>
            <div><dt>Date of issue</dt><dd className="num">{date}</dd></div>
          </dl>
          <div className="stamp" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <defs><path id="stamp-arc" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" /></defs>
              <circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="34" />
              <text fontSize="8.5"><textPath href="#stamp-arc">FOUNDING MEMBER · YOUHUA MUN · 2026 ·</textPath></text>
              <text x="60" y="68" textAnchor="middle" fontSize="26" className="stamp-num">{seat}</text>
            </svg>
          </div>
        </div>
        <div className="mrz" aria-label="Machine readable zone">
          <div>{line1}</div>
          <div>{line2}</div>
        </div>
      </div>
      <p className="dialog-sub">Your name is now on the register, seat {member.memberNumber} of {MAX}.</p>
      <button className="btn btn-primary btn-block" onClick={onClose}>Enter the chamber</button>
    </Dialog>
  );
}

/* ─── Join as a Founding Delegate ─── */
export function DelegateModal({ onClose, onSuccess, preAuth }: {
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
    setFullName((prev) => prev || user.name);
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
      .then((u) => { if (!cancelled) applyUser(u); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [step, applyUser]);

  const handleSubmit = async () => {
    if (!fullName || !grade || !classGroup || !authUser) return;
    setLoading(true);
    setError(null);
    try {
      const d = await addDelegate({ fullName, firstName: fullName.split(' ')[0], grade, classGroup, bio, email: authUser.email });
      if (d) { setCreated(d); setStep('welcome'); onSuccess(d); }
      else setError('Could not register. This account may already be a founder or delegate.');
    } catch {
      setError('Saving failed. The delegate list may not be enabled yet. Ask the admin to publish the Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onClose={onClose} label="Join the delegation">
      {step === 'auth' && (
        <>
          <DialogHead symbol="YH/MUN/ID" title="Join the delegation" sub="Sign in with Google to add your name to the Founding Delegates." />
          <div ref={btnRef} className="gsi-slot" />
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      )}

      {step === 'form' && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <DialogHead symbol="Founding Delegate" title="Answer the roll" sub="No seat limit. Your name joins the founding record permanently." />
          <IdentityFields {...{ fullName, setFullName, grade, setGrade, classGroup, setClassGroup }} withBlank />
          <label className="field">
            <span className="field-label">Statement <span className="field-hint">optional</span></span>
            <textarea className="input textarea" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line about why you're here." maxLength={150} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!fullName || !grade || !classGroup || loading}>
            {loading ? 'Adding…' : 'Add my name'}
          </button>
        </form>
      )}

      {step === 'welcome' && created && (
        <DialogHead symbol={`Founding Delegate ${created.delegateNumber}`} title={`Present, ${created.firstName}.`} sub="Your name now stands on the record." />
      )}

      {step === 'blocked' && (
        <DialogHead symbol="Founding Member" title="You already hold a founding seat" sub="One account can be a Founder or a Delegate, not both." />
      )}
    </Dialog>
  );
}

export function DelegateDetailModal({ delegate, onClose, isAdmin, onAdminEdit, onDelete }: {
  delegate: Delegate;
  onClose: () => void;
  isAdmin: boolean;
  onAdminEdit: (d: Delegate) => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <Dialog onClose={onClose} label={`${delegate.fullName}, delegate`}>
      <div className="dossier">
        {delegate.avatar ? <img src={delegate.avatar} className="avatar avatar-xl" alt={`Portrait of ${delegate.firstName}`} /> : <Monogram name={delegate.fullName} size="lg" />}
        <div className="doc-symbol">Founding Delegate {delegate.delegateNumber}</div>
        <h2 className="dialog-title">{delegate.fullName}</h2>
        <p className="dossier-meta">Grade {delegate.grade} · Class {delegate.classGroup}</p>
        {delegate.bio && <blockquote className="dossier-quote">{delegate.bio}</blockquote>}
      </div>
      {isAdmin && (
        <div className="admin-panel">
          <div className="field-label">Administrator</div>
          <button className="btn btn-ghost btn-block" onClick={() => onAdminEdit(delegate)}>Edit photo and statement</button>
          <button className="btn btn-danger btn-block" onClick={() => onDelete(delegate.id, delegate.fullName)}>Remove delegate</button>
        </div>
      )}
    </Dialog>
  );
}
