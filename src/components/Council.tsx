import { useEffect, useRef, useState } from 'react';
import { reorderMembers, setBesties, clearBesties, type Member } from '../storage';
import { useReveal } from '../motion';
import { MAX, Monogram } from './Modals';

export type EnrichedMember = Member & { displayTitle: string };

/* Distinct glow colours for bestie pairs (stored on the member record). */
const BESTIE_COLORS = ['#ff7eb6', '#a78bfa', '#5eead4', '#fcd34d', '#fca5a5', '#7dd3fc', '#86efac', '#f0abfc'];
function nextBestieColor(members: { bestieColor?: string }[]): string {
  const used = new Set(members.map((m) => m.bestieColor).filter(Boolean) as string[]);
  return BESTIE_COLORS.find((c) => !used.has(c)) || BESTIE_COLORS[Math.floor(Math.random() * BESTIE_COLORS.length)];
}

/* Seat coordinates (in %) evenly spaced along a rounded U / horseshoe (opens at top).
   Rounded corners spread the seats smoothly so they never bunch at the 90° turns. */
const U = { left: 18, right: 82, top: 22, bottom: 88, r: 12 };
function uSeatPositions(n: number) {
  const { left, right, top, bottom, r } = U;
  const arm = bottom - r - top;
  const corner = (Math.PI / 2) * r;
  const base = right - r - (left + r);
  const total = arm + corner + base + corner + arm;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = total * ((i + 0.5) / n);
    let x: number, y: number;
    if (d <= arm) { x = left; y = top + d; }
    else if (d <= arm + corner) {
      const ang = Math.PI - (d - arm) / r;
      x = left + r + r * Math.cos(ang); y = bottom - r + r * Math.sin(ang);
    } else if (d <= arm + corner + base) { x = left + r + (d - arm - corner); y = bottom; }
    else if (d <= arm + corner + base + corner) {
      const ang = Math.PI / 2 - (d - arm - corner - base) / r;
      x = right - r + r * Math.cos(ang); y = bottom - r + r * Math.sin(ang);
    } else { x = right; y = bottom - r - (d - arm - corner - base - corner); }
    pts.push({ x, y });
  }
  return pts;
}

/* The table, drawn just inside the seats. */
const inset = 9;
const T = { left: U.left + inset, right: U.right - inset, top: U.top - 4, bottom: U.bottom - inset, r: U.r - 4 };
const TABLE_PATH = `M${T.left} ${T.top} L${T.left} ${T.bottom - T.r} A${T.r} ${T.r} 0 0 0 ${T.left + T.r} ${T.bottom} L${T.right - T.r} ${T.bottom} A${T.r} ${T.r} 0 0 0 ${T.right} ${T.bottom - T.r} L${T.right} ${T.top}`;

function Seat({ member, isMain, onClick, selected, editing }: {
  member: EnrichedMember;
  isMain?: boolean;
  onClick: (m: EnrichedMember) => void;
  selected?: boolean;
  editing?: boolean;
}) {
  const bestie = member.bestieColor;
  return (
    <button
      className={`seat ${isMain ? 'is-main' : ''} ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''} ${bestie ? 'has-bestie' : ''}`}
      onClick={() => onClick(member)}
      aria-label={editing ? `Select ${member.fullName}` : `${member.fullName}, open dossier`}
      style={bestie ? ({ ['--bestie' as any]: bestie }) : undefined}
    >
      {member.avatar
        ? <img src={member.avatar} className="avatar avatar-md seat-avatar" alt="" />
        : <span className="seat-avatar"><Monogram name={member.fullName} /></span>}
      {bestie && <span className="bestie-badge">bestie</span>}
      <span className="seat-name">{member.firstName}</span>
      <span className="seat-grade">{isMain ? 'Head of Council' : member.grade}</span>
    </button>
  );
}

