# ARCHITECTURE & EXECUTION PLAN
## My Commute — Onboarding Architecture & Execution Plan
### v4.8 — Onboarding Permissions Screen & Calendar Scheduler Service (Phase 11)

---

> **Document Hierarchy Notice**
> This is the **implementation authority document**. It owns all *how* — specific files, component names, code patterns, step-by-step build order. Every step here is sanctioned by a decision in `MY_COMMUTE_MASTER_PLAN.md`. When a step contradicts the Master Plan, the Master Plan wins.
>
> **Linked Documents (full suite):**
> - Strategy authority: `MY_COMMUTE_MASTER_PLAN.md` (v2.0+)
> - UX/UI authority: `MY_COMMUTE_UX_PLAN.md` (v4.5+)
> - Infrastructure authority: `MY_COMMUTE_INFRASTRUCTURE.md` (v4.5+)
>
> **Sync Protocol:** Before closing any step as complete, verify the corresponding Master Plan section has not been updated. Each step's reference callout below identifies the owning document and section.

---

## 1. PROJECT PHILOSOPHY (Rules for the AI)
**High Contrast Onboarding ("The Foyer"):** No fractal glass in the onboarding flow. All onboarding screens utilize the locked **Option C** gradient backdrop (`['#070714', '#0A1128', '#001040', '#000810']` at `[0, 0.38, 0.65, 1]`) with high-contrast, pure solid color pills/elements to give the foyer visual depth and atmosphere.

**The Void:** All background screens must use the tiled `VoidBackground` (photographic film grain at `assets/images/grain.png` tiled at 2–3% opacity over `#0A0A0F` or the Option C gradient container) to prevent OLED black smearing and add physical depth. *(Asset successfully generated and wired.)*

**Typography:** Headlines use `SpaceGrotesk-Bold` (or ExtraBold/800), size 32–34, `letterSpacing: -0.5`. Headlines must use `allowFontScaling={true}` but clip gracefully at a maximum of 2 lines.

**Accessibility & UX:** Every touch target must be at least 44×44pt. Every screen must be wrapped in `SafeAreaView edges={['top','bottom']}`. Sticky bottom bars must use `paddingBottom: insets.bottom + 16` to clear the home indicator.

**Reduced Motion Guard:** All Reanimated sequences must be wrapped in a synchronous `useReducedMotion()` hook. If `true`, replace spring animations with instant opacity fades or static states.

**Navigation:** Back swipe gestures must be explicitly enabled on Screens 2 and 3, preserving state via Zustand without resetting.

> **↑ Strategy Reference — Master Plan: "What Is Locked §1 & §2"**
> The Void visual language, typography spec, and Bare Workflow requirement are all locked decisions. No design system changes to these elements may be made at the execution layer without a Master Plan amendment.

---

## 2. DEPENDENCIES TO VERIFY

Ensure the following are installed before beginning:

- `eas-cli` *(CRITICAL: Run `eas build:configure` immediately. Bare workflow apps cannot be reliably signed for App Store from a local machine.)*
- `fuse.js` *(for zero-latency local search)*
- `expo-haptics`
- `react-native-reanimated`
- `zustand` & `react-native-mmkv`
- `@shopify/flash-list` *(or standard FlatList for list virtualization)*
- `expo-audio` *(for light sound effects)*
- `react-native-purchases` *(RevenueCat — subscription and entitlement layer)*
- `expo-calendar` *(for calendar permission request on Screen 3)*

> **↑ Strategy Reference — Master Plan: "The Final Locked Stack"**
> This dependency list is the direct operational expression of the locked stack. Every package here maps to a stack decision. No new dependency enters this list without a corresponding addition to the Master Plan stack section.

---

## 2.5 PRODUCTION AUDIT FIXES (v4.6 → v4.7)

A full production audit scored the onboarding implementation at **82/100**. All 4 critical ship-blockers and 9 warnings were resolved across two passes, followed by a complete ESLint clean sweep (10 warnings → 0).

### Critical Fixes (4)

