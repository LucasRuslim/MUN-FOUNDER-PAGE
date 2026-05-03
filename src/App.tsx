import { useState, useEffect, useCallback, useRef } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';
import { getMembers, subscribeToMembers, addMember, isMemberByEmail, removeMember, updateMember, type Member } from './storage';
import { useInView } from './useInView';
import { signInWithGoogle } from './googleAuth';

const MAX = 15;
const SCHOOL = 'Youhua';
const ADMIN_EMAIL = 'lucas1121.lin@gmail.com';

/* ─── Typing animation hook ─── */
function useTyping(text: string, speed = 70) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return { displayed, done };
}

/* ─── Counter animation hook ─── */
function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0);
  const triggered = useRef(false);

  const start = useCallback(() => {
    if (triggered.current) return;
    triggered.current = true;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return { value, start };
}

/* ─── Progress Ring ─── */
function ProgressRing({ count }: { count: number }) {
  const r = 85;
  const circ = 2 * Math.PI * r;
  const offset = circ - (count / MAX) * circ;
  const urgent = count >= 13 && count < MAX;
  const full = count >= MAX;

  return (
    <div className="ring-container">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} className="ring-bg" />
        <circle
          cx="100" cy="100" r={r}
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
function RegistrationModal({ onClose, onSuccess, count }: {
  onClose: () => void;
  onSuccess: (m: Member) => void;
  count: number;
}) {
  const [step, setStep] = useState<'auth' | 'form' | 'welcome'>('auth');
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [existingMember, setExistingMember] = useState<Member | null>(null);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      setAuthUser({ name: user.name, email: user.email });
      setFullName(user.name);

      const existing = isMemberByEmail(user.email);
      if (existing) {
        setExistingMember(existing);
        setStep('welcome');
      } else {
        setStep('form');
      }
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
              {loading ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </>
              )}
            </button>
            <div id="google-signin-fallback" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }} />
            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>{error}</p>}
          </>
        )}

        {step === 'welcome' && existingMember && (
          <div className="welcome-back">
            <div className="modal-title">Welcome back, {existingMember.firstName}.</div>
            <p className="modal-subtitle">Your seat is secured. You are Founding Member #{existingMember.memberNumber}.</p>
            <div className="wb-badge">🏅 Founding Member</div>
          </div>
        )}

        {step === 'form' && (
          <>
            <div className="modal-title">Claim Your Founding Seat</div>
            <p className="modal-subtitle">Seat #{count + 1} of {MAX} — Once engraved, your name stands permanently.</p>

            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>

            <div className="form-group">
              <label className="form-label">Grade</label>
              <select className="form-select" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">Select grade</option>
                {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
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
function ProfileEditorModal({ member, onClose, onUpdate }: { member: Member; onClose: () => void; onUpdate: () => void }) {
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
    if (!fullName || !grade || !classGroup) {
      alert('Name, grade, and class are required.');
      return;
    }
    setSaving(true);
    await updateMember(member.email, {
      fullName,
      grade,
      classGroup,
      bio,
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
        <p className="modal-subtitle">Founding Member #{member.memberNumber}</p>

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
                  {['9th', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
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
              <label className="form-label">Anime Avatar Selection</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  className="form-input" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && searchAnime()}
                  placeholder="Search characters (e.g. Levi, Makima)..." 
                />
                <button 
                  className="submit-btn" 
                  style={{ width: 'auto', marginTop: 0, padding: '0 16px' }}
                  onClick={searchAnime}
                  disabled={searching}
                >
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
            </div>
          </div>

          <div style={{ width: '120px', textAlign: 'center' }}>
            <label className="form-label">Preview</label>
            {selectedAvatar ? (
              <img src={selectedAvatar.url} className="profile-avatar-preview" alt="Avatar" />
            ) : (
              <div className="profile-avatar-placeholder">?</div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>
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
function FounderDetailModal({ member, onClose }: { member: Member; onClose: () => void }) {
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        {member.avatar ? (
          <img src={member.avatar} className="detail-avatar" alt={member.firstName} />
        ) : (
          <div className="detail-avatar-placeholder">🏛</div>
        )}
        
        <div className="detail-name">{member.fullName}</div>
        <div className="detail-meta">Grade {member.grade} • Class {member.classGroup}</div>
        
        <div className="detail-badge">Founding Member #{member.memberNumber}</div>
        
        {member.avatarName && (
          <div className="detail-anime-label">Represented by {member.avatarName}</div>
        )}
        
        {member.bio && (
          <div className="detail-bio">"{member.bio}"</div>
        )}
      </div>
    </div>
  );
}


/* ─── Certificate ─── */
function Certificate({ member, onClose }: { member: Member; onClose: () => void }) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 }, colors: ['#d4a853', '#f0c75e', '#8b7335', '#f5f0e8'] });
    const t = setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { y: 0.4 }, colors: ['#d4a853', '#f0c75e'] }), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="certificate-overlay" onClick={onClose}>
      <div className="certificate" onClick={e => e.stopPropagation()}>
        <div className="cert-ornament">✦ &nbsp; Founding Charter &nbsp; ✦</div>
        <div className="cert-title">This certifies that</div>
        <div className="cert-name">{member.fullName}</div>
        <div className="cert-number">
          is <strong>Founding Member #{member.memberNumber}</strong> of the<br />
          {SCHOOL} Model United Nations Club
        </div>
        <div className="cert-seal">🏛</div>
        <div className="cert-footer">Established 2026 — The Charter Remembers</div>
        <button className="cert-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ─── Value Proposition Section ─── */
function ValueSection() {
  const cards = [
    { icon: '🏛', title: 'Your Name, On This Wall', text: 'Permanently listed in the Hall of Founders on this website. Not a temporary badge — a lasting record of your leadership.' },
    { icon: '📋', title: 'College Application Ready', text: 'Founding Member status is verifiable and can be listed on Common App, UCAS, or any university portfolio as a leadership credential.' },
    { icon: '🌐', title: 'You Helped Build This', text: 'First-generation members define the club\'s culture, traditions, and direction. Your voice shapes what this becomes.' },
  ];

  return (
    <section className="section" id="value">
      <h2 className="section-title">What Does <span className="gold-accent">Founding Member</span> Mean?</h2>
      <div className="cards-grid">
        {cards.map((c, i) => (
          <ValueCard key={i} {...c} delay={i * 150} />
        ))}
      </div>
    </section>
  );
}

function ValueCard({ icon, title, text, delay }: { icon: string; title: string; text: string; delay: number }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={`value-card ${visible ? 'visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="card-icon">{icon}</div>
      <div className="card-title">{title}</div>
      <div className="card-text">{text}</div>
    </div>
  );
}

/* ─── Hall of Founders ─── */
function HallOfFounders({ members, isAdmin, onDelete, onMemberClick }: { members: Member[]; isAdmin: boolean; onDelete: (id: string, name: string) => void; onMemberClick: (m: Member) => void }) {
  const { ref, visible } = useInView(0.1);
  const complete = members.length >= MAX;

  return (
    <section className="hall" id="hall" ref={ref}>
      <div className="hall-inner">
        <h2 className="section-title">Hall of <span className="gold-accent">Founders</span></h2>
        <p className="hall-subtitle">"These students chose to lead before the room was full."</p>
        {isAdmin && <p style={{ fontSize: '0.75rem', color: 'var(--amber)', textAlign: 'center', marginBottom: '1rem' }}>🔑 Admin mode — click ✕ to remove a member</p>}
        <div className={`founders-wall ${complete ? 'complete' : ''}`}>
          {members.length === 0 ? (
            <div className="wall-empty">The wall awaits its first name.</div>
          ) : (
            members.map((m, i) => (
              <div 
                key={m.id} 
                className="founder-name" 
                style={{ animationDelay: `${i * 0.1}s`, position: 'relative' }}
                onClick={() => onMemberClick(m)}
              >
                {m.avatar ? (
                  <img src={m.avatar} className="founder-avatar" alt={m.firstName} />
                ) : (
                  <div className="founder-avatar-placeholder">🏛</div>
                )}
                <span>{m.firstName}, {m.grade}</span>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(m.id, m.fullName); }}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#ef4444', border: 'none', color: '#fff',
                      fontSize: '0.65rem', cursor: 'pointer', lineHeight: '20px',
                      padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                    title={`Remove ${m.fullName}`}
                  >✕</button>
                )}
              </div>
            ))
          )}
        </div>
        {complete && <div className="complete-banner">✦ The Charter is Complete ✦</div>}
      </div>
    </section>
  );
}

/* ─── About MUN Section ─── */
function AboutSection() {
  const p1 = useInView();
  const p2 = useInView();
  const p3 = useInView();

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
  const refs = [p1, p2, p3];

  return (
    <section className="section about-section" id="about">
      <h2 className="section-title">What Is <span className="gold-accent">Model United Nations</span>?</h2>
      <p className="about-intro">
        Model United Nations is where students stop being students and start being statesmen.
      </p>

      <div className="pillars">
        {pillars.map((p, i) => (
          <div
            key={i}
            ref={refs[i].ref}
            className={`pillar ${refs[i].visible ? 'visible' : ''}`}
            style={{ transitionDelay: `${i * 200}ms` }}
          >
            <div className="pillar-word">{p.word}</div>
            <div className="pillar-desc">{p.desc}</div>
          </div>
        ))}
      </div>

      <div className="stats-row" ref={statsRef.ref}>
        <div className="stat-item">
          <div className="stat-number">{stat1.value}</div>
          <div className="stat-label">UN Member Nations</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{stat2.value}K+</div>
          <div className="stat-label">Youth Delegates Globally</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{stat3.value}M+</div>
          <div className="stat-label">Resolutions Debated</div>
        </div>
      </div>

      <div className="pull-quote">
        Education is the most powerful weapon which you can use to change the world.
      </div>
      <div className="quote-attr">— Nelson Mandela</div>
    </section>
  );
}

/* ─── Ticker ─── */
function Ticker({ members }: { members: Member[] }) {
  if (members.length === 0) return null;
  const items = [...members, ...members]; // double for seamless loop

  return (
    <div className="ticker-bar">
      <div className="ticker-track">
        {items.map((m, i) => (
          <span key={i} className="ticker-item">
            ✦ {m.firstName}, {m.grade} just joined
          </span>
        ))}
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
  
  // User auth state
  const [loggedInUser, setLoggedInUser] = useState<Member | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<Member | null>(null);

  const isAdmin = adminEmail === ADMIN_EMAIL;
  const count = members.length;
  const urgent = count >= 13 && count < MAX;
  const full = count >= MAX;

  const headline = "The Founding Seats Are Filling.";
  const { displayed, done } = useTyping(headline, 65);

  useEffect(() => {
    const unsubscribe = subscribeToMembers((newMembers) => {
      setMembers([...newMembers]);
      setLoggedInUser(prev => prev ? newMembers.find(m => m.email === prev.email) || null : null);
    });
    return () => unsubscribe();
  }, []);

  const refresh = useCallback(() => {
    // Left for backwards compatibility, but Firebase real-time handles updates now!
  }, []);

  const handleAdminLogin = async () => {
    try {
      const user = await signInWithGoogle();
      if (user.email === ADMIN_EMAIL) {
        setAdminEmail(user.email);
      } else {
        alert('Access denied. You are not the administrator.');
      }
    } catch (err) {
      console.error('Admin login failed:', err);
    }
  };

  const handleUserLogin = async () => {
    if (loggedInUser) {
      setProfileModalOpen(true);
      return;
    }
    try {
      const user = await signInWithGoogle();
      const member = isMemberByEmail(user.email);
      if (member) {
        setLoggedInUser(member);
        setProfileModalOpen(true);
      } else {
        alert("You haven't claimed a Founding Seat yet. Please register first.");
      }
    } catch (err) {
      console.error('User login failed:', err);
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from the Founding Members? This cannot be undone.`)) {
      await removeMember(id);
    }
  };

  const handleSuccess = (m: Member) => {
    setModalOpen(false);
    setCertificate(m);
    setLoggedInUser(m);

    if (members.length + 1 >= MAX && !sealedShown) {
      setTimeout(() => { setSealedShown(true); }, 3500);
    }
  };

  return (
    <>
      <div className="grain-overlay" />

      {/* User Profile / Login Button */}
      <button className={`user-login-btn ${loggedInUser ? 'logged-in' : ''}`} onClick={handleUserLogin}>
        {loggedInUser ? (
          <>
            {loggedInUser.avatar ? (
              <img src={loggedInUser.avatar} className="user-avatar-small" alt={loggedInUser.firstName} />
            ) : (
              <div className="user-avatar-small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>🏛</div>
            )}
            Edit Profile
          </>
        ) : (
          <>
            <GoogleIcon /> Member Login
          </>
        )}
      </button>

      {/* Sticky Live Badge */}
      <div className="live-badge">
        <span className="live-dot" />
        <span>LIVE — {MAX - count} Founding Seat{MAX - count !== 1 ? 's' : ''} Remain{MAX - count === 1 ? 's' : ''}</span>
      </div>

      {/* Admin login — subtle button top-left */}
      {!isAdmin ? (
        <button
          onClick={handleAdminLogin}
          style={{
            position: 'fixed', top: 16, left: 16, zIndex: 1000,
            background: 'transparent', border: 'none', color: 'rgba(245,240,232,0.15)',
            fontSize: '0.7rem', cursor: 'pointer', padding: '4px 8px',
            transition: 'color 0.3s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ivory-dim)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(245,240,232,0.15)')}
          title="Admin Login"
        >⚙</button>
      ) : (
        <div style={{
          position: 'fixed', top: 16, left: 16, zIndex: 1000,
          background: 'rgba(10,14,26,0.9)', border: '1px solid var(--amber)',
          borderRadius: 999, padding: '6px 14px', fontSize: '0.7rem',
          color: 'var(--amber)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          🔑 Admin
          <button
            onClick={() => setAdminEmail(null)}
            style={{ background: 'none', border: 'none', color: 'var(--ivory-dim)', cursor: 'pointer', fontSize: '0.8rem' }}
          >✕</button>
        </div>
      )}

      {/* ① Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <h1 className="typing-text">
            {displayed}
            {!done && <span className="typing-cursor" />}
          </h1>
          <p className="hero-sub">
            {urgent
              ? '⚡ Almost gone. Only ' + (MAX - count) + ' seat' + (MAX - count !== 1 ? 's' : '') + ' left.'
              : '15 spots. No extensions. No second chances at this title.'}
          </p>

          <ProgressRing count={count} />

          {!full ? (
            <>
              <button className="cta-btn" onClick={() => setModalOpen(true)}>
                Claim My Founding Seat →
              </button>
              <p className="cta-sub">Takes 60 seconds. Lasts on your college application forever.</p>
            </>
          ) : (
            <p style={{ color: 'var(--gold)', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.3rem', marginTop: '1rem' }}>
              ✦ The Chamber Is Sealed ✦
            </p>
          )}
        </div>
      </section>

      {/* ② Value Proposition */}
      <ValueSection />

      {/* ④ Hall of Founders */}
      <HallOfFounders 
        members={members} 
        isAdmin={isAdmin} 
        onDelete={handleDeleteMember}
        onMemberClick={(m) => setSelectedFounder(m)} 
      />

      {/* ⑤ About MUN */}
      <AboutSection />

      {/* ⑥ Footer */}
      <footer className="site-footer">
        <div className="footer-name">{SCHOOL} Model United Nations</div>
        <div className="footer-meta">Est. 2026</div>
        <div className="footer-meta">
          Contact: <a href="https://www.instagram.com/lucasruslim/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>@lucasruslim on Instagram</a>
        </div>
        <div className="footer-tagline">"Shaped by 15. Built for the world."</div>
      </footer>

      {/* Ticker */}
      <Ticker members={members} />

      {/* ③ Registration Modal */}
      {modalOpen && (
        <RegistrationModal
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccess}
          count={count}
        />
      )}

      {/* Profile Editor Modal */}
      {profileModalOpen && loggedInUser && (
        <ProfileEditorModal 
          member={loggedInUser} 
          onClose={() => setProfileModalOpen(false)} 
          onUpdate={refresh} 
        />
      )}

      {/* Founder Detail Modal */}
      {selectedFounder && (
        <FounderDetailModal 
          member={selectedFounder} 
          onClose={() => setSelectedFounder(null)} 
        />
      )}

      {/* Certificate */}
      {certificate && (
        <Certificate member={certificate} onClose={() => setCertificate(null)} />
      )}

      {/* Sealed Overlay */}
      {sealedShown && full && (
        <div className="sealed-overlay" onClick={() => setSealedShown(false)}>
          <div className="sealed-stamp">🏛</div>
          <h2 className="sealed-title">The Chamber Is Sealed.</h2>
          <p className="sealed-sub">Founding Members have been chosen. The charter is complete.</p>
        </div>
      )}
    </>
  );
}