export function HallOfFounders({ members, onSeatClick, isAdmin }: {
  members: EnrichedMember[];
  onSeatClick: (m: EnrichedMember) => void;
  isAdmin: boolean;
}) {
  const chamberRef = useRef<HTMLDivElement>(null);
  useReveal(chamberRef);

  const complete = members.length >= MAX;
  const mains = members.filter((m) => m.isMainFounder);
  const others = members.filter((m) => !m.isMainFounder);
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
  // The horseshoe sizes itself to exactly however many people there are.
  const positions = uSeatPositions(orderedOthers.length);

  const handleSeatClick = (m: EnrichedMember) => {
    if (editMode === 'none' || !isAdmin) { onSeatClick(m); return; }
    setSelected((prev) => {
      if (prev.includes(m.id)) return prev.filter((x) => x !== m.id);
      const next = [...prev, m.id];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  // Arrange mode: as soon as two are selected, swap their seats (smooth glide).
  useEffect(() => {
    if (editMode !== 'arrange' || selected.length !== 2) return;
    const [aId, bId] = selected;
    const ai = orderedOthers.findIndex((m) => m.id === aId);
    const bi = orderedOthers.findIndex((m) => m.id === bId);
    if (ai >= 0 && bi >= 0) {
      const next = [...orderedOthers];
      [next[ai], next[bi]] = [next[bi], next[ai]];
      reorderMembers(next.map((m) => m.id));
    }
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, editMode]);

  const pairAreBesties = selected.length === 2 && members.find((m) => m.id === selected[0])?.bestieWith === selected[1];
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
  let order = 0;

  return (
    <section className="hall" id="hall" data-theme="ink">
      <div className="container">
        <header className="section-head">
          <h2 className="display-2 rise"><span className="line"><span className="line-inner">The Hall of</span></span> <span className="line"><span className="line-inner"><em>Founders</em></span></span></h2>
          <p className="lede">Fifteen seats around one table. Select a founder to open their dossier.</p>
        </header>

        {isAdmin && (
          <div className="council-admin" role="toolbar" aria-label="Council editor">
            <button className={`chip ${editMode === 'arrange' ? 'is-on' : ''}`} aria-pressed={editMode === 'arrange'}
              onClick={() => { setEditMode(editMode === 'arrange' ? 'none' : 'arrange'); setSelected([]); }}>Arrange seats</button>
            <button className={`chip ${editMode === 'bestie' ? 'is-on' : ''}`} aria-pressed={editMode === 'bestie'}
              onClick={() => { setEditMode(editMode === 'bestie' ? 'none' : 'bestie'); setSelected([]); }}>Besties</button>
            <span className="council-hint" aria-live="polite">
              {editMode === 'arrange' && 'Select two founders to swap their seats.'}
              {editMode === 'bestie' && (selected.length < 2 ? 'Select two founders to pair them.' : (
                pairAreBesties
                  ? <button className="chip is-danger" onClick={unpair}>Unpair</button>
                  : <button className="chip is-on" onClick={makeBesties}>Make besties</button>
              ))}
            </span>
          </div>
        )}

        <div ref={chamberRef} className={`hall-chamber ${complete ? 'is-complete' : ''} ${editing ? 'is-editing' : ''}`}>
          <svg className="chamber-table" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="table-path" d={TABLE_PATH} pathLength={1} />
          </svg>
          <div className="chamber-label" aria-hidden="true">
            <span className="doc-symbol">The Council</span>
            <span className="chamber-count num">{String(members.length).padStart(2, '0')}<span>/{MAX}</span></span>
          </div>

          {mains.map((m, i) => {
            const x = 50 + (i - (mains.length - 1) / 2) * headSpacing;
            return (
              <div className="seat-wrap is-main" key={m.id} style={{ left: `${x}%`, top: '7%', ['--i' as any]: order++ }}>
                <Seat member={m} isMain onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
              </div>
            );
          })}

          {orderedOthers.map((m, i) => {
            const p = positions[i];
            return (
              <div className="seat-wrap is-movable" key={m.id} style={{ left: `${p.x}%`, top: `${p.y}%`, ['--i' as any]: order++ }}>
                <Seat member={m} onClick={handleSeatClick} selected={selected.includes(m.id)} editing={editing} />
              </div>
            );
          })}

          {members.length === 0 && <p className="chamber-empty">The table is set. No one has taken a seat yet.</p>}
        </div>

        <p className="hall-foot" aria-live="polite">
          {complete
            ? 'The council is complete. The charter is sealed.'
            : `${remaining} seat${remaining !== 1 ? 's' : ''} still open at the table.`}
        </p>
      </div>
    </section>
  );
}
