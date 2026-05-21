# MY COMMUTE — ONBOARDING ARCHITECTURE & EXECUTION PLAN

## 1. PROJECT PHILOSOPHY (Rules for the AI)
- **High Contrast Onboarding ("The Foyer"):** No fractal glass or complex gradients in the onboarding flow. Use pure solid colors on a deep black background (`#0A0A0F`).
- **The Void:** All background screens must use `#0A0A0F` overlaid with a real 200×200 PNG of photographic film grain tiled at 2-3% opacity (do NOT use Base64 SVG noise) to prevent OLED black smearing and add physical depth.
- **Typography:** Headlines use `SpaceGrotesk-Bold` (or ExtraBold/800), size 32-34, `letterSpacing: -0.5`. Headlines must use `allowFontScaling={true}` but clip gracefully at a maximum of 2 lines.
- **Accessibility & UX:** Every touch target must be at least 44×44pt. Every screen must be wrapped in `SafeAreaView edges={['top','bottom']}`. Sticky bottom bars must use `paddingBottom: insets.bottom + 16` to clear the home indicator.
- **Navigation:** Back swipe gestures must be explicitly enabled on Screens 2 and 3, preserving state via Zustand without resetting.

---

## 2. DEPENDENCIES TO VERIFY
Ensure the following are installed before beginning:
- `fuse.js` (for zero-latency local search)
- `expo-haptics`
- `react-native-reanimated`
- `zustand` & `react-native-mmkv`
- `@shopify/flash-list` (or standard `FlatList` for list virtualization)
- `expo-audio` (for the lightweight audio cue transition; use this instead of deprecated `expo-av`)
- `react-native-purchases` (RevenueCat — subscription and entitlement layer; do **not** build a homebrew subscription system)
- `expo-calendar` (for calendar permission request on Screen 3)
- **Expo bare workflow is required** — not Expo Go / managed workflow. Live Activities and Dynamic Island (iOS) are architecturally incompatible with managed workflow.

---

## 3. CHRONOLOGICAL EXECUTION STEPS

### STEP 0: The Splash Handoff
**File:** `app/splash.tsx` (or inside `_layout.tsx`)
- **Action:** Create a 600ms branded splash screen (SpaceGrotesk wordmark on `#0A0A0F`) to give Zustand time to hydrate from MMKV.
- **Transition:** Fade from the splash into Screen 1 using consistent motion language.

### STEP 1: Upgrade the MMKV/Zustand Brain
**File:** `store/userPreferencesStore.ts`
- **Required State Variables:**
  - `hasCompletedOnboarding: boolean` (default: false)
  - `onboardingStep: number` (0, 1, or 2 - persists if app is killed mid-flow)
  - `selectedLines: string[]`
  - `pinnedStations: object[]` (Max 5. Schema: `{ id, name, lines, role: 'home' | 'work' | 'other' }`)
  - `notificationsGranted: boolean`
  - `calendarGranted: boolean`
  - `entitlementActive: boolean` (synced from RevenueCat `CustomerInfo` — do NOT derive from local state)
- **Required Actions:**
  - `completeOnboarding()`: Sets step to 3, sets `hasCompletedOnboarding` to true.
  - `toggleLine(id)`: Adds/removes line.
  - `pinStation(station, role)`: Enforces max 5 limit.

### STEP 2: The Global "Void" Background
**File:** `components/VoidBackground.tsx`
- Create a reusable background component. Background color: `#0A0A0F`.
- Absolute fill overlay: Image component rendering the 200x200 photographic grain PNG, tiled, at 2-3% opacity with `pointerEvents="none"`.

