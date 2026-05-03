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

/**
 * Trigger Google One Tap / Sign-In popup and return the authenticated user.
 */
export function signInWithGoogle(): Promise<GoogleUser> {
  return new Promise((resolve, reject) => {
    // Wait for the GIS library to load
    const waitForGoogle = () => {
      if (typeof google !== 'undefined' && google.accounts) {
        return true;
      }
      return false;
    };

    if (!waitForGoogle()) {
      // Retry a few times if the script hasn't loaded yet
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (waitForGoogle()) {
          clearInterval(interval);
          initializeAndSignIn();
        } else if (attempts > 20) {
          clearInterval(interval);
          reject(new Error('Google Identity Services failed to load. Please check your internet connection.'));
        }
      }, 200);
    } else {
      initializeAndSignIn();
    }

    function initializeAndSignIn() {
      if (!GOOGLE_CLIENT_ID) {
        reject(new Error(
          'Google Client ID not configured. Please follow the setup instructions in src/googleAuth.ts'
        ));
        return;
      }

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential: string }) => {
          try {
            const payload = decodeJwtPayload(response.credential);
            const user: GoogleUser = {
              name: payload.name as string,
              email: payload.email as string,
              picture: payload.picture as string,
              sub: payload.sub as string,
            };
            resolve(user);
          } catch (err) {
            reject(new Error('Failed to decode Google credential.'));
          }
        },
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      // Use the popup flow (prompt)
      google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; getNotDisplayedReason: () => string }) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback: render a sign-in button if One Tap doesn't show
          // (e.g. user dismissed it before, or browser blocks it)
          const reason = notification.isNotDisplayed()
            ? notification.getNotDisplayedReason()
            : 'skipped';
          console.log('One Tap not shown, reason:', reason);

          // Use renderButton as fallback — we'll create a container in the modal
          const btnContainer = document.getElementById('google-signin-fallback');
          if (btnContainer) {
            google.accounts.id.renderButton(btnContainer, {
              theme: 'outline',
              size: 'large',
              width: 360,
              text: 'continue_with',
              shape: 'rectangular',
            });
          }
        }
      });
    }
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
          }
        ) => void;
        revoke: (email: string, callback: () => void) => void;
      };
    };
  };
}
