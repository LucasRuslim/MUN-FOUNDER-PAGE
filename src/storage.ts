import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, getDocs, query, orderBy, deleteField } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export interface Member {
  id: string;
  fullName: string;
  firstName: string;
  grade: string;
  classGroup: string;
  email: string;
  memberNumber: number;
  joinedAt: string;
  avatar?: string;
  avatarName?: string;
  bio?: string;
  /* Chairs the council. Kept as isMainFounder so existing records still
     resolve; it means "head of council" now, not "founding member". */
  isMainFounder?: boolean;
  /* Offices this person holds, by role id. `role` is the older single-value
     field and is still read so nobody loses their office on migration. */
  roles?: string[];
  role?: string;
  /* Council editor (admin): explicit perimeter seat + bestie pairing */
  seat?: number;
  bestieWith?: string;
  bestieColor?: string;
}

const firebaseConfig = {
  apiKey: "AIzaSyB9SZ9dBjA16GvCNye_tGQ-SCtyQRTUQhA",
  authDomain: "mun-founder-page.firebaseapp.com",
  projectId: "mun-founder-page",
  storageBucket: "mun-founder-page.firebasestorage.app",
  messagingSenderId: "542302214003",
  appId: "1:542302214003:web:9fb9fb5c3166a79b7ed706"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Firebase Auth session — populated when the user signs in with Google so that
// Firestore security rules can verify them via request.auth.
export const auth = getAuth(app);

// Local cache for synchronous reads
let currentMembers: Member[] = [];

// Real-time listener
export function subscribeToMembers(callback: (members: Member[]) => void) {
  const q = query(collection(db, 'members'), orderBy('memberNumber', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map(doc => doc.data() as Member);
    currentMembers = members;
    callback(members);
  });
}

export function getMembers(): Member[] {
  return currentMembers;
}

/* The council is open: no cap, no sealing, no waiting list. The only thing
   that can refuse a seat is an email that already holds one. */
export async function addMember(data: Omit<Member, 'memberNumber' | 'joinedAt' | 'id'>): Promise<Member | null> {
  if (currentMembers.some(m => m.email === data.email)) return null;

  const newId = crypto.randomUUID();
  const member: Member = {
    ...data,
    id: newId,
    memberNumber: currentMembers.length + 1,
    joinedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'members', newId), member);
  return member;
}

export async function updateMember(email: string, updates: Partial<Pick<Member, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>) {
  const member = currentMembers.find(m => m.email === email);
  if (!member) return null;

  const finalUpdates: any = { ...updates };
  if (updates.fullName) finalUpdates.firstName = updates.fullName.split(' ')[0];

  await updateDoc(doc(db, 'members', member.id), finalUpdates);
  return { ...member, ...finalUpdates };
}

export function isMemberByEmail(email: string): Member | undefined {
  return currentMembers.find(m => m.email === email);
}

export function getMemberCount(): number {
  return currentMembers.length;
}

export async function removeMember(id: string): Promise<boolean> {
  await deleteDoc(doc(db, 'members', id));
  await renumberCouncil();
  return true;
}

export async function toggleMainFounder(id: string, isMainFounder: boolean): Promise<void> {
  await updateDoc(doc(db, 'members', id), { isMainFounder });
}

/* Set the offices a member holds. Writing an empty list clears them. */
export async function setMemberRoles(id: string, roles: string[]): Promise<void> {
  await updateDoc(doc(db, 'members', id), { roles, role: deleteField() });
}

/* ─── Council editor (admin) ─── */
// Persist an explicit perimeter order: seat = position index for each member.
export async function reorderMembers(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) => updateDoc(doc(db, 'members', id), { seat: i })));
}

export async function setBesties(idA: string, idB: string, color: string): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, 'members', idA), { bestieWith: idB, bestieColor: color }),
    updateDoc(doc(db, 'members', idB), { bestieWith: idA, bestieColor: color }),
  ]);
}

export async function clearBesties(idA: string, idB: string): Promise<void> {
  await Promise.all([
    updateDoc(doc(db, 'members', idA), { bestieWith: deleteField(), bestieColor: deleteField() }),
    updateDoc(doc(db, 'members', idB), { bestieWith: deleteField(), bestieColor: deleteField() }),
  ]);
}

/* ─────────────── Delegate migration ───────────────
   The Founding Delegates tier is gone: there is one council now, and it is
   open. Anyone who signed up as a delegate is folded into it rather than
   dropped, keeping their join order so the council reads in the order people
   actually arrived. Runs once per load, is idempotent, and is a no-op for a
   project that never had delegates. */
export async function migrateDelegatesIntoCouncil(): Promise<number> {
  let snap;
  try {
    snap = await getDocs(query(collection(db, 'delegates'), orderBy('joinedAt', 'asc')));
  } catch {
    return 0;                       // collection absent or unreadable: nothing to do
  }
  if (snap.empty) return 0;

  const taken = new Set(currentMembers.map(m => m.email.toLowerCase()));
  let moved = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const email = String(data.email ?? '');
    if (email && !taken.has(email.toLowerCase())) {
      const id = crypto.randomUUID();
      await setDoc(doc(db, 'members', id), {
        id,
        fullName: data.fullName ?? '',
        firstName: data.firstName ?? '',
        grade: data.grade ?? '',
        classGroup: data.classGroup ?? '',
        email,
        avatar: data.avatar ?? null,
        avatarName: data.avatarName ?? null,
        bio: data.bio ?? null,
        /* Sorted into the council by when they originally joined, not by when
           this migration happened to run. */
        joinedAt: data.joinedAt ?? new Date().toISOString(),
        memberNumber: 0,            // renumbered below, in join order
      });
      taken.add(email.toLowerCase());
      moved++;
    }
    await deleteDoc(doc(db, 'delegates', d.id));
  }

  if (moved) await renumberCouncil();
  return moved;
}

/* Council numbers follow arrival order and stay contiguous. */
async function renumberCouncil(): Promise<void> {
  const snap = await getDocs(query(collection(db, 'members'), orderBy('joinedAt', 'asc')));
  let i = 1;
  for (const d of snap.docs) {
    if (d.data().memberNumber !== i) await updateDoc(doc(db, 'members', d.id), { memberNumber: i });
    i++;
  }
}