### STEP 3: Screen 1 - The Hook (Line Selection)
**File:** `app/onboarding/lines.tsx`
- **UI:** Grid of TfL line pills. Pill minimum height must be 52pt.
- **Animation (Stagger Sequence):** Stagger the grid entrance using Reanimated's `FadeInDown` with a `delay={index * 35}` per pill so it feels alive on load.
- **Accessibility:** Pills must include abbreviated line names (e.g., "CEN", "DIS") with `allowFontScaling={false}` and require proper `accessibilityLabel` attributes. Selected pills must use `accessibilityState={{ selected: true }}`.
- **Interaction:** Heavy haptic (`.impact(.heavy)`) and scale-down (`scale: 0.96` max) on select, light haptic (`.impact(.light)`) on deselect.
- **Footer:** Sticky "Next" button. Only enabled if `selectedLines.length > 0`. No skip button allowed.

### STEP 4: Screen 2 - The Refinement (Station Pinning with Fuse.js)
**File:** `app/onboarding/stations.tsx`
- **Header Micro-confirmation:** Selected line pills from Screen 1 animate into a compact horizontal row at the top of Screen 2.
- **Search Engine:** Initialize `Fuse.js`. Set threshold adaptively: `threshold: Math.max(0.2, 0.5 - query.length * 0.05)`.
- **List Virtualization:** Render the search results using `@shopify/flash-list` (or `FlatList` with `getItemLayout`) to prevent frame drops with the ~270 stations dataset.
- **UX:** Zero-latency search. `onChangeText` updates list instantly. If query yields 0 results, show "No exact matches. Popular on your lines:".
- **Constraint:** Max 4 pinned stations.

### STEP 5: Screen 3 - The Superpowers (Permissions & Personalization)
**File:** `app/onboarding/permissions.tsx`
- **The Tease:** Read `selectedLines` and `pinnedStations` from Zustand. Render a mockup of a Push Notification utilizing *their actual commute* using the fractal glass UI.
- **Permission order — Calendar FIRST, then Notifications** (required by both Apple App Store review and by Product Principle 11):
  1. **Calendar disclosure card** — explains on-device-only usage, no cloud sync, matching legal policy copy. Primary CTA: "Allow Calendar Access" (white-fill, 56pt). Triggers `expo-calendar` permission prompt.
     - Granted: `.success` haptic, advance to notification step.
     - Denied: `.error` haptic (subtle), set `calendarGranted: false`, advance to notification step. Schedule in-app banner: "Add calendar in Settings → Privacy → Calendars".
  2. **Notification step** — Personalised notification card preview (fractal glass teaser). Primary CTA: "Enable Alerts". Triggers iOS notification permission prompt.
     - Granted: `.success` haptic → `completeOnboarding()` → Grand Reveal.
     - Denied: `.error` haptic (subtle) → still fire `completeOnboarding()` → Grand Reveal → schedule in-app nudge banner: "Turn on alerts in Settings → Notifications".
- **Secondary Action:** "Maybe later" wrapped in a `Pressable` with an explicit `minHeight: 44`. Fires `completeOnboarding()` and bypasses both permission prompts.

### STEP 6: The Grand Reveal (Cinematic Transition & Routing)
**File:** `app/_layout.tsx` (Router Guard)
- When `completeOnboarding()` is called, trigger a Reanimated sequence:
  1. Fade whole screen to pure Black (`#000000`) for 100ms.
  2. Perform the route swap behind the black screen.
  3. Fade Black out over 400ms, revealing the Dashboard.
  4. **Audio Cue:** Trigger a subtle, physical "thud" audio cue using `expo-audio`, not `expo-av`. Keep the cue lightweight, wrap it in `try/catch`, respect silent mode, and never allow audio-session failure to block the visual transition.

### STEP 7: The Premium Zero State (Safety Net)
**File:** `components/MyCommuteDashboard.tsx`
- **If `hasContent` is false:**
  - Background: Faint `DashboardSkeleton` at 10% opacity.
  - Center Visual: `LivingDot` pulsing radar (ghost white).
  - Copy: "Your commute is a blank slate."
  - **CTAs:** Central "Add Your First Line" bouncy button. Below it, add a secondary ghost button: "Explore without saving" to let users browse the live line map without friction.
