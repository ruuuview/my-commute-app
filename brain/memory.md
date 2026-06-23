# Memory

This document tracks execution state, updates, and current tasks.

---

## 1. Active State Checklist

* [x] **Step 1:** Upgraded MMKV/Zustand Store (`store/userPreferencesStore.ts`).
* [x] **Step 2:** global Void Background with noise grain texture overlay.
* [x] **Step 3:** Cinematic Onboarding Step 1 (`app/onboarding/lines.tsx`).
* [x] **Step 4:** Fuse.js Station Search and Pinning Onboarding Step 2 (`app/onboarding/stations.tsx`).
* [x] **Step 5:** Splash transitions and layouts completed.
* [x] **Step 6:** Grand Reveal cinematic transition animation inside `app/_layout.tsx`.
* [x] **Step 7:** Dashboard Zero State view and dark glassmorphic `DashboardSkeleton` loading skeleton.
* [x] **Step 9:** Stale state detection inside `useTflPoller`.
* [x] **Step 10:** Leave-by scheduling service parser `services/calendarScheduler.ts`.

---

## 2. Recent Commits & Changes (Jun 22, 2026)

* **`acd3e2a` — fix(departure-card):** Added error states to departure list to gracefully handle offline backend calls.
* **`14909ca` — fix(dashboard):** Render offline lines using MMKV store preferences instead of rendering empty zero states during offline conditions.
* **`Info.plist` Privacy Fix:** Replaced generic *"Nothing leaves your phone"* descriptions with targeted disclosures on local device-only processing.
* **`notificationRegistrationService.ts` Logging Security:** Truncated FCM/APNS push tokens logged in debug statements.
* **`stations.tsx` & Linter Sweep:** Replaced the mock skeleton card with the high-fidelity shimmering component and cleaned up unused Reanimated imports.
* **`MyCommuteDashboard.tsx` Loading Condition:** Configured `DashboardSkeleton` to only show on initial load.

---

## 3. Recent Commits & Changes (Jun 23, 2026)

* **`6f8a6f7` & `c01fe89` — Backend Vercel Fix:** Made `aioapns` import dynamic/optional and added Mongo connection timeouts/lazy connection configurations (`connect=False`) to solve Vercel's serverless `500 FUNCTION_INVOCATION_FAILED` crash on startup.
* **`DashboardGradient` UI Thread Mutation Fix:** Relocated React State (`setLayers`) and React Ref (`prevSeverityRef`) updates from the Reanimated UI thread worklet callback to the JS thread via `runOnJS(onTransitionComplete)`, avoiding worklet memory violations.
* **Dashboard Style and Modal Specification Alignment:** Configured the deferred notification and calendar modals to use slide transitions with `overFullScreen` to preserve iOS blurs. Gated the debug reset onboarding button under `__DEV__`. Re-styled the Section Add (+) buttons to 28x28 circular hitboxes with centered white Ionicons add icons, and the Edit/Done pill button to a capsule pill with paddingHorizontal: 14 / paddingVertical: 6, routing both through `usePressAnimation`.
* **GSD Phase 13 Documentation Alignment:** Created the missing `1-SUMMARY.md` and `VERIFICATION.md` files for Phase 13 under `.gsd/phases/13` to complete the canonical 4-file documentation set.

---

## 4. Pending Roadmap Tasks

1. **Audio Integration (Step 6):** Embed real physical audio thud files for transitions (currently mocked).
2. **Legal Gating (Step 8):** Add hosted Terms of Service and Privacy Policy agreements.
