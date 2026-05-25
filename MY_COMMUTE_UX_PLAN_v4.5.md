# UX & UI MASTER PLAN
## My Commute — London Transport Dashboard
### "Fractal Glass — Ambient Status Refraction" — Complete Specification
### v4.5 — Fully Audited, Patched & Strategically Bridged

---

> **Document Hierarchy Notice**
> This is the **visual and interaction design authority document**. It owns all UX/UI decisions — design system tokens, animation specs, accessibility mandates, component states, and screen-level behaviour. It does not own product strategy (→ `MY_COMMUTE_MASTER_PLAN.md`), implementation file structure (→ `MY_COMMUTE_EXECUTION_PLAN.md`), or infrastructure costs (→ `MY_COMMUTE_INFRASTRUCTURE.md`).
>
> **Linked Documents:**
> - Strategy authority: `MY_COMMUTE_MASTER_PLAN.md` (v2.0+)
> - Implementation authority: `MY_COMMUTE_EXECUTION_PLAN.md` (v4.5+)
> - Infrastructure authority: `MY_COMMUTE_INFRASTRUCTURE.md` (v4.5+)
>
> **Sync Protocol:** Any token change in Section 1 must be reflected in `VoidBackground.tsx` (Execution Step 2) and `GradientBackground` component before the change is considered live. Any copy change in Section 17 must be cross-checked against the verbatim compliance copy in the Master Plan Compliance section.

---

## AUDIT CONFLICT RESOLUTIONS (v4.2 → v4.3 → v4.4 → v4.5)

| # | Change | Resolution |
|---|---|---|
| 1 | Dark Mode Only Justification | Resolved: Explicitly documented the dark-only decision to satisfy Apple App Store accessibility review. The cinematic "Void" identity relies on OLED black; no light mode will be shipped. |
| 2 | Fractal Glass Contrast | Resolved: All text rendered inside `expo-blur` glass components MUST pass the WCAG 4.5:1 contrast ratio minimum. |
| 3 | VoiceOver Traversal Order | Resolved: Screens 1, 2, and 3 must explicitly utilise `importantForAccessibility` and `accessibilityElements` array ordering so blind users aren't trapped in a random grid reading order. |
| 4 | SpaceGrotesk Font Loading | Resolved: Added `useFonts()` and `SplashScreen.preventAutoHideAsync()` to the Step 0 splash screen architecture so the app doesn't flash system fonts on older devices. |
| 5 | Empty State Copy | Resolved: Rewrote "Your commute is a blank slate" (weak) to "Ready when you are. Add your first line." (Forward-looking and personalised). |
| 6 | Loading Skeleton Opacity | Resolved: Explicitly separated the 10% faint zero-state skeleton from the 100% full-opacity data-loading skeleton. |
| 7 | Sinusoidal Floating Jiggle | Resolved: Replaced hyperactive withSpring/sequence loops in Jiggle Mode with a premium, fluid sinusoidal rotate pattern using `withTiming` (900ms duration, max 1.5° rotation) for a native iOS floating feel. |
| 8 | Synchronous Reduced Motion | Resolved: Replaced asynchronous `AccessibilityInfo` check with React Native Reanimated's native, synchronous `useReducedMotion()` hook to prevent screen flickering and race conditions. |

> **↑ Cross-Document Alignment Note**
> Items 4, 5, 7, and 8 above have direct counterparts in other documents. Item 4 (font loading) is implemented in **Execution Plan Step 0**. Item 5 (zero state copy) is the exact copy string in **Execution Plan Step 7**. Items 7 and 8 (floating jiggle & reduced motion) are implemented in **Execution Plan Step 9**. If any are changed here, they must be updated in sync.

---

## SECTION 0 — DESIGN PHILOSOPHY

This app is a premium, native iOS transport companion built on a single core thesis: **passive intelligence.**

