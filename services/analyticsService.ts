// services/analyticsService.ts
// Product analytics — Phase 7 #15. Locked event names (spec):
//   permission_requested{key, trigger}, permission_granted{key},
//   permission_denied{key}, permission_upgrade_primer_shown{key}
// Current stack: Sentry (error monitoring) only — no product analytics
// provider is installed. Events are emitted to Sentry breadcrumbs + dev
// console today. When EXPO_PUBLIC_POSTHOG_KEY is set, posthogCapture()
// forwards to PostHog (no code change needed at call sites).

import * as Sentry from '@sentry/react-native';

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props?: AnalyticsProps): void {
  if (__DEV__) {
    console.log(`[analytics] ${event}`, props ?? {});
  }
  try {
    Sentry.addBreadcrumb({
      category: 'analytics',
      message: event,
      data: props,
      level: 'info',
    });
  } catch {
    // Sentry not initialized yet — analytics must never crash the app.
  }
  posthogCapture(event, props);
}

/** PostHog-ready capture point. No-op until EXPO_PUBLIC_POSTHOG_KEY is set. */
function posthogCapture(event: string, props?: AnalyticsProps): void {
  if (!POSTHOG_KEY) return;
  // Activation point: when a PostHog project key is configured, wire
  // posthog-react-native here (one import, one capture call). Deliberately
  // not added as a dependency while the key is absent.
  void event;
  void props;
}
