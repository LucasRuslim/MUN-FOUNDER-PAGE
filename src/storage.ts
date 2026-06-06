import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, getDocs, query, orderBy } from "firebase/firestore";
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