**Two visual environments, one product:**
- **"The Foyer" (Onboarding):** Option C linear gradient (`['#070714', '#0A1128', '#001040', '#000810']` at `[0, 0.38, 0.65, 1]`) + film grain overlay. SpaceGrotesk. High-contrast, cinematic (no frosted glass/BlurView elements).
- **"Fractal Glass" (App interior):** `GradientBackground` component (dynamic traffic-light gradient) + `expo-blur` glass cards (`tint="light"`). SF Pro.

The Grand Reveal transition is the deliberate handoff between these two worlds.

**Accessibility Mandate (Dark Mode):** We are shipping a Dark Mode Only experience. To compensate for the lack of a light mode and pass Apple's accessibility review, text contrast is non-negotiable. All uncontained text uses dual-mode tokens, and all text inside glass cards must strictly meet WCAG 4.5:1 contrast ratios.

> **↑ Strategy Reference — Master Plan: "What Is Locked §1 & §2"**
> The Void / Fractal Glass two-environment system is the locked UI engine referenced in the Master Plan stack. "The Foyer" maps exactly to **Execution Plan Steps 2–5** (onboarding screens). "Fractal Glass" maps to **Execution Plan Step 7** (dashboard). The Grand Reveal transition in **Execution Plan Step 6** is the physical handoff point between these two environments and must be treated as a premium product moment — not a routing detail.

---

## SECTION 1 — DESIGN SYSTEM: FRACTAL GLASS (COMPLETE)

### 1.1 Token System

| Token | Value | Usage |
|---|---|---|
| `glass-bg-card` | `rgba(255, 255, 255, 0.15)` | Frosted surface over gradient |
| `glass-border-default` | `rgba(255, 255, 255, 0.40)` | Crisp 0.5px white border, defines glass edge |
| `text-primary` | `rgba(255, 255, 255, 0.95)` | Top 65% of gradient screen, and always inside cards |

**Blur tokens:**
- `blur-card`: `tint="light"`, intensity 20 — MUST be light tint so gradient refracts through the glass. NEVER use dark tint on blur; it absorbs the ambient gradient.

> **↑ Implementation Reference — Execution Plan: "Step 2 — VoidBackground.tsx"**
> `VoidBackground.tsx` uses `#0A0A0F` as the base — no glass tokens. Glass tokens activate only in the Fractal Glass environment (post-Grand Reveal). Do not import glass tokens into onboarding screen components.

---

### 1.8 Animation System & Reduced Motion (CRITICAL)

All animations use React Native Reanimated 3.

**Sinusoidal Jiggle floating physics (Jiggle Mode):**
The Edit Mode (Jiggle Mode) animation uses a fluid, sinusoidal float pattern using `withTiming` with a duration of 900ms and a peak rotation of `1.5deg` to achieve a highly premium, non-jittery iOS-native feel rather than a hyperactive spring sequence. When reduced motion is active, the rotation cancels instantly and falls back to a clean static layout.

**Reduced motion (App Store Requirement):**
You MUST wrap/guard ALL animations using Reanimated's native `useReducedMotion()` hook. 
- When `useReducedMotion()` is `true`, replace all spring/translate animations with instant opacity changes or extremely fast fades.
- The `LivingDot` pulsing radar must immediately revert to static concentric rings.
- The `StaleStatusText` pulsing opacity (3000ms duration, 0.4 to 0.9 opacity) must fall back to a static 0.7 opacity.

> **↑ Implementation Reference — Execution Plan: "Section 1 — Project Philosophy (Reduced Motion Guard)"**
> The `useReducedMotion()` check referenced in the Execution Plan Philosophy is the implementation hook for this UX requirement. They describe the same behaviour. The static fallbacks apply to **Execution Plan Step 7** (zero state) and **Step 9** (polish & stale UI) and must be implemented there.

---

## SECTION 2 — ARCHITECTURE & DATA

### 2.1 Ambient Status Architecture — `useWorstStatus` Hook

