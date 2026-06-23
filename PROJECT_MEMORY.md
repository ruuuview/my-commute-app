# PROJECT MEMORY: MY COMMUTE

## 1. Core Project Identity

- **App Name:** My Commute.
- **Mission:** A high-end, cinematic London Underground navigation app that
  provides background push notifications for line disruptions.
- **Workflow:** Vibe Coding — AI must provide complete, copy-pasteable files,
  not snippets or partial replacements.

## 2. Current Documentation & Strategy Authority

- Strategy & Rules: `MY_COMMUTE_MASTER_PLAN_v2.md`
- Execution Authority: `MY_COMMUTE_EXECUTION_PLAN_v4.5.md`
- Infrastructure: `MY_COMMUTE_INFRASTRUCTURE_v4.5.md`
- UX/UI: `MY_COMMUTE_UX_PLAN_v4.5.md`

## 3. Backend Architecture (LIVE)

- **URL:** <https://my-commute-brain.vercel.app>
- **Status:** Verified "online" and "tfl_connected: true".
- **Stack:** Python 3.12 (FastAPI), MongoDB (Motor/Pymongo), Vercel Serverless.

### Critical Fixes (Do Not Revert)

- **Dependency Locking:** `pymongo` is strictly locked to version 4.6.1 to
  prevent `ImportError` crashes in the `motor` library.
- **Circular Import Fix:** The `_severity_to_visuals` mapping is duplicated
  inside `notification_service.py` to prevent it from trying to import back
  from `api/index.py`.
- **APNS:** Uses direct Apple Push Notification Service (no Firebase) via .p8
  key content injected as the `APNS_KEY_CONTENT` environment variable.

## 4. Frontend Architecture (IN-PROGRESS)

- **Stack:** React Native / Expo (Managed Workflow).
- **State Management:** Zustand (located in `store/userPreferencesStore.ts`) +
  React Native MMKV.
- **Animation:** `react-native-reanimated` for all cinematic transitions.

### UI/UX Philosophy (The Foyer & The Void)

- **Card Heights:** Standard onboarding modules are sized for optimal breathing room: `LineCard` is dynamically scaled between 40px and 48px, while `StationCard` has a 74px minHeight.
- **Accent Bars:** Vertically centered (16px top/bottom offset for 36px bar
  height).
- **Headers:** Step indicators and setup subtitles are aligned inline in a row
  container (`headerTopRow`) to compress vertical height and maintain folding
  limits.
- **Backgrounds:** Onboarding backgrounds (`OnboardingGradient`) combine a
  vertical deep navy base with diagonal cobalt (top-left) and violet (top-right)
  radial blooms.
- **Scroll Affordance:** FlatLists include a bottom fade gradient (`bottomFade`)
  positioned above the sticky CTA footer (`bottom: 110`, `height: 80`).
- **Jubilee Color:** Coded as `'#C8CDD1'` (brighter silver) globally for contrast.
- **Overground:** Displayed as one unified card/item ("Overground") but statuses
  are aggregated dynamically from the six individual TfL Overground branches.
- **Build Scope:** Strictly built and verified for iOS only. Android is out of scope.

## 5. Progress Tracking (Execution Plan v4.8)

- **[COMPLETED]** Vercel Backend deployment and TfL API integration.
- **[COMPLETED]** Cinematic `app/splash.tsx` with high-end fade animations.
- **[COMPLETED]** Step 1: Upgraded the MMKV/Zustand Brain
  (`store/userPreferencesStore.ts`).
- **[COMPLETED]** Step 2: The Global "Void" Background
  (`components/VoidBackground.tsx`) with dynamic ambient gradients.
- **[COMPLETED]** Step 3: Building `app/onboarding/lines.tsx` — an interactive
  grid for selecting favorite tube lines with staggered fade-in animations
  and accessible pills.
- **[COMPLETED]** Step 4: The Refinement (Station Pinning with Fuse.js) —
  `app/onboarding/stations.tsx` using deduplicated local 471 stations list,
  horizontal chips scroll strip, dynamic counting footer, and Option C gradient.
- **[COMPLETED]** Step 5: The Superpowers (Permissions & Personalization) —
  `app/onboarding/permissions.tsx`. (Now bypassed in the 2-screen onboarding).
- **[COMPLETED]** Step 6: The Grand Reveal (Cinematic Transition & Routing) —
  `app/_layout.tsx` handles the fade to black cinematic swap.
- **[COMPLETED]** Step 7: The Premium Zero State (Safety Net) & Dashboard.
- **[COMPLETED]** Step 9: Premium UI/UX Polish, Stale State Detection, & In-Place Status Portal.
  - *Logic:* Replaced the bottom-sheet LineStatusModal with an in-place morphing
    overlay on long-press of LineCards, with custom spring transitions.
- **[COMPLETED]** Step 10: Calendar Leave-By alert scheduler and sequential foreground/background geofencing.
- **[COMPLETED]** CodeRabbit Review Style Alignments (Modal overFullScreen, debug onboarding reset gate, 28x28 Section Add (+) buttons with centered Ionicons, and Edit/Done pill button restyling).
- **[CURRENT TASK]** Final client build preparation and verification (iOS).
