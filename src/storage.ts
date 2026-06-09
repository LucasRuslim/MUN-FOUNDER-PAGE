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
  isMainFounder?: boolean;
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

const MAX_MEMBERS = 15;

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

export async function addMember(data: Omit<Member, 'memberNumber' | 'joinedAt' | 'id'>): Promise<Member | null> {
  if (currentMembers.length >= MAX_MEMBERS) return null;
  if (currentMembers.some(m => m.email === data.email)) return null;
  if (currentDelegates.some(d => d.email === data.email)) return null; // one email can't be both

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
  
  // Renumber remaining members to keep sequential memberNumbers
  const snapshot = await getDocs(query(collection(db, 'members'), orderBy('joinedAt', 'asc')));
  let i = 1;
  for (const document of snapshot.docs) {
    if (document.data().memberNumber !== i) {
      await updateDoc(doc(db, 'members', document.id), { memberNumber: i });
    }
    i++;
  }
  return true;
}

export async function toggleMainFounder(id: string, isMainFounder: boolean): Promise<void> {
  await updateDoc(doc(db, 'members', id), { isMainFounder });
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

/* ─────────────── Founding Delegates (unlimited tier) ─────────────── */
export interface Delegate {
  id: string;
  fullName: string;
  firstName: string;
  grade: string;
  classGroup: string;
  email: string;
  delegateNumber: number;
  joinedAt: string;
  avatar?: string;
  avatarName?: string;
  bio?: string;
}

let currentDelegates: Delegate[] = [];

export function subscribeToDelegates(callback: (delegates: Delegate[]) => void) {
  const q = query(collection(db, 'delegates'), orderBy('joinedAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    currentDelegates = snapshot.docs.map(d => d.data() as Delegate);
    callback(currentDelegates);
  });
}

export function getDelegates(): Delegate[] {
  return currentDelegates;
}

export function isDelegateByEmail(email: string): Delegate | undefined {
  return currentDelegates.find(d => d.email === email);
}

export async function addDelegate(data: Omit<Delegate, 'delegateNumber' | 'joinedAt' | 'id'>): Promise<Delegate | null> {
  if (currentDelegates.some(d => d.email === data.email)) return null;
  if (currentMembers.some(m => m.email === data.email)) return null; // one email can't be both
  const newId = crypto.randomUUID();
  const delegate: Delegate = {
    ...data,
    id: newId,
    delegateNumber: currentDelegates.length + 1,
    joinedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'delegates', newId), delegate);
  return delegate;
}

export async function updateDelegate(email: string, updates: Partial<Pick<Delegate, 'fullName' | 'firstName' | 'grade' | 'classGroup' | 'avatar' | 'avatarName' | 'bio'>>) {
  const delegate = currentDelegates.find(d => d.email === email);
  if (!delegate) return null;
  const finalUpdates: any = { ...updates };
  if (updates.fullName) finalUpdates.firstName = updates.fullName.split(' ')[0];
  await updateDoc(doc(db, 'delegates', delegate.id), finalUpdates);
  return { ...delegate, ...finalUpdates };
}

export async function removeDelegate(id: string): Promise<boolean> {
  await deleteDoc(doc(db, 'delegates', id));
  return true;
}

/* Move the longest-waiting delegate into an open founder seat (admin only via
   rules). Re-reads from the server so the count/queue isn't stale right after a
   founder removal. Returns the new Member, or null if no seat is open / no
   delegate is waiting. */
export async function promoteEarliestDelegate(): Promise<Member | null> {
  const memberSnap = await getDocs(collection(db, 'members'));
  if (memberSnap.size >= MAX_MEMBERS) return null;            // no open seat
  const delSnap = await getDocs(query(collection(db, 'delegates'), orderBy('joinedAt', 'asc')));
  if (delSnap.empty) return null;                             // no delegate waiting

  const dDoc = delSnap.docs[0];
  const d = dDoc.data() as Delegate;
  const newId = crypto.randomUUID();
  const member: Member = {
    id: newId,
    fullName: d.fullName,
    firstName: d.firstName,
    grade: d.grade,
    classGroup: d.classGroup,
    email: d.email,
    memberNumber: memberSnap.size + 1,
    joinedAt: new Date().toISOString(),
    ...(d.avatar ? { avatar: d.avatar } : {}),
    ...(d.avatarName ? { avatarName: d.avatarName } : {}),
    ...(d.bio ? { bio: d.bio } : {}),
  };
  await setDoc(doc(db, 'members', newId), member);
  await deleteDoc(doc(db, 'delegates', dDoc.id));
  return member;
}