This is the core of the Ambient Status Refraction system.

| Status | Token | Condition |
|---|---|---|
| `status-good` | Green | Good Service |
| `status-minor` | Amber | Minor Delays |
| `status-severe` | Red | Severe Delays |
| `status-suspended` | Dark Red | Suspended / Part Closed |

**Rule:** `useWorstStatus` is the ONLY place in the codebase that determines status severity. If community reports ≥ 3 AND TfL shows `'good'`, upgrade to `'minor'` (community overrides TfL optimism).

> **↑ Infrastructure Reference — Infrastructure Doc: "Section 2 — TfL API Resiliency"**
> `useWorstStatus` consumes the TfL API response. The stale-data detection in client-side hook (`useTflPoller`) monitors fetch timeout (8000ms), network availability, and HTTP errors to show accurate status messages in real-time. When the cache is stale, `useWorstStatus` must propagate a `stale: true` flag upstream to trigger the warning state and stale UI.

---

## SECTION 5 — GHOST STATES

### 5.3 Loading State — Skeleton Shimmer (Updated)

Shown when a card is in loading state (first ever fetch).

- **Opacity:** 100% full opacity *(unlike the faint zero-state skeleton — see distinction below)*
- **Shimmer:** Animated left-to-right gradient sweep (`transparent → rgba(255,255,255,0.06) → transparent`)
- **Reduced motion:** Replace shimmer with static skeleton. Add subtle opacity pulse at 2s interval.

**Critical distinction — two skeleton states:**

| State | Trigger | Skeleton opacity | Shimmer / Pulse |
|---|---|---|---|
| Zero state | `hasContent === false` | 10% (faint, ghosted) | None |
| Loading state | `hasContent === true`, data fetching | 100% (full opacity) | Yes |
| Stale state | Data exists but TfL cache expired | 100% | Pulsing text (`0.4` to `0.9` opacity, `3000ms` timing) |

> **↑ Implementation Reference — Execution Plan: "Step 7 — Premium Zero State"**
> Step 7 implements the zero state row only (10% skeleton). The loading state is an open action item. Stale state (pulsing alert text in subheading area) is implemented in **Execution Plan Step 9**.

---

## SECTION 10 — ACCESSIBILITY (VoiceOver) — (UPDATED)

### 10.1 Screen Reader Support (Full Spec)

- **Language:** `accessibilityLanguage="en-GB"` on root — ensures VoiceOver uses British English pronunciation.
- **Traversal Order (CRITICAL):** Do not allow iOS to guess the reading order of absolute-positioned or grid elements. Use `accessibilityElements` arrays or `importantForAccessibility` to explicitly force VoiceOver to read from top to bottom, left to right. This is especially critical on Screen 1 (Line Selection) and Screen 3 (Permissions).
- **Focus Management:** After a sheet opens, use `AccessibilityInfo.setAccessibilityFocus(ref)` to move focus to the sheet title.

> **↑ Implementation Reference — Execution Plan: "Step 3 (Screen 1)" + "Step 5 (Screen 3)"**
> VoiceOver traversal ordering is called out in both Execution Plan Step 3 and Step 5. This section is the canonical spec. The `importantForAccessibility` prop referenced in both steps must be implemented exactly as described here. This is also an Apple App Store accessibility review requirement — failure here is a rejection risk.

---

## SECTION 11 — MONETISATION / TRIAL FLOW

### 11.0.1 Freemium Model & Usage Trial

- **Trial:** 10 qualifying commutes. UI: *"Trial — 7 commutes left."*
- **Free (forever):** Full departure data visible in-app (all slots). Zero ecosystem surfaces.
- **Pro:** Everything in Free + Dynamic Island Live Activity + Lock Screen widget + push alerts.

