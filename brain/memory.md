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
* [x] **Step 10:** Calendar Leave-By alert scheduler and sequential foreground/background geofencing.
* [x] **Step 11:** Station Screen UI/UX Audit Fixes (Compositing seam, Back button, Segmented control, Plain text freshness footer, Platform contrast, and Graduated severity backgrounds).

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
* **Line Interaction & Detail Modal Redesign:**
  * Removed the obsolete in-place card expansion from `LineCard.tsx` to prevent layouts shifting and colliding with drag-to-reorder.
  * Rewrote `LineDetailModal.tsx` to feature the premium 3-tier layout, spring-driven scale entry animations (0.92 → 1.0), and token-based status mappings.
  * Re-routed the status detail modal activation from single-tap `onPress` to `onLongPress` (with medium haptics) on `LineCard` inside `MyCommuteDashboard.tsx` (preserving the `drag` gesture in edit mode).
  * Fixed three dashboard bugs in `MyCommuteDashboard.tsx`:
    1. **Dashboard scroll freeze**: Added `onRelease` handler to flatlists to reset `isDragging.value` to `false` when gesture completes without a full drag. Set `onLongPress` on `LineCard` conditionally based on `isEditing`.
    2. **Backdrop touch absorption**: Replaced root `Pressable` gesture callbacks (`onLongPress` and `delayLongPress`) with a permanent `backgroundLayer` (`zIndex: 0`) that handles taps to dismiss edit mode and long presses to enter edit mode, completely avoiding timing conflicts with card long-press handlers.
    3. **Card misalignment on exit**: Removed `LayoutAnimation` triggers inside `handleEdit` which conflicted with `StaggeredCardWrapper` Reanimated springs.
  * Fixed three `LineCard.tsx` bugs to align with dashboard gesture timing and sound systems:
    1. **Raised `delayLongPress` to 450ms**: Prevents collisions and race conditions where drag actions triggered root dashboard edit-mode toggles.
    2. **Flattened `handleLongPress`**: Removed redundant local `isEditing` checks, relying entirely on the dashboard-injected gesture router.
    3. **Removed `playSound` inside display mode**: Avoids errors throwing silently from the stripped sound helper.
  * **Fixed a TypeError crash in `LineDetailModal.tsx`**: Replaced the invalid `'close_btn'` preset key with `'back_btn'` in the `usePressAnimation` hook call, resolving the runtime scale animation crash.
  * **Fixed Widget and Modal Severity Mappings**: Aligned TfL Unified API severity code `9` (Minor Delays) with the `.minor` (orange/amber) status type across **[CommuteWidget.swift](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/ios/CommuteWidget/CommuteWidget.swift)** and **[ManageLinesModal.tsx](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/components/ManageLinesModal.tsx)**, resolving the bug where minor delays incorrectly displayed in red (severe/suspended).

---

## 5. Recent Commits & Changes (Jul 1, 2026)

* **GlassRim Component Removal:** Globally removed the `GlassRim` component from the codebase to address container height collapses and nested border complexities. Restored direct, clean, and stable styling (`borderWidth: StyleSheet.hairlineWidth`, `borderColor: 'rgba(255, 255, 255, 0.18)'`) across 11 cards, modals, and sheets in onboarding, dashboard, and settings screens.

---

## 6. Recent Commits & Changes (Jul 3, 2026)

* **Station Detail Screen UI/UX Audit Fixes:**
  * Replaced the header wrapper `<BlurView>` with a plain `<View>`, ensuring the background `DashboardGradient` runs full-bleed beneath the safe area navigation bar without rendering dark bands or seams.
  * Removed the unused `isFirstDueForLine` argument from `renderArrival` signature and its call-sites, along with related logic blocks.
  * Extracted the central `DUE_TIME_STYLE` constant containing color `#FFFFFF` and weight `700` to `theme/colors.ts` and spread it in both components.
  * Deleted unused `lineCard` and `lineCardGap` styles from the stylesheet.
  * Graduate status gradients inside `DashboardGradient.tsx` to keep the dark base visible at all severity levels.
  * Raised platform contrast to `rgba(255,255,255,0.38)` minimum.

---

## 7. Recent Commits & Changes (Jul 11, 2026)

* **Station Resolution & Routing Hardening (Audit Fixes):**
  * Bumped store `schemaVersion` to `2` and implemented synchronous in-memory store migration (`runMigrations.ts`) for legacy slugs/IDs.
  * Reverted `ManageStationsModal` search result deduplication and checkmark selection to use direct canonical ID checks.
  * Extracted central `DUE_TIME_STYLE` inside `colors.ts` and styled due times as white bold (`#FFFFFF` 700), and non-due times as medium-weight/translucent (`rgba(255,255,255,0.65)` 500) across `DepartureCard` and `StationDetailScreen`.
  * Normalized Overground branch names (`weaver`, `mildmay`, etc.) to `'overground'` at database construction inside `tflStations.ts`.
  * Removed dead layout styles (`headerBlur` renamed to `headerContainer`) and deleted dead parameter signatures (`isFirstDueForLine`).
  * Removed live `playSound` call sites from `ManageStationsModal.tsx` while keeping `sound.ts` stub to satisfy locked design specifications.
  * Wired `useWorstStatus` and `computeWorstStatus` hooks to `MyCommuteDashboard.tsx` to drive heartbeat dots, backgrounds, and offline caches.
  * Added Waterloo & City line alias mapping in `apiService.ts`.
  * Verified 100% of store migration unit tests and live station validations pass successfully.
  * Corrected TfL API severity code `9` mapping to `.minor` in `AGENTS.md` and `useWorstStatus.ts`, and aggregated Overground sub-branches to resolve worst-case severity.
  * Hardened `runMigrations.ts` using `Set<string>` to deduplicate canonical IDs, preventing array inflation from duplicate legacy slugs.
  * Rewired `FixItSheet.tsx` static chips to use `AnimatedPressable` and `usePressAnimation('chip')` for unified timing aesthetics, and merged `useAnimatedStyle` objects correctly.
  * Hardened bash pipeline scripts: migrated `generate_hub_map.js` to `execFileSync`, fixed `failedLines` tracking logic in `validate_stations.js`, and upgraded `unit_tests.js` to use isolated sandbox evaluation for dynamic resolution tests.
  * Fixed EAS iOS build failure: Added a post-install hook in `ios/Podfile` to compile `fmt` and `RCT-Folly` targets with `CLANG_CXX_LANGUAGE_STANDARD = 'c++17'` and preprocessor flag `FMT_USE_CONSTEVAL=0`. This fixes C++20 compilation errors on Xcode 16 (on Sonoma/Sequoia build images) caused by strict `consteval` validation in `{fmt}` basic_format_string.
  * Refined `MyCommuteDashboard.tsx` fallback line creation to use explicit offline/error labels (`Offline` or `Connection error`) mapping to the `offline` severity, ensuring `LineCard` has a fully populated prop shape (`id`, `name`, `color`, `status`, `status_severity`) that prevents crashes during API failures.

---

## 8. Pending Roadmap Tasks

1. **Audio Integration (Step 6):** Embed real physical audio thud files for transitions (currently mocked).
2. **Legal Gating (Step 8):** Add hosted Terms of Service and Privacy Policy agreements.
