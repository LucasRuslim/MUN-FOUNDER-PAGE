import type { Member, Delegate } from './storage';

/**
 * Development-only preview data: open the dev server with `?demo` to see a
 * seated council and a filled roll call without touching Firestore.
 * Never active in production builds.
 */
export const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

const names = [
  'Lucas Lin', 'Mei Chen', 'Arjun Rao', 'Sofia Park', 'Daniel Wu', 'Hana Sato',
  'Omar Haddad', 'Lena Fischer', 'Kai Huang', 'Nadia Karim', 'Theo Martin',
];
const grades = ['S1', 'S2', 'S3', 'S4', '9th'];

export const demoMembers: Member[] = names.map((fullName, i) => ({
  id: `demo-m${i}`,
  fullName,
  firstName: fullName.split(' ')[0],
  grade: grades[i % grades.length],
  classGroup: `${grades[i % grades.length]}-${(i % 3) + 1}`,
  email: `demo${i}@example.com`,
  memberNumber: i + 1,
  joinedAt: new Date(2026, 8, 1 + i).toISOString(),
  isMainFounder: i === 0,
  bio: i === 0 ? 'Diplomacy is the art of letting someone else have your way.' : undefined,
  ...(i === 3 ? { bestieWith: 'demo-m4', bestieColor: '#fcd34d' } : {}),
  ...(i === 4 ? { bestieWith: 'demo-m3', bestieColor: '#fcd34d' } : {}),
}));

export const demoDelegates: Delegate[] = ['Iris Novak', 'Ben Adeyemi', 'Yuki Tanaka', 'Clara Rossi', 'Ethan Brooks', 'Amira Saleh', 'Jonas Berg'].map((fullName, i) => ({
  id: `demo-d${i}`,
  fullName,
  firstName: fullName.split(' ')[0],
  grade: grades[(i + 2) % grades.length],
  classGroup: `${grades[(i + 2) % grades.length]}-${(i % 2) + 1}`,
  email: `delegate${i}@example.com`,
  delegateNumber: i + 1,
  joinedAt: new Date(2026, 8, 12 + i).toISOString(),
}));
