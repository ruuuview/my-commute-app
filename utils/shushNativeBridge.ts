// utils/shushNativeBridge.ts
// Single accessor for the manual-shush App Group bridge.
//
// The native side (MyCommuteLiveActivityModule, Expo Modules Core) exposes
// getManualShushDate / setManualShushDate over the shared App Group
// (group.com.mycommute.app), the same key the widget's ToggleShushIntent
// flips. The package's JS default export resolves to the native module when
// linked, or to mockFallbackModule otherwise — so this accessor never throws
// and only returns a module whose methods exist. Callers treat a null bridge
// as "widget sync unavailable" and continue with the in-app store as the
// source of truth.
//
// The require() is lazy (function scope) so importing this util from the
// zustand store cannot create an import cycle.

import type { MyCommuteLiveActivity } from 'my-commute-live-activity';

export type ManualShushBridge = Pick<
  MyCommuteLiveActivity,
  'getManualShushDate' | 'setManualShushDate'
>;

export function getManualShushBridge(): ManualShushBridge | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('my-commute-live-activity') as {
      default?: ManualShushBridge | null;
    };
    const mod = pkg?.default ?? null;
    if (!mod) return null;
    if (typeof mod.getManualShushDate !== 'function') return null;
    if (typeof mod.setManualShushDate !== 'function') return null;
    return mod;
  } catch {
    return null;
  }
}
