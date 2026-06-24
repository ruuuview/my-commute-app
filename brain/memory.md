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
* **CodeRabbit Review Findings Resolved:** Refactored the native iOS `WidgetModule` bridge methods (`reloadWidget`, `saveWidgetStatusCache`) to a Promise-based API for error visibility in JS. Added accessibility props to settings notification CTA and cancel timing animations on unmount to prevent state leaks. Handled calendar alerts scheduler rejections on mount and AppState changes.
* **iOS Lock Screen Widget Optimization:** Added support for `.accessoryCircular`, `.accessoryRectangular`, and `.accessoryInline` widget families in `CommuteWidget.swift`. Implemented custom SwiftUI subviews for each accessory family and configured dynamic switches inside `CommutePremiumEntryView` to support iOS lock screen widget configuration.
* **Onboarding Line Card Height Revert:** Reverted `ONBOARDING_CARD_HEIGHT` back to `48` in `layout.ts` and refactored `LineCard.tsx` to dynamically switch styles based on cardHeight: it renders slim on the dashboard (height 38, radius 16, font 13 SemiBold) but reverts to its previous larger styling on the onboarding screen (height 48+, radius 18, font 14 Bold).
* **LineCard Expansion Height Fix:** Resolved a React Native layout bug where the expanded `LineCard` remained squished to 38px on the dashboard by removing `flex: 1` from `expandedContent` and separating the invisible measure container from `styles.cardInner` to let content wrap and measure its natural height.
* **`cf40526` — refactor(linecard):** Refactored `LineCard.tsx`'s expanded UI state hierarchy and layout geometry to strictly enforce a top-to-bottom vertical stack, dismantling the side-by-side header. Implemented capsule status pill and bound the vertical accent bar to the header row. Applied premium glassmorphic styling (intensity 40, rgba fill, border 1).
* **`38bc205` — fix(gradient):** Relocated the React Ref (`prevStatusRef`) mutation from the Reanimated UI thread callback to a JS callback (`handleTransitionComplete`) executed via `runOnJS`, eliminating the Reanimated worklet memory violation warning.
* **`73f56ec` — fix(coderabbit):** Addressed the CodeRabbit review findings by:
  * Correcting severity code 9 mapping to `.severe` in `CommuteWidget.swift`.
  * Implementing rank-based comparison (`SeverityLevel.rank`) inside `worstLine`/`otherLines` in `CommuteWidget.swift` to resolve misranking of suspended lines.
  * Guarding widget fallback/deepfreeze `debugMessage` to check `lines.isEmpty` to preserve stale status layout displaying.
  * Removing opacity updates on reduced motion inside `GradientBackground.tsx` to prevent transition flickers.
  * Adding haptic feedback and deselect sounds to backdrop dismissal press actions, and grouping `'error'` under severe red color styles in `LineDetailModal.tsx`.
* **`8c93e95` — build(ios):** Upgraded iOS deployment target to `16.0` globally in CocoaPods `Podfile` and `project.pbxproj` configuration files to support compilation of iOS 16 lock screen widget families (`accessoryCircular`, `accessoryRectangular`, and `accessoryInline`).

---

## 4. Recent Commits & Changes (Jun 24, 2026)

* **Onboarding Line Card Height Restoration:** Restored `ONBOARDING_CARD_HEIGHT` to `68` in `layout.ts` and restored the `dynamicCardHeight` clamp range in `app/onboarding/lines.tsx` to clamp between `56` and `84` (originally reduced to 48-54 in a previous style pass), bringing the onboarding line cards back to their premium original size.

---

## 5. Pending Roadmap Tasks

1. **Audio Integration (Step 6):** Embed real physical audio thud files for transitions (currently mocked).
2. **Legal Gating (Step 8):** Add hosted Terms of Service and Privacy Policy agreements.

