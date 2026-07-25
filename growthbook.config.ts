/**
 * GrowthBook feature flags config.
 *
 * Guardrail 2/4 — Feature flags & gradual rollouts.
 * Ship new features behind flags so you can kill them instantly without a rebuild.
 *
 * === SETUP ===
 * 1. Create a free GrowthBook account: https://www.growthbook.io/
 * 2. Create a project → get your API key + API host URL
 * 3. Fill in GROWTHBOOK_API_HOST and GROWTHBOOK_CLIENT_KEY in .env
 *
 * === HOW TO USE ===
 * Wrap risky new features:
 *   const showBranchGrid = useFeatureFlag('reroute-branch-grid');
 *   if (showBranchGrid) { ... }
 *
 * Kill a bad feature instantly from GrowthBook dashboard — no app store review.
 *
 * === FREE TIER ===
 * Unlimited feature flags, 3 users, 10k requests/month.
 */

import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { useCallback, useEffect, useRef } from 'react';

const GB_API_HOST = process.env.EXPO_PUBLIC_GROWTHBOOK_API_HOST || '';
const GB_CLIENT_KEY = process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY || '';

let gbInstance: GrowthBook | null = null;

export function getGrowthBook(): GrowthBook {
  if (!gbInstance) {
    gbInstance = new GrowthBook({
      apiHost: GB_API_HOST,
      clientKey: GB_CLIENT_KEY,
      enableDevMode: __DEV__,
    });
  }
  return gbInstance;
}

/**
 * Initialize GrowthBook and start fetching feature flags.
 * Call this at app startup (App.tsx or similar).
 */
export function initFeatureFlags(userId?: string) {
  if (!GB_CLIENT_KEY) {
    console.warn('[GrowthBook] No client key configured — skipping');
    return null;
  }

  const gb = getGrowthBook();
  gb.setAttributes({
    id: userId || 'anonymous',
    // Add custom attributes here for targeted rollouts
    // platform: 'ios',
    // version: '1.0.0',
  });

  gb.loadFeatures({ autoRefresh: true });
  console.log('[GrowthBook] Initialized', GB_CLIENT_KEY ? 'with key' : 'without key');
  return gb;
}

/**
 * React hook to read a feature flag value.
 *
 * Usage: const enabled = useFeatureFlag('reroute-branch-grid', false);
 */
export function useFeatureFlag(flagKey: string, defaultValue = false): boolean {
  const gb = getGrowthBook();
  const isOn = gb.isOn(flagKey);
  return isOn ?? defaultValue;
}

export { GrowthBookProvider };
