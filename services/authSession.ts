// services/authSession.ts
// TfL OAuth launch + callback return-path handling.
// Locked by the remediation plan Phase 1 (#3, #11):
//  - originScreen is recorded BEFORE launching (survives app suspension via MMKV)
//  - callback URL scheme: mycommute://auth/callback (registered in app.json)
//  - token persists to Keychain (services/authTokenStore.ts), NOT MMKV
//  - on callback: router.replace() back to the origin screen

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuthFlowStore, AuthOrigin } from '../store/authFlowStore';
import { saveAuthToken } from './authTokenStore';

export const AUTH_REDIRECT_URI = 'mycommute://auth/callback';

const OAUTH_AUTH_URL = process.env.EXPO_PUBLIC_TFL_OAUTH_AUTH_URL;
const OAUTH_CLIENT_ID = process.env.EXPO_PUBLIC_TFL_OAUTH_CLIENT_ID;

export const TFL_REFUND_URL =
  'https://tfl.gov.uk/fares/refunds-and-replacements';

export function isOAuthConfigured(): boolean {
  return Boolean(OAUTH_AUTH_URL && OAUTH_CLIENT_ID);
}

/**
 * Launch the TfL auth flow from a caller screen.
 * - Records originScreen BEFORE launching (persisted — survives kill).
 * - When EXPO_PUBLIC_TFL_OAUTH_AUTH_URL + EXPO_PUBLIC_TFL_OAUTH_CLIENT_ID are
 *   configured, runs the ASWebAuthenticationSession flow via openAuthSessionAsync
 *   (expo-web-browser wraps ASWebAuthenticationSession on iOS) and auto-returns.
 * - Otherwise falls back to the plain TfL Delay Repay web page (prior behavior),
 *   with origin still recorded so a future callback routes correctly.
 */
function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export async function launchTflAuth(origin: AuthOrigin): Promise<void> {
  useAuthFlowStore.getState().beginAuth(origin);

  if (!isOAuthConfigured()) {
    await WebBrowser.openBrowserAsync(TFL_REFUND_URL).catch(() => {});
    useAuthFlowStore.getState().failAuth();
    return;
  }

  const state = generateRandomState();
  useAuthFlowStore.getState().setPendingAuthParams({ state });

  const authUrl =
    `${OAUTH_AUTH_URL}?client_id=${encodeURIComponent(OAUTH_CLIENT_ID!)}` +
    `&redirect_uri=${encodeURIComponent(AUTH_REDIRECT_URI)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, AUTH_REDIRECT_URI);

  if (result.type === 'success' && result.url) {
    await handleAuthCallbackUrl(result.url);
  } else {
    useAuthFlowStore.getState().failAuth();
  }
}

/**
 * Parse a mycommute://auth/callback URL, validate state parameter,
 * persist token to Keychain, and return true when the URL belongs to the auth callback.
 * Does NOT route — the caller routes after reading originScreen.
 */
export async function handleAuthCallbackUrl(rawUrl: string): Promise<boolean> {
  if (!rawUrl.startsWith(AUTH_REDIRECT_URI)) return false;

  const { queryParams } = Linking.parse(rawUrl);
  const error = queryParams?.error ?? null;
  const code = queryParams?.code ?? queryParams?.token ?? null;
  const returnedState = queryParams?.state ? String(queryParams.state) : null;
  const { pendingState } = useAuthFlowStore.getState();

  if (error) {
    useAuthFlowStore.getState().failAuth();
    return true;
  }

  // Validate state parameter to prevent CSRF / login injection attacks.
  if (!returnedState || !pendingState || returnedState !== pendingState) {
    console.error('[authSession] OAuth state mismatch or missing state:', { returnedState, pendingState });
    useAuthFlowStore.getState().failAuth();
    return true;
  }

  if (!code) {
    useAuthFlowStore.getState().failAuth();
    return true;
  }

  try {
    await saveAuthToken(String(code), { issuedAt: Date.now() });
    useAuthFlowStore.getState().completeAuth();
  } catch (err) {
    console.error('[authSession] Failed to persist auth token:', err);
    useAuthFlowStore.getState().failAuth();
  }

  return true;
}

/** Map the recorded origin to its expo-router route. */
export function getOriginRoute(origin: AuthOrigin | null): string {
  switch (origin) {
    case 'refund_radar':
      return '/(tabs)/refunds';
    case 'onboarding':
      return '/onboarding/lines';
    case 'dashboard':
    default:
      return '/';
  }
}

/**
 * Wire the auth callback listener (warm path via Linking event + cold-start
 * path via getInitialURL — covers "kill app mid-auth, relaunch, complete").
 * Returns an unsubscribe function. Call once from the root layout.
 */
export function setupAuthCallbackListener(router: {
  replace: (href: string) => void;
}): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const routeAfterCallback = async (url: string) => {
    if (disposed) return;
    const { originScreen } = useAuthFlowStore.getState();
    const isAuth = await handleAuthCallbackUrl(url);
    if (!isAuth || disposed) return;
    const target = getOriginRoute(originScreen);
    // Small delay lets the router settle on cold start.
    timer = setTimeout(() => {
      if (disposed) return;
      router.replace(target as never);
    }, 150);
  };

  // Warm path: app was alive, system returns via the custom scheme.
  const subscription = Linking.addEventListener('url', ({ url }) => {
    void routeAfterCallback(url);
  });

  // Cold start: app was killed mid-auth and relaunched via the scheme URL.
  Linking.getInitialURL()
    .then((url) => {
      if (url && !disposed) void routeAfterCallback(url);
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    subscription.remove();
  };
}
