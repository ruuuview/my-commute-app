// config/demoMode.ts
// Phase 7 #14 — demo-safety gate. Flip with EXPO_PUBLIC_DEMO_MODE=true at
// build time. A demo build has ZERO Refund Radar surface reachable.

export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
