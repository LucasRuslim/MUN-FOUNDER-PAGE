/**
 * Google Identity Services (GIS) authentication module.
 * 
 * Uses the newer Google Identity Services library (accounts.google.com/gsi/client)
 * which returns a JWT credential (ID token) that we decode client-side
 * to get the user's name and email. No backend required.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project (or select existing)
 * 3. Go to APIs & Services → Credentials
 * 4. Click "Create Credentials" → "OAuth client ID"
 * 5. Application type: "Web application"
 * 6. Add Authorized JavaScript origins:
 *    - http://localhost:5173 (for development)
 *    - Your production URL when deploying
 * 7. Copy the Client ID and paste it below
 */

import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './storage';

// ⚠️ REPLACE THIS with your actual Google OAuth Client ID
const GOOGLE_CLIENT_ID = '480889035387-h3dapptsn37dpkb5109q5qf1g0k95l2l.apps.googleusercontent.com';

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  sub: string; // unique Google user ID
}

/**
 * Decode a JWT token payload (the middle part) without verification.
 * This is safe for client-side use since the token comes directly from Google's servers.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

/** Cached signed-in user for the current page session (prevents double prompts). */
let cachedUser: GoogleUser | null = null;
export function getCachedGoogleUser(): GoogleUser | null {
  return cachedUser;
}
export function clearGoogleUser(): void {
  cachedUser = null;
}

/* Shared GIS init — registered once, fans out the credential to whoever is waiting. */
let initialized = false;
let pendingResolvers: ((u: GoogleUser) => void)[] = [];

function waitForGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts) return resolve();
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (typeof google !== 'undefined' && google.accounts) { clearInterval(interval); resolve(); }
      else if (attempts > 40) { clearInterval(interval); reject(new Error('Google Sign-In failed to load. Check your connection / ad-blocker.')); }
    }, 150);
  });
}

function ensureInit() {
  if (initialized) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: async (response: { credential: string }) => {
      try {
        const payload = decodeJwtPayload(response.credential);
        const user: GoogleUser = {
          name: payload.name as string,
          email: payload.email as string,
          picture: payload.picture as string,
          sub: payload.sub as string,
        };
        cachedUser = user;
        // Exchange Google's ID token for a Firebase Auth session so Firestore
        // security rules can verify the user (request.auth / request.auth.token.email).
        // Failures are non-fatal: the sign-in UI still works; only secured writes
        // require this to succeed (see Firestore rules).
        try {
          const cred = GoogleAuthProvider.credential(response.credential);
          await signInWithCredential(auth, cred);
        } catch (e) {
          console.error('Firebase Auth sign-in failed:', e);
        }
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        resolvers.forEach((r) => r(user));
      } catch {
        /* ignore malformed credential */
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  initialized = true;
}

/**
 * Render the official Google Sign-In button into `el` (the reliable path that
 * works even when One Tap is suppressed). Resolves with the user once they sign in.
 */
export async function renderGoogleButton(el: HTMLElement): Promise<GoogleUser> {
  await waitForGoogle();
  ensureInit();
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    el.innerHTML = '';
    google.accounts.id.renderButton(el, {
      theme: 'filled_blue',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 300,
      logo_alignment: 'center',
    });
    // Also try One Tap as a bonus — harmless if it doesn't show.
    try { google.accounts.id.prompt(); } catch { /* noop */ }
  });
}

/**
 * One Tap / prompt flow. Returns the cached user instantly if already signed in.
 * May not display a prompt in all browsers — prefer renderGoogleButton for UI.
 */
export function signInWithGoogle(force = false): Promise<GoogleUser> {
  if (cachedUser && !force) return Promise.resolve(cachedUser);
  return new Promise(async (resolve, reject) => {
    try { await waitForGoogle(); } catch (e) { return reject(e); }
    ensureInit();
    pendingResolvers.push(resolve);
    try { google.accounts.id.prompt(); } catch { /* noop */ }
  });
}

// TypeScript declarations for the Google Identity Services global
declare global {
  const google: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
        }) => void;
        prompt: (callback?: (notification: {
          isNotDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
          getNotDisplayedReason: () => string;
        }) => void) => void;
        renderButton: (
          element: HTMLElement,
          config: {
            theme?: string;
            size?: string;
            width?: number;
            text?: string;
            shape?: string;
            logo_alignment?: string;
          }
        ) => void;
        revoke: (email: string, callback: () => void) => void;
      };
    };
  };
}
