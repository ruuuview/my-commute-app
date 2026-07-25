/**
 * Sentry configuration for React Native / Expo.
 *
 * Guardrail 1/4 — Runtime crash monitoring.
 * Catches production errors before users report them.
 *
 * === SETUP ===
 * 1. Create a free Sentry account: https://sentry.io/signup/
 * 2. Create a new React Native project → get your DSN
 * 3. Fill in SENTRY_DSN below (or set SENTRY_DSN in .env)
 * 4. Run: npx sentry-expo upload-sourcemaps --release <release-version>
 *
 * === FREE TIER ===
 * 5,000 events/month. Enough for a solo dev app.
 */

import * as Sentry from 'sentry-expo';
import { captureException } from '@sentry/react-native';

const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  '';  // ← PASTE YOUR SENTRY DSN HERE (or set EXPO_PUBLIC_SENTRY_DSN in .env)

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn('[Sentry] No DSN configured — skipping initialization');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enableInExpoDevelopment: false,
    debug: __DEV__,
    tracesSampleRate: 0.2,        // 20% of transactions (generous for free tier)
    beforeSend(event: { message?: string; exception?: { values?: Array<{ value: string }> } }) {
      // Ignore known non-actionable errors
      const ignored = [
        'Network request failed',
        'AbortError',
      ];
      if (ignored.some(msg => event.message?.includes(msg))) {
        return null;
      }
      return event;
    },
  });

  console.log('[Sentry] Initialized');
}

/**
 * Wrap async functions with automatic error reporting.
 * Use instead of raw try/catch for async operations.
 *
 * Usage:
 *   const result = await captureErrors('fetchReroute', async () => {
 *     return await api.getReroute();
 *   });
 */
export async function captureErrors<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    captureException(error, {
      extra: { operation, ...context },
    });
    return null;
  }
}