| # | File | Issue | Resolution |
|---|---|---|---|
| 1 | `lines.tsx` | `getItemLayout` used raw index instead of `Math.floor(index / 2)` for 2-column grid — wrong scroll offsets | Fixed: row math now divides by `numColumns` |
| 2 | `usePressAnimation.ts` | `useReducedMotion()` hardcoded to `false` — WCAG 2.3.3 / Apple HIG violation | Fixed: restored real `useReducedMotion()` hook |
| 3 | `stations.tsx` | `getItemLayout` incompatible with `ListHeaderComponent` — off-by-one crash surface | Fixed: removed `getItemLayout` entirely |
| 4 | `lines.tsx` | `handleSkip` bypassed `completeOnboarding()` — infinite onboarding loop | Fixed: calls `completeOnboarding()` directly |

### Warning Fixes (9)

| # | File | Issue | Resolution |
|---|---|---|---|
| 1 | `stations.tsx` | Search placeholder hardcoded "471 stations" | Fixed: dynamic from `cleanFullStations.length` |
| 2 | `stations.tsx` | Fuse.js index rebuilt on every keystroke | Fixed: index memoised separately from search |
| 3 | `stations.tsx` | MAX_PINS hit → silent error haptic, no UI feedback | Fixed: shake animation + red "Maximum 5 stations" toast in CTA footer |
| 4 | `stations.tsx` | `ctaWrap` position:absolute — Android keyboard overlap | Fixed: flex child of KAV, not absolute |
| 5 | `stations.tsx` | `navHeader` height:44 clips on iPhone SE | Fixed: `insets.top + 44 + 8` |
| 6 | `stations.tsx` | `recentRow` opacity:0.50 cascades to add button | Fixed: removed cascading opacity |
| 7 | `SkeletonCard.tsx` | Shimmer start `-150` (mid-card), destination `300` | Fixed: `-200` → `400`, `750ms` duration |
| 8 | `tflCapitalise.ts` | Regex partial-match corrupts substrings | Fixed: `\b` word-boundary anchors |
| 9 | `stations.tsx` | `handleSkip` used direct `setState` (bypasses middleware) | Fixed: simplified to `completeOnboarding()` only |

### ESLint Clean Sweep (10 warnings → 0)

Removed unused imports (`withSpring`, `SkeletonCard`, `CARD_VERTICAL_GAP`, `tflCapitalise`, `Image` in lines.tsx, `Keyboard`, `useWindowDimensions`), unused state (`loadingResults`, `reducedMotion` in stations.tsx), wrapped `saveToRecents` in `useCallback`, and added `shimmerTranslate` to SkeletonCard's `useEffect` deps.

> **Verification:** `npx tsc --noEmit` = 0 errors, `npx expo-doctor` = 17/17 passed, `npm run lint` = 0 warnings.

---

## 3. CHRONOLOGICAL EXECUTION STEPS

---

### STEP 0: The Splash Handoff & Font Loading — ✅ COMPLETED
**File:** `app/splash.tsx` (or inside `_layout.tsx`)

**Action:** Add `useFonts()` for SpaceGrotesk and utilize `SplashScreen.preventAutoHideAsync()`. Gate the fade transition on the `store.hydrated` promise and the font load, rather than a hardcoded 600ms timer.

**Transition:** Fade from the splash into Screen 1 using consistent motion language.

> **↑ Strategy Reference — Master Plan: "What Is Locked §2 (Stack)"**
> SpaceGrotesk is a locked typography decision. `SplashScreen` management is an Expo Bare Workflow requirement.

---

### STEP 1: Upgrade the MMKV/Zustand Brain — ✅ COMPLETED
**File:** `store/userPreferencesStore.ts`

**Required State Variables:**
- `hasCompletedOnboarding: boolean` (default: `false`)
- `onboardingStep: number` (`0`, `1`, or `2` — persists if app is killed mid-flow)
- `selectedLines: string[]`
- `pinnedStations: object[]` *(Strictly `MAX_PINS = 5` globally. Schema: `{ id, name, lines, role: 'home' | 'work' | 'other' }`)*
- `notificationsGranted: boolean`
- `calendarGranted: boolean`
- `entitlementActive: boolean` *(synced from RevenueCat)*

**Required Actions:**
- `completeOnboarding()`: Sets step to 3, sets `hasCompletedOnboarding` to `true`.
- `toggleLine(id)`: Adds/removes line.
- `pinStation(station, role)`: Enforces max 5 limit.

**Cold Start Verification (CRITICAL):** Add an `AppState` listener that calls `Purchases.getCustomerInfo()` every time the app foregrounds to re-validate `entitlementActive`.