> **↑ Strategy Reference — Master Plan: "Monetization & The Usage-Based Trial"**
> The 10-commute trial, pricing tiers, and Pro feature set are locked decisions in the Master Plan. This section owns the UX expression of those decisions — the countdown copy, the blurred card state, and the CTA wording. Copy changes here must not alter the underlying entitlement logic (→ **Execution Plan Step 1** + **Infrastructure RevenueCat webhook**).

---

### 11.4 Post-Expiry Locked Card State

When `entitlementActive === false`:
- First departure renders normally.
- Remaining slots render as blurred pill placeholders.
- Inline CTA: *"Unlock all departures →"*. Tapping opens Subscription Sheet.

> **↑ Implementation Reference — Execution Plan: "Step 8 — Monetization & Compliance Hardening"**
> The `entitlementActive` flag consumed here is set in **Execution Plan Step 1** and synced by the RevenueCat webhook in the **Infrastructure doc**. All three layers must be in place for this locked card state to function correctly end-to-end. The Subscription Sheet opened by the CTA is `app/settings/subscription.tsx` — the same file that owns the Restore Purchases button.

---

## SECTION 17 — "THE FOYER": ONBOARDING ARCHITECTURE

### 17.2 Step 0 — Splash Screen & Font Hydration (Updated)
**File:** `app/splash.tsx`

- **Font Loading:** You MUST utilise `useFonts()` for SpaceGrotesk and `SplashScreen.preventAutoHideAsync()`. Do not let the app boot with fallback system fonts.
- **Hydration gate:** Gate the splash screen fade on the successful loading of BOTH the MMKV Zustand store AND the custom fonts.

> **↑ Implementation Reference — Execution Plan: "Step 0 — Splash Handoff & Font Loading"**
> This section and Execution Step 0 are in full alignment. The canonical implementation file is `app/splash.tsx`. The `store.hydrated` promise gate referenced in the Execution Plan is the Zustand store hydration gate referenced here. These are the same requirement described at different levels of abstraction.

---

### 17.6 Screen 3 — Permissions ("The Superpowers")

**CALENDAR PERMISSION FIRST (Apple Requirement):**
Disclosure card must explicitly state verbatim: *"We read departure times alongside your calendar — all on your device. Nothing leaves your phone."*

**NOTIFICATION PERMISSION SECOND:** Only trigger after Calendar is resolved.

> **↑ Compliance Reference — Master Plan: "Compliance & Legal (Launch Blockers)"** + **Execution Plan: "Step 5"**
> This copy is locked verbatim in three places: this section, **Execution Plan Step 5**, and the **Master Plan Compliance section**. All three must match exactly. Any copy edit requires a simultaneous update across all three documents. The calendar-first order is not a UX preference — it is an Apple requirement and a product priority (calendar access enables the Dynamic Island trigger).

---

### 17.8 Zero State — Premium Dashboard Safety Net (Updated)

Shown when `hasCompletedOnboarding === true` but `pinnedStations.length === 0`.

- **Headline:** *"Ready when you are."*
- **Body:** *"Add your first line to get started."*
- **Primary CTA:** "Add Your First Line" — white-fill button.
- **Secondary CTA:** "Explore without saving" — opens Status tab (Tab 2).

> **↑ Implementation Reference — Execution Plan: "Step 7 — Premium Zero State"**
> The copy here (*"Ready when you are. Add your first line."*) is the canonical zero state copy. The version in **Execution Plan Step 7** must match exactly. This copy was an intentional audit fix (v4.3 Conflict Resolution #5 above) — do not revert to "Your commute is a blank slate" under any circumstances.

---

## OPEN ACTION ITEMS (Post v4.5)

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | Implement loading state skeleton (100% opacity + shimmer) in `MyCommuteDashboard.tsx` | Engineering | Section 5.3 |
| 2 | Confirm WCAG 4.5:1 contrast on all glass card text tokens | Design | Section 1.1 + App Store review |
| 3 | Add `accessibilityLanguage="en-GB"` to root component | Engineering | Section 10.1 |