> **↑ Strategy Reference — Master Plan: "Monetization & The Usage-Based Trial" + "The Institutional Wedge §3"**
> `entitlementActive` is the runtime expression of the 10-commute trial monetization model. The cold-start listener is mandatory — trial expiry can occur while the app is backgrounded.
> **B2B Architecture Constraint:** `pinnedStations` and `selectedLines` must not store PII. These fields will form the basis of future anonymous cohort aggregation for the institutional data layer. This constraint must not be relaxed at any point.

---

### STEP 2: The Global "Void" Background — ✅ COMPLETED
**File:** `components/VoidBackground.tsx`

Create a reusable background component. Background color: `#0A0A0F`.

Absolute fill overlay: `Image` component rendering `assets/images/grain.png`, tiled, at 2–3% opacity with `pointerEvents="none"`.

> **↑ Strategy Reference — Master Plan: "What Is Locked §1 (Product Direction)" + "Project Philosophy"**
> The Void is the locked visual identity for onboarding. This component is reused across all 3 onboarding screens. The grain asset successfully generated at `assets/images/grain.png`.
>
> **↑ UX Reference — UX Plan: "Section 0 — Design Philosophy" + "Section 1.1 — Token System"**
> `VoidBackground.tsx` must use only Void tokens (`#0A0A0F` base, grain overlay). Glass tokens from UX Plan §1.1 are NOT imported here — they activate only post-Grand Reveal. Keep these environments strictly separated.

---

### STEP 3: Screen 1 — The Hook (Line Selection) — ✅ COMPLETED
**File:** `app/onboarding/lines.tsx`

**UI:** Grid of TfL line pills. Pill minimum height must be 52pt.

**Animation (Stagger Sequence):** Stagger the grid entrance using Reanimated's `FadeInDown` with a `delay={index * 35}` per pill. Wrap in `reduceMotion` guard.

**VoiceOver Traversal:** Ensure pills have explicit `importantForAccessibility` ordering so the screen reader does not read the grid randomly.

**Footer:** Sticky "Next" button. Only enabled if `selectedLines.length > 0`. No skip button allowed.

> **↑ Strategy Reference — Master Plan: "What Is Locked §1 (Data Scope)"**
> Line pills are scoped to exactly 24 lines across `tube, elizabeth-line, overground, dlr`. Trams, Buses, River Services, and Cable Cars are excluded by locked decision. The pill dataset must not expand without a Master Plan amendment.

---

### STEP 4: Screen 2 — The Refinement (Station Pinning with Fuse.js) — ✅ COMPLETED
**File:** `app/onboarding/stations.tsx`

**Search Engine:** Initialize Fuse.js. Set threshold adaptively to `0.2` and sorting prefix starts-with query boost to provide instantaneous zero-latency local matches.

**List Virtualization:** Render the search results using `@shopify/flash-list`.

**Constraint:** Max 5 pinned stations. *(Aligns exactly with the Zustand store logic in Step 1.)*

> **↑ Strategy Reference — Master Plan: "What Is Locked §1 (Data Scope)"**
> The 471-station figure is a locked product scope decision. The Fuse.js index must be built against this exact dataset. Any dataset change must be approved at the Master Plan level before this step is reopened.

---

### STEP 5: Screen 3 — The Superpowers (Permissions & Personalization) — ⏳ IN PROGRESS
**File:** `app/onboarding/permissions.tsx`

**Required Details:**
- Render `ProgressDots` with `total={3} current={3}`.
- First card requests Calendar permission using `requestCalendarPermission()` (preceded by verbatim disclosure text).
- Second card requests Notification permission using `requestNotificationPermission()`.
- Bottom secondary button "Maybe later" (min height 44pt) allows skipping, calling `completeOnboarding()` to trigger the Grand Reveal transition to the dashboard.
- Set explicit VoiceOver accessibility ordering.
- Enable back swipe gesture back to stations.

**Permission order — Calendar FIRST, then Notifications:**

- **Calendar disclosure card:** Primary CTA: "Allow Calendar Access". Triggers `expo-calendar` permission prompt.
  - **Mandatory disclosure copy (verbatim):** *"We read departure times alongside your calendar — all on your device. Nothing leaves your phone."* This copy must appear before the OS prompt fires.
- **Notification step:** Primary CTA: "Enable Alerts". Triggers iOS notification permission prompt.
- **Secondary Action:** "Maybe later" wrapped in a `Pressable` with an explicit `minHeight: 44`. Fires `completeOnboarding()`.

> **↑ Strategy Reference — Master Plan: "Compliance & Legal (Launch Blockers)"**
> The calendar disclosure copy is a compliance hard-block, not a design decision. It must appear verbatim. The calendar-first permission order is intentional — calendar access is higher-value for the Live Activity trigger than notifications. Do not reorder.

---

### STEP 6: The Grand Reveal (Cinematic Transition & Routing) — ✅ COMPLETED
**File:** `app/_layout.tsx` (Router Guard)

When `completeOnboarding()` is called, trigger a Reanimated sequence:
1. Fade whole screen to pure Black (`#000000`) for 100ms.
2. Perform the route swap behind the black screen.
3. Fade Black out over 400ms, revealing the Dashboard.

**Audio Cue:** Trigger a subtle, physical audio cue using `expo-audio`. The file plays a soft thud sound with fallbacks for silent mode/unavailable assets.

> **↑ Strategy Reference — Master Plan: "Accelerator & Narrative Strategy"**
> This transition is the highest-leverage moment for App Store preview video storytelling. It must be built to screen-record quality — no dropped frames, no animation jitter. Prioritise a stable build of this step before scheduling any preview video capture.

---

### STEP 7: The Premium Zero State (Safety Net) — ✅ COMPLETED
**File:** `components/MyCommuteDashboard.tsx`

**If `hasContent` is false:**
- Background: Faint `DashboardSkeleton` at 10% opacity.
- Center Visual: `LivingDot` pulsing radar (ghost white). Add static fallback for `reduceMotion === true`.
- Copy: *"Ready when you are. Add your first line."*

> **↑ Strategy Reference — Master Plan: "Offline & Stale-Data Architecture"**
> The zero state (`hasContent === false`) is distinct from the stale-data state (content exists but is outdated). This step currently implements zero state only. The stale-data state — amber warning dot, "Updated 4 min ago" timestamp — is handled in Step 9.
>
> **↑ UX Reference — UX Plan: "Section 5.3 — Ghost States"**
> The canonical three-state table (zero / loading / stale) is in UX Plan §5.3. This step implements only the zero state row. Loading state is an open action item. Stale state is implemented in Step 9.

---

### STEP 8: Monetization & Compliance Hardening
**File:** `app/settings/subscription.tsx`

**Restore Purchases (CRITICAL):** Add a visible "Restore Purchases" button calling `Purchases.restorePurchases()`. *(Apple App Store review guideline 3.1.1 will reject the app automatically without this.)*

**Legal Links:** Embed explicitly clear links to the Privacy Policy and Terms of Service hosted at `getmycommute.app/legal`.

> **↑ Strategy Reference — Master Plan: "Compliance & Legal (Launch Blockers)" + "Monetization & The Usage-Based Trial"**
> Both items in this step are P0 launch blockers — not enhancements. Restore Purchases is an App Store hard-reject. Legal links are required before submission per the Master Plan compliance section. Neither item may be deferred to a post-launch patch. This step must be closed before any TestFlight submission is initiated.

---

### STEP 9: Premium UI/UX Polish & TfL Stale State Detection — ✅ COMPLETED
**Files:** `components/MyCommuteDashboard.tsx`, `hooks/useTflPoller.ts`

**Action 1: GradientBackground Wiring**
- Positioned as absolute fill under the root dashboard view.
- Crossfades between status gradients over 800ms using Reanimated `withTiming`.
- Instant snap when `useReducedMotion()` is active.

**Action 2: Slim Line Pills**
- Rewrite all line pill components to single-row layouts.
- Left edge starts with a 3px color bar (height 20, border radius 2).
- Line name rendered in 14px SpaceGrotesk SemiBold.
- A flexible spacer (`flex: 1`) separates the name from the status.
- Status text rendered in 12px SpaceGrotesk Medium, adjacent to an 8px traffic status dot.
- A subtle chevron indicator (`›`) completes the row on the right.

**Action 3: Premium Sinusoidal Float & Spring Scaling**
- `useJiggle`: The edit mode floating motion uses Reanimated `withTiming` over 900ms, swinging between `0` and `1.5deg` in a soft sine curve to avoid hyperactive jitter.
- `usePressSpring`: Bouncy scale spring (scales down to 0.96 with damping 15/stiffness 300) when tap begins.
- Plays lightweight tap feedback sound (`assets/audio/tap.wav`) via `expo-audio` + triggers `expo-haptics` light impact feedback.
- Zustand store selectors wrapped in `useShallow` to prevent excessive re-renders during state mutations.

**Action 4: TfL Stale State Detection & Subheading Alerts**
- Upgraded the poller hook `useTflPoller` to measure network availability via NetInfo, catch HTTP errors (status >= 500), and track fetch timeouts (8000ms).
- If `Date.now() - lastSuccessfulFetch > 180000` (3 minutes), set `staleState` to:
  - `'offline'` if there is no internet connection.
  - `'tfl-error'` if TfL returns HTTP error or timeout.
  - `'tfl-delayed'` if data is loaded successfully but the server's update timestamp age is greater than 10 minutes.
- Exposed `staleState` and `staleMinutes` to `MyCommuteDashboard.tsx`.
- Render `StaleStatusText` below the list of disrupted lines inside the status area (never replace the disrupted list). Pulse opacity (`0.4` to `0.9` at 3000ms duration) for active warning states, or static 0.7 when `useReducedMotion()` is `true`.

---

### STEP 10: Calendar & Notification Background Scheduler — ⏳ IN PROGRESS
**Files:** `services/calendarScheduler.ts`, `components/MyCommuteDashboard.tsx`

**Action 1: Calendar Event Fetching & Substring Matching**
- Implement `scheduleCalendarCommuteAlerts()` inside `services/calendarScheduler.ts`.
- Check calendar permission via `expo-calendar`. Fetch events for the next 24 hours.
- Scan event location strings and substring match them against the 471 supported stations in `FULL_STATIONS` (matching longer names first for precision).
- If a station matches, identify the user's primary pinned station (origin) from `userPreferencesStore`.

**Action 2: Travel Duration Query & Offline Caching**
- Query Vercel backend `${BACKEND_URL}/api/journey-planner` with `from_station` and `to_station` to fetch transit duration.
- Cache the duration locally in MMKV (e.g. `commute_duration_${origin}_${dest}`) to ensure offline resiliency.
- If offline or backend is down, fall back to the MMKV cache, or use a default of 30 minutes. If no station matches, fall back to 30 minutes.

**Action 3: Leave-By Alert Scheduling**
- Calculate leave-by trigger: `event.startDate - travelTime - 15 minutes` warning.
- If the alert time is in the future, schedule a local notification using `expo-notifications`: *"Time to leave for {event.title}"* showing the leave-by time and travel duration.
- Cancel previous notifications before scheduling new ones to prevent duplication.

**Action 4: Dashboard Wiring**
- Import and call `scheduleCalendarCommuteAlerts()` inside a mount `useEffect` on the dashboard (if permissions are active) and on app foreground transitions.

> **↑ Strategy Reference — Master Plan: "The Zero-Open Lifecycle (Dynamic Island)" + "Offline & Stale-Data Architecture"**
> The calendar parser is a crucial component of the zero-open experience. Caching duration in MMKV ensures 100% offline-safe leave-by calculation even on the Tube.

---

## 4. OPEN ACTION ITEMS (Post v4.6)

| # | Item | Owner | Blocks | Source |
|---|---|---|---|---|
| 1 | Source `assets/audio/thud.wav` (un-mock audio and fully integrate) | Founder | Step 6 | Execution Step 6 |
| 2 | Host Privacy Policy + ToS at `getmycommute.app/legal` | Founder | Step 8 / TestFlight | Master Plan Compliance |
| 3 | Add loading state skeleton (100% opacity + shimmer) to `MyCommuteDashboard.tsx` | Engineering | Step 7 | UX Plan §5.3 |
| 4 | Add Live Activity (Dynamic Island) as Execution Step 10 | PM | Post-launch | Master Plan Zero-Open Lifecycle |
| 5 | Run `eas build:configure` | Founder | Every signed build | Infra Doc §5 |
| 6 | Upgrade Vercel to Pro before first TestFlight invite | Founder | TestFlight | Infra Doc §2 |
| 7 | Set Sentry `tracesSampleRate: 0` + daily cap ~160/day | Engineering | Quota burn | Infra Doc §4 |
| 8 | Wire `SkeletonCard` loading state into `stations.tsx` (currently scaffolded but unused) | Engineering | UX completeness | Audit v4.7 |
| 9 | Wire `ctaWrap` Android KAV behaviour test on physical Android device | Engineering | Android launch | Audit v4.7 |
