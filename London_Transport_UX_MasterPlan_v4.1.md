# London Transport Dashboard — Master UX & UI Plan v4.1
## "Fractal Glass — Ambient Status Refraction" — Complete Specification
### Includes: Dynamic Gradient Architecture, useWorstStatus Hook, Traffic-Light Ambient System, Onboarding Gradient Logic

---

## CONFLICT RESOLUTIONS (v3 → v4.1)

| # | Change | Resolution |
|---|--------|------------|
| 1 | Static dark background → Dynamic ambient gradient | **Resolved: GradientBackground component. Two-layer cross-fade. expo-linear-gradient.** |
| 2 | Dark blur tint (`UIBlurEffectStyle.dark`) → Light tint | **Resolved: All expo-blur uses `tint="light"` intensity 20-35. Dark tint absorbs gradient — forbidden.** |
| 3 | Card bg rgba(255,255,255,0.07) → 0.15, border 0.10 → 0.40 | **Resolved: Brighter glass on lighter background. Crisp 0.5px white borders define glass edges.** |
| 4 | No text contrast system → Dual-mode text tokens | **Resolved: text-primary (white) for top 65%, text-primary-on-light (near-black) for bottom 35%. Cards always white.** |
| 5 | Ambient colour: arbitrary blue → Traffic-light model | **Resolved: Green = Good, Amber = Minor, Red = Severe, Dark Red = Suspended. Universal. Non-negotiable.** |
| 6 | Status source: TfL API only → Worst of TfL + community | **Resolved: useWorstStatus hook. Community ≥3 reports upgrades TfL 'good' → 'minor'.** |
| 7 | Live API call in onboarding → No new API calls | **Resolved: VoidBackground reads existing Zustand status store only. Never triggers a fetch.** |
| 8 | Gradient animation via withTiming on color string → Cross-fade | **Resolved: Two stacked LinearGradient layers. Animate top layer opacity 0→1 over 800ms.** |
| 9 | Film grain on dashboard → Foyer only | **Resolved: Film grain stays in VoidBackground (Foyer). Removed from GradientBackground (Interior).** |
| 10 | expo-linear-gradient not in dependencies | **Resolved: Added to Section 18 dependency table.** |

---



The following conflicts between the base plan and the onboarding plan have been resolved:

| # | Conflict | Resolution |
|---|----------|------------|
| 1 | Station max: 4 (onboarding) vs 5 (master) | **Resolved: Max 5 stations everywhere** — consistent with max 5 lines |
| 2 | Store: MMKV+Zustand vs AsyncStorage | **Resolved: MMKV + Zustand** — synchronous, faster, avoids hydration lag on splash |
| 3 | Font: SpaceGrotesk (onboarding) vs SF Pro (app) | **Resolved: Intentional split** — SpaceGrotesk for onboarding "Foyer" only, SF Pro from dashboard onward. Transition at Grand Reveal. |
| 4 | Audio cue — no A11y handling | **Resolved: Respects both silent mode AND reduce motion. VoiceOver announcement added.** |

---

## SECTION 0 — DESIGN PHILOSOPHY

This app is a **premium, native iOS transport companion built on a single core thesis: passive intelligence**. The user should understand the state of their commute before they read a single word. The benchmark is not "good for a transport app" — it is "indistinguishable from a first-party Apple experience."

**The Ambient Status Refraction system:**
The root background of the app interior is never a static colour. It is a living `expo-linear-gradient` that shifts based on the worst-affected status of the user's selected lines — derived from the `useWorstStatus` hook (see Section 2.4). The gradient uses a **universal traffic-light model**: green for good, amber for minor delays, red for severe/suspended. No reading required. The user opens the app and their body understands the situation before their eyes process text.

**Two visual environments, one product:**
- **"The Foyer" (Onboarding):** Solid `#0A0A0F` + film grain. SpaceGrotesk. High-contrast, cinematic, brand-defining. The gradient is a *preview* of the dashboard's ambient system — it reacts to selected lines using already-fetched status data (no new API calls). Defaults to Good Service (green) on first cold launch.
- **"Fractal Glass" (App interior):** `GradientBackground` component (dynamic traffic-light gradient) + `expo-blur` glass cards (`tint="light"`). SF Pro. The Grand Reveal transition is the deliberate handoff between these two worlds.
- The Grand Reveal gains power from this split: stark `#0A0A0F` → luminous ambient gradient. If all lines are running, the dashboard blooms green. If the Jubilee is suspended, it erupts red. The user knows immediately.

**Text contrast is non-negotiable.** All gradient screens carry both `text-primary` (white, for dark top portion) and `text-primary-on-light` (near-black, for pale bottom portion). Cards use `text-primary` internally regardless of position — they have their own glass background. See Section 1.1.

---

## SECTION 1 — DESIGN SYSTEM: FRACTAL GLASS (COMPLETE)

### 1.1 Token System

All values are design tokens. No hardcoded hex, no hardcoded numbers anywhere in component code.

**Background tokens (Ambient Status Refraction — traffic-light model):**

The root background is NEVER a static colour. It is the `GradientBackground` component (see Section 2.4). The gradient top colour shifts based on `useWorstStatus()` output. Bottom colour is always `#F0F4FF` (pale ice — provides refractive base for glass cards).

| Status | Top colour | Top hex | Bottom hex | When used |
|--------|-----------|---------|-----------|-----------|
| `status-good` | Deep Forest | `#0A2E1A` | `#F0FFF4` | All selected lines: Good Service |
| `status-minor` | Deep Amber | `#7C3A00` | `#FFF8E8` | Worst line: Minor Delays |
| `status-severe` | Deep Ember | `#5C0A0A` | `#FFF0F0` | Worst line: Severe Delays |
| `status-suspended` | Void Crimson | `#3D0000` | `#FFE8E8` | Any line: Suspended / Part Closed |
| `status-unknown` | Deep Void | `#1A1A2E` | `#F0F4FF` | No data / offline / first launch |

**Traffic-light rule — no exceptions:**
- Green gradient family = Good Service. User sees green → commute is fine. Go.
- Amber gradient family = Minor Delays. User sees amber → something is off. Check.
- Red gradient family = Severe / Suspended. User sees red → they are affected. Act.
- This mirrors every traffic system, hazard sign, and status indicator the user has seen since childhood. Never deviate from this mapping.

**Card surface tokens:**
- `glass-bg-card`: `rgba(255, 255, 255, 0.15)` — frosted surface over gradient
- `glass-bg-elevated`: `rgba(255, 255, 255, 0.25)` — modals, sheets
- `glass-bg-input`: `rgba(255, 255, 255, 0.12)` — search fields
- `glass-bg-destructive`: `rgba(220, 38, 38, 0.15)` — delete zones
- `glass-bg-success`: `rgba(16, 185, 129, 0.12)` — good service card state
- `glass-bg-warning`: `rgba(245, 158, 11, 0.12)` — minor disruption card state
- `glass-bg-error`: `rgba(239, 68, 68, 0.12)` — severe disruption card state

**Border tokens:**
- `glass-border-default`: `rgba(255, 255, 255, 0.40)` — crisp 0.5px white border, defines glass edge
- `glass-border-elevated`: `rgba(255, 255, 255, 0.60)` — modals, active sheets
- `glass-border-focus`: `rgba(255, 255, 255, 0.80)` — focused inputs
- `glass-border-destructive`: `rgba(239, 68, 68, 0.40)` — delete states

**Text tokens — dual-mode (gradient screens only):**
- `text-primary`: `rgba(255, 255, 255, 0.95)` — use in top 65% of gradient screen, and always inside cards
- `text-primary-on-light`: `rgba(10, 10, 20, 0.92)` — use in bottom 35% of gradient screen (where gradient is pale)
- `text-secondary`: `rgba(255, 255, 255, 0.60)` — top 65% secondary
- `text-secondary-on-light`: `rgba(10, 10, 20, 0.55)` — bottom 35% secondary
- `text-tertiary`: `rgba(255, 255, 255, 0.35)` — hints, top 65%
- `text-disabled`: `rgba(255, 255, 255, 0.20)`
- `text-stale`: `rgba(255, 255, 255, 0.40)` — last-known stale data

**Rule:** Cards (which have their own `glass-bg-card` surface) always use `text-primary` and `text-secondary` internally — their glass background overrides the gradient context. Only uncontained elements (screen titles, floating labels, CTAs directly on the gradient) need dual-mode text tokens.

**Blur tokens:**
- `blur-card`: `tint="light"`, intensity 20 — MUST be light tint so gradient refracts through the glass
- `blur-sheet`: `tint="light"`, intensity 35
- `blur-tab`: `tint="light"`, intensity 50

**NEVER use dark tint on blur.** Dark tint absorbs the ambient gradient. The entire visual effect depends on `tint="light"` — the glass must be refracting the coloured light from behind it, not swallowing it.

### 1.2 Typography System (SF Pro — Native iOS)

Use Dynamic Type. Never hardcode font sizes. Map to Apple's semantic type roles:

| Role | SF Pro Style | Size (default) | Use Case |
|------|-------------|----------------|----------|
| `display` | SF Pro Display, Semibold | 28pt | Screen titles |
| `title1` | SF Pro Display, Semibold | 22pt | Card line names |
| `title2` | SF Pro Display, Medium | 18pt | Section headers |
| `headline` | SF Pro Text, Semibold | 16pt | Departure times |
| `body` | SF Pro Text, Regular | 16pt | Disruption text |
| `callout` | SF Pro Text, Regular | 15pt | Station names |
| `subhead` | SF Pro Text, Regular | 14pt | Secondary info |
| `caption1` | SF Pro Text, Regular | 12pt | Last-updated badges |
| `caption2` | SF Pro Text, Regular | 11pt | Tab bar labels |

**Tabular figures**: All departure countdowns and times use `.monospacedDigit()` to prevent layout shift during tick updates.

**Dynamic Type**: Wrap all text in `Text("…").dynamicTypeSize(.xSmall ... .accessibility3)`. Test at every scale. Never truncate times — they are critical data.

### 1.3 Color System — TfL Line Colors

These are the official TfL brand colors. Use them ONLY for line identity dots and line-specific card accents. Never use them as background fills for large surfaces.

| Line | Hex | Use |
|------|-----|-----|
| Bakerloo | `#B36305` | Line dot, card left border |
| Central | `#E32017` | Line dot, card left border |
| Circle | `#FFD300` | Line dot (add dark outline for contrast) |
| District | `#00782A` | Line dot, card left border |
| Elizabeth | `#6950A1` | Line dot, card left border |
| Hammersmith | `#F3A9BB` | Line dot (add dark outline) |
| Jubilee | `#A0A5A9` | Line dot, card left border |
| Metropolitan | `#9B0056` | Line dot, card left border |
| Northern | `#000000` | Line dot (add border: `glass-border-elevated`) |
| Piccadilly | `#003688` | Line dot, card left border |
| Victoria | `#0098D4` | Line dot, card left border |
| Waterloo & City | `#95CDBA` | Line dot, card left border |
| Overground | `#EE7C0E` | Line dot, card left border |

**Contrast rule**: Circle, Hammersmith, and Northern lines — always add `shadow: 0 0 0 1.5px rgba(255,255,255,0.3)` ring around the color dot for legibility on dark backgrounds.

### 1.4 Icon System

Use `@expo/vector-icons` (Ionicons set) exclusively. No emojis. No mixing icon families.

| Element | Icon | Size |
|---------|------|------|
| Train departure | `train-outline` | 16pt |
| Disruption | `alert-circle-outline` | 16pt |
| Good service | `checkmark-circle-outline` | 14pt |
| Add | `add-circle-outline` | 20pt |
| Delete badge | `remove-circle` (filled) | 22pt — red |
| Edit/Done | Native `UIBarButtonItem` text |  |
| Chevron (expand) | `chevron-down-outline` | 14pt |
| Drag handle | `reorder-three-outline` | 20pt |
| Retry | `refresh-outline` | 16pt |
| Settings | `settings-outline` | 22pt (tab bar) |
| Search | `search-outline` | 16pt |

### 1.5 Spacing System (8pt grid)

- `space-2`: 2pt — micro gaps (icon-to-text)
- `space-4`: 4pt — tight internal gaps
- `space-8`: 8pt — standard component padding
- `space-12`: 12pt — card internal padding (horizontal)
- `space-16`: 16pt — card internal padding (vertical), list gaps
- `space-20`: 20pt — section separation
- `space-24`: 24pt — major section breaks
- `space-32`: 32pt — screen-level padding tops
- `space-48`: 48pt — large white space between major sections

### 1.6 Border Radius System

- `radius-4`: 4pt — pill badges, tiny indicators
- `radius-8`: 8pt — small chips, tags
- `radius-12`: 12pt — line color dots (large)
- `radius-16`: 16pt — cards (standard)
- `radius-24`: 24pt — bottom sheets (top corners)
- `radius-full`: 9999pt — circular elements

### 1.7 Z-Index / Elevation Scale

| Layer | z-index | Elements |
|-------|---------|----------|
| `z-base` | 0 | Dashboard scroll content |
| `z-card` | 10 | Frosted glass cards |
| `z-lifted` | 20 | Dragged card (during jiggle mode) |
| `z-sticky` | 30 | Sticky header |
| `z-sheet` | 40 | Bottom sheets |
| `z-modal` | 50 | Full-screen modals |
| `z-overlay` | 60 | Toast notifications |
| `z-critical` | 100 | Haptic shield / system alerts |

### 1.8 Animation System

All animations use React Native Reanimated 3 with `withSpring` or `withTiming`. Platform: iOS only in spec (Android behavior TBD).

| Animation | Duration | Easing | Property |
|-----------|----------|--------|----------|
| Card expand | 320ms | spring (damping 18, stiffness 200) | height via LayoutAnimation |
| Sheet slide up | 380ms | ease-out | translateY |
| Sheet dismiss | 280ms | ease-in | translateY |
| Jiggle start | 140ms | spring | scale 1.04 + rotation ±1.5° |
| Card lift (drag) | 180ms | spring | scale 1.06, shadow grow |
| Card drop | 240ms | spring (damping 14) | scale 1.0, position |
| Toast appear | 200ms | ease-out | translateY + opacity |
| Toast dismiss | 160ms | ease-in | opacity |
| Skeleton shimmer | 1200ms | linear loop | background position |
| Error shake | 400ms | custom (3 oscillations) | translateX |
| Success flash | 300ms | ease-out | opacity → background |
| Chevron rotate | 220ms | ease-in-out | rotate 0° → 180° |
| Delete badge appear | 160ms | spring | scale 0 → 1 |
| Tab switch | 200ms | ease-out | opacity + scale |

**Reduced motion**: Wrap ALL animations in `if (isReduceMotionEnabled)` check via `AccessibilityInfo.isReduceMotionEnabled()`. When true, replace all spring/translate animations with instant opacity fades (80ms).

---

## SECTION 2 — ARCHITECTURE & DATA (COMPLETE)

### 2.1 Data Layer

**Persistence**: `react-native-mmkv` (synchronous, native-speed) via Zustand with MMKV persistence adapter. Eliminates async hydration lag on splash. Store file: `store/userPreferencesStore.ts`.

**State shape:**
```typescript
{
  schemaVersion: number,           // Current: 1
  hasCompletedOnboarding: boolean,
  onboardingStep: 0 | 1 | 2 | 3,  // Persists across mid-flow kills
  selectedLines: string[],         // TfL line IDs, max 5
  pinnedStations: Station[],       // Max 5
  notificationsGranted: boolean,
  trialStartDate: string | null,
}
type Station = { id: string, name: string, lines: string[], role: 'home' | 'work' | 'other' }
```

**Actions:** `completeOnboarding()`, `toggleLine(id)`, `pinStation(station, role)`, `unpinStation(id)`, `reorderLines(newOrder)`, `reorderStations(newOrder)`, `runMigrations()`.

**Migration**: On hydration, if `schemaVersion < CURRENT_VERSION`, run migration function, then update `schemaVersion`.

**API**: TfL Unified API v3. Fetch on foreground resume + 60s interval (client-side tick between fetches). Requests are parallel (`Promise.allSettled`), never serial.

**Fetch states** (per card, not global):
- `idle` — never fetched
- `loading` — first fetch in flight
- `refreshing` — subsequent fetch in flight (stale data shown)
- `success` — data fresh
- `stale` — fetch failed, showing last-known data with timestamp
- `error` — never had data, fetch failed

**Name stripping**: Remove "Underground Station", "Rail Station", "DLR Station" suffixes. Map common abbreviations: "St." → "Street", "Rd." → "Road". Strip trailing parenthetical qualifiers: "Bank (Monument)" → "Bank".

### 2.2 Client-Side Tick Timer

- Fetch live departures from TfL API every 60 seconds
- Between fetches, decrement displayed minutes client-side every 30 seconds
- When a train ticks to 0 minutes: remove it from the list with a fade-out + slide-up animation, promote next train up
- When a train ticks negative: treat as departed immediately, no negative display
- Timer pauses when app is backgrounded (`AppState.addEventListener('change')`)
- Timer resumes and triggers immediate re-fetch on foreground

### 2.3 Offline & Network States

- Detect network via `@react-native-community/netinfo`
- When offline: show a persistent banner strip below the header (`"No connection — showing last known data"`)
- Stale data threshold: if last fetch was >5 min ago, mark all cards as `stale`
- Stale cards show: muted departure times + amber dot + `"X min ago"` timestamp badge
- Full error cards (never fetched + offline): show empty error card state (see Section 5)

---

### 2.4 Ambient Status Architecture — useWorstStatus Hook + GradientBackground Component

This is the core of the Ambient Status Refraction system. One hook. One component. Four surfaces driven by the same source of truth.

#### `useWorstStatus(lines: string[]): StatusLevel`

**File:** `hooks/useWorstStatus.ts`

**Return type:** `'good' | 'minor' | 'severe' | 'suspended' | 'unknown'`

**Logic (in priority order):**
1. If `lines` is empty OR no status data has ever been fetched → return `'unknown'`
2. For each line in `lines`:
   a. Read TfL official status from the existing status data store
   b. Read community signal report count from Zustand (`communityReports[lineId]`)
   c. If community reports ≥ 3 AND TfL shows `'good'` → upgrade to `'minor'` (community overrides TfL optimism)
   d. If community reports ≥ 5 AND TfL shows `'minor'` → upgrade to `'severe'`
3. Return the **worst** status across all lines — `suspended` > `severe` > `minor` > `good` > `unknown`

**Severity ranking (ascending):** `unknown < good < minor < severe < suspended`

> **⚠️ CODEBASE-SPECIFIC — READ BEFORE TOUCHING SEVERITY LOGIC:**
> `useLineData.ts` remaps TfL's raw `status_severity` strings **before** storing them.
> The values in `lineDataStore` are `{20: suspended, 9: severe, 5: minor, 1: good}` —
> **NOT** TfL's canonical `{10: Good, 6: Severe, 5: Part Closure, 4: Planned Closure}` scale.
> `useWorstStatus.ts` is built against the **patched** values, not the TfL docs.
> **These two files are coupled. If `useLineData.ts` is ever refactored to store raw TfL
> severity values, `useWorstStatus.ts` must be updated simultaneously or the severity
> mapping will silently misclassify every line.**

**Critical rule:** This hook is the ONLY place in the codebase that determines status severity. No component derives its own status logic. No gradient, no badge, no notification computes severity independently. They all call `useWorstStatus`.

**Surfaces driven by this hook:**
| Surface | How it uses the output |
|---------|----------------------|
| `GradientBackground` | Top gradient colour |
| Dynamic Island (Live Activity) | Background tint |
| Lock Screen widget | Background tint |
| Notification badge | Dot colour |

```typescript
// hooks/useWorstStatus.ts
type StatusLevel = 'good' | 'minor' | 'severe' | 'suspended' | 'unknown'

const SEVERITY: Record<StatusLevel, number> = {
  unknown: 0, good: 1, minor: 2, severe: 3, suspended: 4
}

export function useWorstStatus(lines: string[]): StatusLevel {
  const tflStatus = useStatusStore(s => s.lineStatuses)   // existing store
  const communityReports = useStatusStore(s => s.communityReports)

  if (!lines.length || !Object.keys(tflStatus).length) return 'unknown'

  let worst: StatusLevel = 'good'

  for (const lineId of lines) {
    let status: StatusLevel = tflStatus[lineId]?.level ?? 'unknown'
    const reports = communityReports[lineId] ?? 0

    // Community signal upgrades — overrides TfL optimism
    if (reports >= 3 && status === 'good') status = 'minor'
    if (reports >= 5 && status === 'minor') status = 'severe'

    if (SEVERITY[status] > SEVERITY[worst]) worst = status
  }

  return worst
}
```

---

#### `GradientBackground` Component

**File:** `components/GradientBackground.tsx`

**Usage:** Wrap every dashboard, status, settings, and subscription screen. Never used in onboarding (those screens use `VoidBackground`).

**Implementation — two-layer cross-fade (required pattern):**

Do NOT attempt to animate the `colors` prop of `LinearGradient` directly. Reanimated `withTiming` cannot animate hex strings. Use two stacked `LinearGradient` layers and animate the **opacity** of the incoming layer.

```typescript
// components/GradientBackground.tsx
const STATUS_GRADIENTS: Record<StatusLevel, [string, string]> = {
  good:      ['#0A2E1A', '#F0FFF4'],  // Deep Forest → Pale Mint
  minor:     ['#7C3A00', '#FFF8E8'],  // Deep Amber → Warm Cream
  severe:    ['#5C0A0A', '#FFF0F0'],  // Deep Ember → Pale Rose
  suspended: ['#3D0000', '#FFE8E8'],  // Void Crimson → Blush
  unknown:   ['#1A1A2E', '#F0F4FF'],  // Deep Void → Pale Ice (default/offline)
}

export function GradientBackground({ lines }: { lines: string[] }) {
  const status = useWorstStatus(lines)
  const prevStatus = useRef<StatusLevel>('unknown')
  const crossfadeOpacity = useSharedValue(0)
  const [layers, setLayers] = useState<[StatusLevel, StatusLevel]>(['unknown', 'unknown'])

  useEffect(() => {
    if (status === prevStatus.current) return
    setLayers([prevStatus.current, status])  // [bottom/outgoing, top/incoming]
    crossfadeOpacity.value = 0
    crossfadeOpacity.value = withTiming(1, { duration: 800 }, (finished) => {
      if (finished) {
        runOnJS(setLayers)([status, status])
        crossfadeOpacity.value = 0
        runOnJS(() => { prevStatus.current = status })()
      }
    })
  }, [status])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: crossfadeOpacity.value
  }))

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Bottom layer — current/outgoing */}
      <LinearGradient
        colors={STATUS_GRADIENTS[layers[0]]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      />
      {/* Top layer — incoming, fades in */}
      <Animated.View style={[StyleSheet.absoluteFillObject, animatedStyle]}>
        <LinearGradient
          colors={STATUS_GRADIENTS[layers[1]]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        />
      </Animated.View>
    </View>
  )
}
```

**Reduce motion:** When `isReduceMotionEnabled`, skip the 800ms crossfade. Snap directly to the new gradient instantly (`crossfadeOpacity.value = 1` with duration 0). The status change is still communicated — just without the animation.

**Accessibility:** `GradientBackground` is `pointerEvents="none"` and `accessibilityElementsHidden={true}`. It is purely decorative. The status information it communicates is ALSO conveyed by text and icons on the cards — never by colour alone.

---

#### `VoidBackground` — Onboarding Gradient Logic (Updated)

**File:** `components/VoidBackground.tsx`

The Foyer uses `VoidBackground`, not `GradientBackground`. However, it now reacts to the user's line selections using the **same traffic-light colour model** to teach the ambient paradigm before the Grand Reveal.

**Logic:**
1. Default (no lines selected, or first cold launch with no status data): `#0A0A0F` solid + film grain at 2.5% opacity. Standard Foyer state.
2. When `selectedLines.length > 0` AND status data exists in the store (fetched on app launch for returning users, or pre-fetched on cold launch in the background):
   - Call `useWorstStatus(selectedLines)`
   - Apply the same traffic-light gradient using the Foyer variants below
   - Transition: same two-layer cross-fade, 600ms (slightly faster than dashboard — onboarding should feel responsive)
3. When status data does NOT yet exist (genuine first cold launch, API not yet responded): stay on `#0A0A0F` solid. Never block onboarding on a network response. Never show a loading state for the background.

**Foyer gradient variants (darker, more cinematic than dashboard):**

| Status | Top | Bottom | Note |
|--------|-----|--------|------|
| `good` | `#051A0A` | `#0A0A0F` | Almost black with deep green undertone |
| `minor` | `#2A1200` | `#0A0A0F` | Dark amber coal |
| `severe` | `#1F0000` | `#0A0A0F` | Dark red void |
| `suspended` | `#160000` | `#0A0A0F` | Near-black with blood tint |
| `unknown` | `#0A0A0F` | `#0A0A0F` | Solid black — standard Foyer |

These are significantly darker than the dashboard variants because the Foyer text (`text-primary: rgba(255,255,255,0.95)`) is always white — there is no light bottom end that creates contrast issues. The colour shift is a **mood** change, not a legibility system.

**Critical — no new API calls in onboarding:** `VoidBackground` reads exclusively from the existing Zustand status store. It never triggers a fetch. If the store is empty, it shows black. That is correct behaviour.

**The "Aha" moment:** When a user taps the Bakerloo line and the background shifts from void black to dark amber coal in 600ms, they understand intuitively what this app does. They haven't read a word. This is the passive intelligence promise delivered in the first 10 seconds of onboarding.

---

## SECTION 3 — SCREEN ARCHITECTURE (COMPLETE)

### 3.1 Screen Map

```
App Launch
  ├── [First launch] → Onboarding Flow (3 screens)
  │     ├── Welcome screen
  │     ├── Add first Line screen
  │     └── Add first Station screen → Dashboard
  └── [Returning user] → Dashboard (Tab 1)
        ├── Edit Mode (jiggle overlay)
        ├── Add Line Sheet
        ├── Add Station Sheet
        │     └── Search Results
        └── Disruption Card Expanded

Tab 2 → Status (All TfL lines live overview)
Tab 3 → Settings
      ├── Trial / Subscription
      ├── Notification Preferences
      └── About / Feedback
```

### 3.2 Safe Area Rules

Use `useSafeAreaInsets()` from `react-native-safe-area-context` everywhere. Never hardcode top/bottom insets.

- Header: `paddingTop = safeArea.top + 16`
- Bottom content (last list item): `paddingBottom = safeArea.bottom + tabBarHeight + 16`
- Tab bar: `paddingBottom = safeArea.bottom` (built into tab bar component)
- Sheets: `paddingBottom = safeArea.bottom + 16`
- Floating CTAs: `bottom = safeArea.bottom + 16`

The tab bar is 49pt tall + safe area bottom. The blurred tab bar sits above the home indicator on iPhone X/14/15 series. Never allow content to be clipped by the tab bar or Dynamic Island.

---

## SECTION 4 — ONBOARDING FLOW (NEW — COMPLETE)

### 4.1 Welcome Screen

Shown only on first launch. Full-screen dark gradient. No bottom tab bar.

**Layout:**
- London city skyline silhouette illustration (SVG, monochrome, ~200pt tall) — centered at 45% from top
- Headline (display): `"Your city.\nAlways on time."`
- Subhead (body, text-secondary): `"Live departures. Real-time disruptions.\nBuilt for Londoners."`
- Primary CTA button (frosted glass, full-width): `"Get Started"`
- Skip link below (caption1, text-tertiary): `"I'll explore on my own"`

**Haptic**: `.light` impact on CTA tap.

**Accessibility**: `accessibilityLabel` on the SVG illustration: `"London skyline silhouette"`. CTA button: `accessibilityRole="button"`, `accessibilityLabel="Get started, set up your dashboard"`.

### 4.2 Add First Line (Onboarding Step 1)

- Progress indicator: 3 dots, dot 1 filled
- Title: `"Which lines do you travel?"`
- Grid of TfL line pills (2-column grid) with line color dot + name
- Each pill: selectable, shows checkmark on selection, glow border in line color
- Max 5 lines selectable — when 5 reached, unselected pills dim to `opacity: 0.4`
- CTA: `"Continue"` — disabled until at least 1 line selected
- Skip: `"Skip for now"` — text link, text-tertiary

### 4.3 Add First Station (Onboarding Step 2)

- Progress indicator: dot 2 filled
- Title: `"Which stations do you use?"`
- Full-width search bar, auto-focused, keyboard open immediately
- Results list (see Section 7 — Search Flow for full spec)
- Max 5 stations
- CTA: `"Take me to my dashboard"`
- Skip: `"Skip for now"`

---

## SECTION 5 — GHOST STATES (NEW — COMPLETE)

### 5.1 Zero State — First Launch (Post-Onboarding Skip)

If user skips onboarding and adds nothing, the dashboard shows:

**Layout (fullscreen centered):**
- London Underground roundel illustration (frosted glass style, ~120pt) — centered
- Headline (title2): `"Nothing here yet"`
- Body (text-secondary): `"Add the lines and stations you travel most. Up to 5 of each."`
- Two equal-width CTA buttons side by side:
  - `"+ Add a Line"` (glass button, active)
  - `"+ Add a Station"` (glass button, active)
- Both buttons open their respective sheets (Section 7)

**Accessibility**: `accessibilityLabel` for the roundel: `"London Underground roundel"`. Buttons: `accessibilityRole="button"` with descriptive labels.

### 5.2 Zero State — One Section Empty

If user has Lines but no Stations (or vice versa), that section shows a compact inline empty card:

- Dashed frosted glass border card (same height as a regular card)
- Icon centered: `add-circle-outline` (text-tertiary color, 28pt)
- Caption: `"Add a station"` (text-tertiary)
- Entire card is tappable → opens Add Station sheet
- `accessibilityRole="button"`, `accessibilityLabel="Add a station, tap to get started"`

### 5.3 Loading State — Skeleton Shimmer

Shown when a card is in `loading` state (first ever fetch).

**Shimmer component spec:**
- Card shape preserved exactly (same height as loaded card)
- Background: `glass-bg-card` with `expo-blur` applied
- Shimmer: animated left-to-right gradient sweep using Reanimated `useSharedValue`
- Shimmer gradient: `transparent → rgba(255,255,255,0.06) → transparent`
- Sweep duration: 1200ms, linear loop
- Placeholder bars: 3 horizontal bars at 60%, 40%, and 80% width (staggered)
- Each bar: 10pt height, `border-radius: radius-4`, `background: rgba(255,255,255,0.08)`
- Left accent bar: 3pt wide × full card height, `rgba(255,255,255,0.12)` (line color unknown yet)

**Accessibility**: `accessibilityLabel="Loading departures"`, `accessibilityElementsHidden=false`

**Reduced motion**: Replace shimmer with static skeleton (no animation). Add subtle opacity pulse at 2s interval instead.

### 5.4 Refreshing State (Stale Data)

When a subsequent fetch is in flight AND card has previous data:

- Show existing departure times with `text-secondary` color (slightly dimmed)
- Amber dot (6pt) with `text-warning` color in top-right corner of card
- `caption2` badge: `"Updating…"` in top-right, text-tertiary

No skeleton shown — never flash the UI on routine refresh.

### 5.5 Stale State (Fetch Failed, Has Previous Data)

When the TfL API fails but card has last-known data:

- Departure times shown with `text-stale` token (40% white opacity)
- Red dot (6pt) with `text-danger` color in top-right corner
- Badge: `"Last updated X min ago"` — human-readable, e.g. "2 min ago", "4 min ago"
- Subtle red-tinted card border: `glass-border-destructive`
- Tap the badge to retry immediately
- `accessibilityLabel` for badge: `"Data may be outdated. Last updated [X] minutes ago. Tap to retry."`

### 5.6 Error State — Never Had Data

When the card has NO previous data AND the fetch failed:

- Card shows with same frosted glass shape
- Centered icon: `alert-circle-outline` (22pt, text-tertiary)
- Body text: `"Couldn't load departures"`
- Caption (text-tertiary): `"TfL may be unavailable. Tap to retry."`
- Retry button (ghost style): `"Try again"` with `refresh-outline` icon
- `accessibilityRole="button"` on the entire card
- `accessibilityLabel="Couldn't load departures for [Line Name]. Tap to retry."`

**Haptic on retry tap**: `.light` impact.

### 5.7 Partial Error — Some Cards Fail, Others Succeed

- Succeeded cards render normally
- Failed cards use Error State (5.6) or Stale State (5.5) as appropriate
- NO global error banner unless ALL cards fail simultaneously
- If ALL cards fail: show a subtle banner strip below header (`"TfL data unavailable"` + retry icon)

---

## SECTION 6 — DASHBOARD SCREEN (UPDATED — COMPLETE)

### 6.1 Header

- `paddingTop = safeArea.top + 16`
- Left: App name `"Commute"` (display style) — `accessibilityRole="header"`
- Right: Native `Edit` text button (UIKit style) — triggers Jiggle Mode
- Below Edit: Trial Pill (if in trial) — `"[N] days left"` in frosted glass pill badge
  - Amber tint when ≤ 5 days remaining
  - Red tint when ≤ 2 days remaining
  - `accessibilityLabel="[N]-day trial remaining. Tap to see subscription options."`
  - `accessibilityRole="button"` — tapping opens Subscription Sheet
- Sticky: header scrolls away slowly with a parallax coefficient of 0.4 (not fully sticky — Apple style)

### 6.2 Lines Section

- Section header: `"Lines"` (title2, text-secondary) with a `"See all"` link if >5 (not possible given limit, but defensive)
- List of Line Cards (see 6.3)
- Below last card: `"+ Add Line"` frosted button (dashed border, full-width) — hidden during Edit mode if 5 lines reached (replace with `"5/5 Lines"` disabled label)

### 6.3 Line Card

**Default state:**
- Frosted glass card (`glass-bg-card`, `blur-card`, `glass-border-default`, `radius-16`)
- Left accent: 3pt × full card height bar in TfL line color
- Line name (title2, text-primary)
- Status dot (6pt) + status text (subhead, semantic color) on the same row
- Disruption preview: 1 line of disruption text (caption1, text-secondary) — ellipsized
- Next 3 departures in a horizontal row: `"3 min"`, `"8 min"`, `"14 min"` (headline, text-primary, tabular digits)
- Destination label below each time (caption2, text-tertiary) — truncated if long

**Expanded state (tap to expand):**
- `LayoutAnimation.configureNext` spring preset
- Chevron rotates 180° (220ms ease-in-out)
- Full disruption paragraph appears below existing content
- Separator line (`glass-border-default`, 0.5pt)
- Full disruption text (body, text-secondary)
- Last checked timestamp (caption2, text-tertiary): `"Updated just now"` / `"2 min ago"`

**Card accessibility (collapsed):**
```
accessibilityLabel = "[Line Name], [status]. Next trains in [X], [Y], [Z] minutes."
accessibilityRole = "button"
accessibilityHint = "Double tap to see disruption details"
accessibilityState = { expanded: false }
```

**Card accessibility (expanded):**
```
accessibilityState = { expanded: true }
accessibilityHint = "Double tap to collapse"
```

### 6.4 Station Card

- Same frosted glass card style
- Station name (title2, text-primary)
- Platform selector (if multiple platforms): horizontal chips below name
- Next 3 departures: same row format as Line Card
- Each departure: `time + direction/destination`
- `accessibilityLabel = "[Station Name]. Next departures: [X] minutes to [Dest], [Y] minutes to [Dest]."`

### 6.5 Scroll Behavior

- `ScrollView` with `showsVerticalScrollIndicator={false}`
- Bouncing enabled (iOS default)
- Content inset at bottom: `tabBarHeight + safeArea.bottom + 16`
- No nested scroll regions

---

## SECTION 7 — SEARCH & ADD FLOW (NEW — COMPLETE)

### 7.1 Add Line Sheet

**Trigger**: Tap `"+ Add Line"` on dashboard OR in Edit mode.

**Presentation**: Bottom sheet, slides up 60% of screen height. Top corners `radius-24`. Backdrop: `rgba(0,0,0,0.5)` scrim.

**Dismiss**: Swipe down OR tap scrim. No confirmation needed (no data entered).

**Layout:**
- Drag handle pill (36×4pt, `glass-border-elevated`, centered, top of sheet)
- Title: `"Add a Line"` (title2) — left aligned
- Subtitle (text-secondary, caption1): `"Select up to 5. [N] remaining."`
- 2-column grid of line pills:
  - Each pill: TfL line color dot (16pt) + line name (callout)
  - Frosted glass pill background
  - Selected state: `glass-border-focus` + checkmark icon + subtle line-color tinted glow
  - Already-added lines: grayed out, `opacity: 0.4`, non-tappable, `"Added"` caption
  - If 5 already added: all unselected pills dim + disabled
- `"Add [N] Lines"` CTA button — disabled when 0 selected
- Safe area padding at bottom

**Haptic on selection**: `.light` selection feedback.
**Haptic on limit reached (try to tap 6th)**: `.warning` notification feedback.
**Haptic on "Add" confirm**: `.success` notification feedback.

**Accessibility:**
- `accessibilityViewIsModal={true}` on sheet container
- Each pill: `accessibilityRole="checkbox"`, `accessibilityState={checked}`, `accessibilityLabel="[Line Name] line, [added/not added]"`
- CTA: `accessibilityLabel="Add [N] selected lines to dashboard"`

**Animation on card added to dashboard**: New line card slides in from bottom with spring. All existing cards compress slightly (spring) to make room.

### 7.2 Add Station Sheet

**Trigger**: Tap `"+ Add Station"` on dashboard OR in Edit mode.

**Presentation**: Bottom sheet, slides up 90% of screen height (tall — needs search UX). Top corners `radius-24`.

**Layout:**
- Drag handle pill
- Title: `"Add a Station"`
- Search bar (auto-focused, keyboard appears immediately, no delay)
  - Placeholder: `"Search 270+ London stations"`
  - `glass-bg-input` background, `glass-border-default` border
  - `search-outline` icon left, clear `×` button right (appears when text entered)
  - `returnKeyType="search"`, `autoCorrect={false}`, `autoCapitalize="none"`
  - `accessibilityLabel="Search London stations"`, `accessibilityRole="search"`

**Search behavior:**
- Debounce: 150ms after keystroke
- Minimum: 1 character to trigger search
- Source: local JSON list of all TfL stations (bundled — no API call for search)
- Algorithm: fuzzy match (Fuse.js or similar) — handles typos: "Oxfurd" → "Oxford Circus"
- Results sorted: (1) exact prefix match first, (2) fuzzy score, (3) alphabetical
- Zone info shown for each result

**Search results list:**
- Each result row: station name (callout, text-primary) + zone info (caption1, text-secondary) + line color dots (right-aligned, max 4 dots then "+N more")
- Separator: `glass-border-default`, 0.5pt
- Selected stations: checkmark icon + `opacity: 0.5` + `"Already added"` caption — non-tappable
- Tap to select: adds to a selection pill strip at the top of the sheet (below search bar)

**Selection pill strip** (appears after 1st selection):
- Horizontal scrollable row of selected station pills
- Each pill: station name + `×` to remove
- Animated in from top (spring, 200ms) on first selection

**Empty results state:**
- Icon: magnifying glass with question mark (custom SVG, text-tertiary)
- Body: `"No stations found for '[query]'"`
- Caption: `"Try a different spelling or a nearby station name"`

**"Add [N] Stations"** CTA — fixed at bottom of sheet, above keyboard
- `accessibilityLabel="Add [N] selected stations to dashboard"`

**Haptics**: Same as 7.1 line sheet.

---

## SECTION 8 — JIGGLE MODE / EDIT MODE (UPDATED — COMPLETE)

### 8.1 Entry

Tap `"Edit"` button in header.

**Sequence:**
1. `.medium` haptic impact — signals mode change
2. Header `"Edit"` button morphs to `"Done"` (native iOS style, animated text crossfade)
3. Cards begin jiggle animation simultaneously (staggered 30ms per card)
4. Delete badges scale in from 0 (spring, `radius-full`) on top-left of each card
5. Drag handles appear on right side of each card (fade in, 200ms)
6. `"+ Add Line"` / `"+ Add Station"` buttons hide (slide down, 200ms) — edit mode is for removing/reordering

### 8.2 Jiggle Animation

Reanimated `withRepeat` + `withSequence`:
- Rotation: -1.4° → +1.4° → -1.4° (period: 300ms, loop)
- Scale: 1.0 → 1.01 → 1.0 (period: 300ms, offset 150ms from rotation)
- Random phase offset per card (±50ms) so cards don't jiggle in unison

**Reduced motion**: Replace jiggle with a subtle border glow pulse (opacity 0.6 → 1.0, 800ms loop) + no rotation.

### 8.3 Card Drag (Reorder)

Use `react-native-gesture-handler` `LongPressGestureHandler` (threshold: 250ms) OR drag handle tap to initiate drag.

**On drag lift:**
- `.heavy` haptic impact
- Card scales to 1.06
- Card elevation increases (shadow spreads — use `shadowOpacity: 0.4` as an Animated value)
- Card rises to `z-lifted` (20)
- Other cards animate to make space as drag proceeds (spring, 200ms)
- Jiggle pauses on lifted card only

**On drag drop:**
- `.light` haptic impact
- Card snaps to new position (spring, damping 14, stiffness 180)
- Scales back to 1.0
- Zustand `reorderLines()` / `reorderStations()` action called — persists via MMKV automatically
- Jiggle resumes on the card

**Accessibility alternative for drag (VoiceOver):**
Each card has custom accessibilityActions:
```
[
  { name: "moveUp", label: "Move up" },
  { name: "moveDown", label: "Move down" }
]
```
`onAccessibilityAction` handles these programmatically with `.selection` haptic.

### 8.4 Delete Badge

- Red filled circle (`remove-circle`, Ionicons, 22pt)
- Positioned: -8pt from top-left corner of card (overlaps edge)
- Hit area: 44×44pt (use `hitSlop={{ top: 11, left: 11, bottom: 11, right: 11 }}`)
- `accessibilityRole="button"`, `accessibilityLabel="Remove [Line/Station Name] from dashboard"`, `accessibilityTraits="button"`

**On delete badge tap:**
- `.warning` haptic notification
- Confirmation toast appears (see 8.5)

### 8.5 Delete Confirmation (Undo Toast)

Do NOT use a modal dialog for delete. Use an undo toast:

1. Card immediately removes from list (fade + slide up, 280ms)
2. Toast appears at top of screen (below header, above content):
   - Text: `"[Line/Station Name] removed"`
   - Undo button: `"Undo"` (teal colored, callout)
   - Auto-dismisses after 4 seconds with a progress indicator (thin line at bottom of toast depleting)
3. If `"Undo"` tapped:
   - `.light` haptic
   - Card slides back in at original position (spring)
   - Toast dismisses immediately

**Toast accessibility**: `accessibilityLiveRegion="polite"` on toast container. Undo button: `accessibilityRole="button"`, `accessibilityLabel="Undo removal of [Line/Station Name]"`.

### 8.6 Limit State

5/5 reached for either section:
- Add button area shows `"5/5 Lines (max)"` text in text-tertiary, non-tappable
- `accessibilityLabel="Maximum 5 lines added"`
- If user somehow taps (shouldn't be possible): `.error` haptic + subtle shake animation on the limit label

### 8.7 Edit Mode Exit

Tap `"Done"`:
- `.light` haptic
- Delete badges scale out (spring, 120ms)
- Jiggle stops (cards spring back to 0° rotation, 0ms delay)
- Drag handles fade out
- `"+ Add"` buttons slide back in
- Header button morphs back to `"Edit"`

---

## SECTION 9 — HAPTICS SYSTEM (NEW — COMPLETE)

Complete `expo-haptics` specification. Import: `import * as Haptics from 'expo-haptics'`.

| Trigger | Function | Style |
|---------|----------|-------|
| Enter Edit mode | `notificationAsync` | `NotificationFeedbackType.Warning` |
| Exit Edit mode (Done) | `impactAsync` | `ImpactFeedbackStyle.Light` |
| Card drag lift | `impactAsync` | `ImpactFeedbackStyle.Heavy` |
| Card drag drop | `impactAsync` | `ImpactFeedbackStyle.Light` |
| Delete badge tap | `notificationAsync` | `NotificationFeedbackType.Warning` |
| Undo tap | `impactAsync` | `ImpactFeedbackStyle.Light` |
| Add line/station success | `notificationAsync` | `NotificationFeedbackType.Success` |
| Limit reached (5/5 attempt) | `notificationAsync` | `NotificationFeedbackType.Error` |
| API retry tap | `impactAsync` | `ImpactFeedbackStyle.Light` |
| API error (all cards fail) | `notificationAsync` | `NotificationFeedbackType.Error` |
| Onboarding CTA | `impactAsync` | `ImpactFeedbackStyle.Light` |
| Line pill select (Add sheet) | `selectionAsync` | — |
| Station result select (search) | `selectionAsync` | — |
| Tab switch | `selectionAsync` | — |
| Subscription success | `notificationAsync` | `NotificationFeedbackType.Success` |

**Rules:**
- Never haptic on scroll events
- Never haptic on passive data refresh
- Never haptic more than once per user gesture
- Check `Haptics.isAvailableAsync()` on app launch; disable haptics if unavailable (older devices, simulator)

---

## SECTION 10 — ACCESSIBILITY (VoiceOver) — COMPLETE

### 10.1 Screen Reader Support (Full Spec)

**Global rules:**
- `accessibilityLanguage="en-GB"` on root — ensures VoiceOver uses British English pronunciation
- All `expo-blur` views: set `accessible={true}` with explicit `accessibilityLabel`
- Reading order: matches visual order (top-to-bottom, left-to-right)
- After sheet opens: `AccessibilityInfo.setAccessibilityFocus(ref)` to the sheet title
- After sheet closes: return focus to the element that triggered it

**Dashboard (default state):**
```
Header: accessibilityRole="header", accessibilityLabel="Commute dashboard"
Edit button: accessibilityRole="button", accessibilityLabel="Edit dashboard"
Trial pill: accessibilityRole="button", accessibilityLabel="14-day trial, 10 days remaining. Tap for subscription options."
Lines section: accessibilityRole="header", accessibilityLabel="Your lines"
Station section: accessibilityRole="header", accessibilityLabel="Your stations"
Add Line button: accessibilityRole="button", accessibilityLabel="Add a line to your dashboard"
Add Station button: accessibilityRole="button", accessibilityLabel="Add a station to your dashboard"
```

**Line card (collapsed):**
```
accessibilityRole="button"
accessibilityLabel="Jubilee Line. Good service. Next trains: 3 minutes, 8 minutes, 14 minutes."
accessibilityHint="Double tap to see disruption details"
accessibilityState={{ expanded: false }}
```

**Line card (expanded):**
```
accessibilityState={{ expanded: true }}
accessibilityLabel="Jubilee Line. Good service. [Full disruption text]. Updated 2 minutes ago."
accessibilityHint="Double tap to collapse"
```

**Station card:**
```
accessibilityLabel="London Bridge station. Next departures: 3 minutes to Lewisham, 8 minutes to Bank, 14 minutes to Lewisham."
```

**Countdown timer:**
- Do NOT use `accessibilityLiveRegion` on the countdown — it reads every tick
- Only announce when a train departs: post an `accessibilityAnnouncement` ("Next Jubilee Line train has departed") — maximum once per departure

**Stale badge:**
```
accessibilityLabel="Data may be outdated. Last updated 4 minutes ago. Tap to retry."
accessibilityRole="button"
```

**Error card:**
```
accessibilityRole="button"
accessibilityLabel="Could not load departures for Jubilee Line. Tap to retry."
```

**Skeleton loading card:**
```
accessibilityLabel="Loading departures for Jubilee Line"
accessibilityElementsHidden=false
```

**Toast (undo):**
```
accessibilityLiveRegion="polite"
accessibilityLabel="Jubilee Line removed from dashboard."
(Undo button separately): accessibilityRole="button", accessibilityLabel="Undo removal"
```

### 10.2 VoiceOver Jiggle Mode

When Edit mode is active:
- Announce mode change: `AccessibilityInfo.announceForAccessibility("Edit mode. Cards can be reordered or removed.")`
- Delete badges:
  ```
  accessibilityRole="button"
  accessibilityLabel="Remove Jubilee Line from dashboard"
  ```
- Drag handles:
  ```
  accessibilityRole="adjustable"
  accessibilityLabel="Jubilee Line, position 2 of 4. Swipe up to move earlier, swipe down to move later."
  accessibilityActions={[{ name: "moveUp", label: "Move up" }, { name: "moveDown", label: "Move later" }]}
  ```

### 10.3 Dynamic Type Support

All text components use `.dynamicTypeSize(.xSmall ... .accessibility3)`. Test these breakpoints:
- **Default (body 17pt)**: Normal layout
- **Large (body 20pt)**: Cards taller, departure times wrap to two lines — allow this, never clip
- **Accessibility Large (body 28pt)**: Station names may wrap — use `numberOfLines={0}`, not truncation
- **Accessibility XXL (body 36pt)**: Departure row wraps to vertical stack — design adaptive layout

### 10.4 Color Independence

Status is NEVER communicated by color alone. Every status has both color AND:
- A text label (Good service / Minor delays / Severe delays / Part suspended)
- An icon (checkmark / warning / alert / stop)

---

## SECTION 11 — MONETISATION / TRIAL FLOW (NEW — COMPLETE)

### 11.0 Entitlement Layer — RevenueCat (Required)

All subscription and trial state derives from **RevenueCat** `CustomerInfo`. Do not build a homebrew entitlement system.

- Package: `react-native-purchases`
- `CustomerInfo` is fetched on app foreground and after any purchase/restore action
- Zustand store field: `entitlementActive: boolean` — synced from RevenueCat, never derived from local state
- `trialStartDate` in Zustand is local convenience only; source of truth for active entitlement is RevenueCat
- Restore purchases CTA must call `Purchases.restorePurchases()` — never skip this
- If entitlement sync fails: show last-known state and surface a banner: `"Could not verify subscription — tap to retry"`

### 11.1 Trial Model

- 14-day free trial, full feature access
- Gated after expiry: departures beyond the next 1 train per line/station (only first departure shown, rest blurred)
- Non-gated features: all visual design, basic departure info (1 per card), TfL status page

### 11.2 Trial Pill States

| Days Remaining | Color | Text |
|----------------|-------|------|
| 14–6 | `glass-bg-card` (neutral) | `"Trial — 14 days left"` |
| 5–3 | Amber tint | `"Trial — 5 days left"` |
| 2–1 | Red tint | `"Trial — 2 days left!"` |
| Expired | Red solid | `"Trial ended — Subscribe"` |

### 11.3 Subscription Sheet

Opens when Trial Pill is tapped.

**Layout:**
- Sheet: 85% height, `radius-24` top corners
- Header illustration: frosted glass roundel + star (premium symbol)
- Headline: `"Unlock full access"`
- Feature list (3 items with checkmark icons):
  - `"All departures, real-time"`
  - `"Up to 5 lines & 5 stations"`
  - `"Live disruption details"`
- Pricing: Monthly / Annual selector (segmented control, glass style)
- Price display: large (display type), subhead for per-month equivalent
- Legal microcopy (caption2, text-tertiary): auto-renewing, cancel anytime
- CTA: `"Subscribe"` (full-width, high-prominence glass button)
- Restore button: text-only, text-secondary — calls `Purchases.restorePurchases()`

### 11.4 Post-Expiry Locked Card State

**This state is critical to conversion. Undefined blurred state = revenue leak.**

When `entitlementActive === false` (confirmed via RevenueCat `CustomerInfo`):

**Per-card locked state:**
1. **First departure** renders normally — always show the next train. Never leave the card 100% dark.
2. **Remaining departure slots** (positions 2 and 3) render as blurred pill placeholders:
   - 3 grey rounded rectangles (`rgba(255,255,255,0.12)`, `radius-8`, ~64pt wide × 24pt tall)
   - Stacked in the same layout position as real departure times
   - No blur filter — use placeholder shapes only (no sensitive data to blur, just communicate locked state)
3. **Lock icon:** `lock-closed-outline` (Ionicons, 16pt, `text-tertiary`) — positioned top-right of card
4. **Inline CTA:** `"Unlock all departures →"` (caption1, `text-info`, rgba(0,152,212,0.9))
   - Tapping card body OR this CTA: opens Subscription Sheet (Section 11.3)
   - `accessibilityRole="button"`, `accessibilityLabel="[Line/Station name] — 2 more departures locked. Tap to subscribe and unlock."`
5. **Card `accessibilityLabel` (locked):** `"[Line] Line. Next train in [X] minutes. 2 more departures require a subscription."`

**Widget degraded state:**
- Home screen widget must not become a meaningless grey block
- Show: next 1 departure normally + `"Subscribe for more"` text in widget body
- Never show a completely blank or error widget for an expired user — they are still a recoverable user

### 11.5 Post-Subscription Celebration

On successful subscribe (RevenueCat purchase confirmed via `CustomerInfo`):
- Sheet closes
- `.success` notification haptic
- Trial Pill animates out (scale + fade, 300ms)
- Brief full-screen flash (rgba(16, 185, 129, 0.15), 400ms, ease-out) — success green tint
- Dashboard returns to normal — locked card placeholders replaced with real data immediately
- Small badge appears on first card briefly: `"Unlocked ✓"` (200ms appear, 1.5s hold, 200ms fade)

---

## SECTION 12 — DEEP LINKING (NEW — COMPLETE)

URL scheme: `commute://`

| Route | URL | Notes |
|-------|-----|-------|
| Dashboard | `commute://dashboard` | Default |
| Add Line sheet | `commute://add/line` | Opens sheet over dashboard |
| Add Station | `commute://add/station` | Opens sheet |
| Specific line | `commute://line/{lineId}` | Scrolls to and expands card |
| Specific station | `commute://station/{naptanId}` | Scrolls to and expands card |
| Subscription | `commute://subscribe` | Opens sub sheet |
| Status tab | `commute://status` | Switches to Tab 2 |
| Settings | `commute://settings` | Switches to Tab 3 |

Universal links: `https://getcommute.app/line/{lineId}` maps to same routes for sharing.

---

## SECTION 13 — STATUS TAB (TAB 2) (NEW — COMPLETE)

A live overview of ALL TfL lines — not just saved ones.

**Layout:**
- Full list of 13 lines (Tube + Elizabeth line + Overground)
- Each row: line color dot + line name + status badge + last updated time
- Status badges: text pill with semantic color background
- Pull-to-refresh
- No edit mode on this tab
- Tap a line row: expands inline (same LayoutAnimation as dashboard) to show full disruption

**Accessibility:**
- List: `accessibilityRole="list"`
- Each row: `accessibilityRole="listitem"`, `accessibilityLabel="[Line Name]. [Status]. [N] minutes ago."`

---

## SECTION 14 — SETTINGS TAB (TAB 3) (NEW — COMPLETE)

**Sections:**

1. **Account** — Subscription status, restore purchases
2. **Notifications** — Toggle for major disruption push alerts (per saved line)
3. **App Preferences** — Auto-refresh interval (30s / 60s / 120s)
4. **About** — Version, feedback link, privacy policy, terms
5. **Danger Zone** — `"Reset all saved lines & stations"` (red, destructive, confirmation alert before action)

All rows: native-feeling frosted glass list cells. Toggles use system `Switch` component (not custom).

---

## SECTION 15 — PERFORMANCE REQUIREMENTS

- **App launch to interactive**: < 1.0s on iPhone 12 or newer
- **API fetch timeout**: 8 seconds (show error state after)
- **Search response**: < 80ms for any query (local data, no network)
- **Card expand animation**: 60fps, no dropped frames (use `useNativeDriver: true` where possible)
- **Skeleton duration before API responds**: < 1.2s on good connection
- **List virtualization**: Use `FlatList` with `getItemLayout` for fixed-height cards — prevents jank on older devices
- **Image/asset memory**: No raster images in cards — SVG/vector only
- **Bundle size target**: < 40MB download size
- **Background refresh**: Use `expo-background-fetch` for 15-min silent refresh when app is backgrounded

---

## SECTION 16 — MASTER PROMPT (FOR AI CODE GENERATION)

Use this prompt verbatim when submitting to an AI code generator (Cursor, Claude, GitHub Copilot Workspace, etc.):

---

```
You are a Senior React Native (Expo) Engineer building a premium London transport dashboard app called "Commute."

DESIGN SYSTEM: "Fractal Glass" — Dark mode only. All surfaces use expo-blur (UIBlurEffectStyle.dark). Frosted glass cards with rgba(255,255,255,0.07) backgrounds, rgba(255,255,255,0.10) borders, radius-16. Deep base background: rgba(18,18,20,1). All values use design tokens — no hardcoded hex in components.

TYPOGRAPHY: SF Pro (native iOS). Use Dynamic Type roles: display (28pt), title1 (22pt), title2 (18pt), headline (16pt), body (16pt), callout (15pt), subhead (14pt), caption1 (12pt), caption2 (11pt). All timers use monospacedDigit() modifier to prevent layout shift.

ARCHITECTURE:
- Persistence: MMKV + Zustand (synchronous). Store: store/userPreferencesStore.ts. Keys managed by Zustand store — do NOT use AsyncStorage.
- Navigation: Expo Router with native iOS bottom tabs (3 tabs: Dashboard, Status, Settings)
- API: TfL Unified API v3. Fetch every 60s. Promise.allSettled for parallel requests. Client-side tick every 30s between fetches.
- State per card: idle | loading | refreshing | success | stale | error
- Name stripping: remove "Underground Station", "Rail Station", "DLR Station" suffixes

SCREENS TO BUILD:
1. Onboarding (3 screens — first launch only): Welcome → Add Lines → Add Stations
2. Dashboard (Tab 1): Line cards + Station cards, editable
3. Status (Tab 2): All TfL lines live status list
4. Settings (Tab 3): Account, notifications, preferences, danger zone

GHOST STATES (ALL REQUIRED):
- Zero state: London roundel illustration + "Add a Line" + "Add a Station" CTAs
- Skeleton shimmer: Reanimated shimmer sweep (1200ms loop) matching card shape, respects reduce motion
- Stale state: dimmed text + amber dot + "Last updated X min ago" badge + tap-to-retry
- Error state (no data): alert icon + "Couldn't load departures" + "Try again" button
- Partial error: per-card error states, no global error unless ALL fail

SEARCH & ADD FLOW:
- Add Line: bottom sheet (60% height), 2-column grid of TfL line pills with color dots, checkboxes, max 5
- Add Station: bottom sheet (90% height), auto-focused search bar (Fuse.js fuzzy matching, local JSON, 150ms debounce), results with zone info + line color dots, selection pill strip, undo toast on add

JIGGLE/EDIT MODE:
- Tap Edit header button → jiggle animation (±1.4° rotation + scale 1.01, random phase per card, Reanimated withRepeat)
- Red delete badge (top-left, -8pt offset, 44×44pt hit area with hitSlop)
- Drag handle (right side), LongPressGestureHandler (250ms threshold)
- On lift: .Heavy haptic + scale 1.06
- On drop: .Light haptic + spring to position
- VoiceOver drag alternative: accessibilityActions moveUp/moveDown
- Delete: immediate removal + 4s undo toast (with progress bar), .Warning haptic on badge tap
- Max 5 items: show "5/5 (max)" label, .Error haptic on attempt to add beyond limit

HAPTICS (expo-haptics — EVERY trigger listed):
- Enter edit: notificationAsync Warning
- Exit edit: impactAsync Light
- Card lift: impactAsync Heavy
- Card drop: impactAsync Light
- Delete tap: notificationAsync Warning
- Undo: impactAsync Light
- Add success: notificationAsync Success
- Limit reached: notificationAsync Error
- API retry: impactAsync Light
- ALL cards error: notificationAsync Error
- Onboarding CTA: impactAsync Light
- Line/station select: selectionAsync
- Tab switch: selectionAsync
- Subscription success: notificationAsync Success

ACCESSIBILITY (VoiceOver — ALL required):
- accessibilityLanguage="en-GB" on root
- All expo-blur views: accessible={true} + explicit accessibilityLabel
- Line card (collapsed): accessibilityRole="button", accessibilityLabel="[Line] Line. [Status]. Next trains in [X], [Y], [Z] minutes.", accessibilityState={{expanded:false}}, accessibilityHint="Double tap to see disruption details"
- Line card (expanded): accessibilityState={{expanded:true}}, updated label with full disruption text
- Drag handles: accessibilityRole="adjustable", accessibilityActions=[moveUp, moveDown]
- Delete badges: accessibilityRole="button", accessibilityLabel="Remove [name] from dashboard"
- Undo toast: accessibilityLiveRegion="polite"
- Countdown: do NOT use accessibilityLiveRegion on timer. Use AccessibilityInfo.announceForAccessibility only on departure
- Edit mode entry: AccessibilityInfo.announceForAccessibility("Edit mode. Cards can be reordered or removed.")
- accessibilityViewIsModal={true} on all sheets
- After sheet opens: setAccessibilityFocus to sheet title ref
- After sheet closes: return focus to trigger element
- Dynamic Type: all text uses dynamicTypeSize(.xSmall ... .accessibility3), numberOfLines={0} (no truncation on critical data)
- Status conveyed by color + icon + text always (never color alone)

ANIMATIONS (Reanimated 3 — all use withSpring or withTiming, transform/opacity only):
- Card expand: 320ms spring (damping 18, stiffness 200)
- Sheet up: 380ms ease-out translateY
- Sheet dismiss: 280ms ease-in translateY
- Jiggle: Reanimated withRepeat withSequence ±1.4° rotation, 300ms period
- Card lift: 180ms spring scale 1.06
- Card drop: 240ms spring damping 14
- Toast: 200ms ease-out translateY + opacity
- Skeleton: 1200ms linear loop background sweep
- Chevron: 220ms ease-in-out rotate 0°→180°
- Delete badge: 160ms spring scale 0→1
- Reduced motion: wrap all in AccessibilityInfo.isReduceMotionEnabled() check. Replace with 80ms opacity fades.

ICONS: @expo/vector-icons Ionicons set only. No emojis. Sizes: tab bar 22pt, card inline 16pt, add buttons 20pt, delete badge 22pt.

SAFE AREA: useSafeAreaInsets() everywhere. Never hardcode 44 or 34. paddingTop = safeArea.top + 16. paddingBottom for lists = safeArea.bottom + tabBarHeight + 16.

PERFORMANCE:
- FlatList with getItemLayout for fixed-height cards
- Promise.allSettled for all API calls
- Fuse.js search on bundled local JSON (no network for search)
- useNativeDriver: true on all Animated API usage
- AppState listener to pause/resume tick timer
- expo-background-fetch for 15-min silent background refresh

TFL LINE COLORS (use ONLY for dots and card left accent bars, never as large fills):
Bakerloo #B36305, Central #E32017, Circle #FFD300, District #00782A, Elizabeth #6950A1, Hammersmith #F3A9BB, Jubilee #A0A5A9, Metropolitan #9B0056, Northern #000000, Piccadilly #003688, Victoria #0098D4, Waterloo&City #95CDBA, Overground #EE7C0E.
Circle, Hammersmith, Northern: add shadow ring 0 0 0 1.5px rgba(255,255,255,0.3) for dark background legibility.

Generate modular, typed TypeScript components. Use a /tokens file for all design tokens. Use a /hooks folder for useApiData, useTick, useSafeArea, useHaptics, useReduceMotion. Export all components as named exports. Include JSDoc comments on public APIs.
```

---

*Plan version 2.0 — 100/100 complete. All ghost states, search flows, haptics, accessibility, monetisation, performance, and deep linking specified.*

---

## SECTION 17 — "THE FOYER": ONBOARDING ARCHITECTURE (NEW — COMPLETE)

### 17.0 Philosophy: The Foyer Concept

Onboarding uses a **deliberately different** visual language from the app interior:
- No expo-blur, no Fractal Glass, no frosted card surfaces
- Pure solid `#0A0A0F` backgrounds with photographic film grain texture
- SpaceGrotesk-Bold 32–34pt, letterSpacing -0.5 — assertive, brand-defining
- High contrast. Every element pops against pure black.
- The Grand Reveal transition (Section 17.6) is the deliberate crossing point from Foyer into Fractal Glass.

**Typography in Foyer only:**
- Headlines: `SpaceGrotesk-Bold` (weight 800), 32–34pt, `letterSpacing: -0.5`
- Body: `SpaceGrotesk-Regular`, 16pt
- Captions/labels: `SpaceGrotesk-Medium`, 13pt
- `allowFontScaling={true}` on all text — never disable. Clip at `maxFontSizeMultiplier={1.4}` (graceful 2-line wrap) but NEVER truncate.

**Onboarding max station cap:** 5 (consistent with app interior max).

---

### 17.1 Dependencies

Verify all installed before code generation:
- `fuse.js` — zero-latency local station search
- `expo-haptics` — all touch feedback
- `react-native-reanimated` — all animations
- `zustand` + `react-native-mmkv` — state persistence
- `@shopify/flash-list` — station list virtualization (preferred) or `FlatList` with `getItemLayout`
- `expo-audio` — Grand Reveal audio cue (SDK 51+; replaces deprecated `expo-av`)
- `expo-font` — SpaceGrotesk loading

---

### 17.2 Step 0 — Splash Screen & Store Hydration

**File:** `app/splash.tsx` (or inside `_layout.tsx` as a router guard)

**Duration:** 600ms minimum, extended until MMKV hydration is confirmed complete.

**Layout:**
- Full `#0A0A0F` background
- SpaceGrotesk wordmark centered (app name, 28pt, white)
- NO loading spinner — MMKV is synchronous, hydration is near-instant

**Hydration gate:**
```typescript
const isHydrated = useUserPreferencesStore(s => s._hasHydrated)
useEffect(() => {
  if (isHydrated) {
    // Proceed — check hasCompletedOnboarding and route accordingly
  }
}, [isHydrated])
```

**Transition:** Opacity fade (400ms, ease-in-out) from splash into Screen 1 (first launch) or Dashboard (returning user).

**Router logic:**
- `hasCompletedOnboarding === false` AND `onboardingStep === 0` → Screen 1 (Lines)
- `hasCompletedOnboarding === false` AND `onboardingStep > 0` → Resume at correct step (mid-flow kill recovery)
- `hasCompletedOnboarding === true` → Dashboard directly

---

### 17.3 VoidBackground Component

**File:** `components/VoidBackground.tsx`

Reusable background for ALL onboarding screens. Do not inline it.

```typescript
// Props: none (self-contained)
// Usage: <VoidBackground /> as absolute fill behind all content
```

**Implementation:**
- `StyleSheet.absoluteFill` container, `backgroundColor: '#0A0A0F'`, `pointerEvents: 'none'`
- Image component: `assets/grain/film-grain-200x200.png` (real photographic grain PNG, NOT generated or SVG)
  - `resizeMode: 'repeat'`
  - `style: { opacity: 0.025 }` (2.5% — between spec's 2–3%)
  - `pointerEvents: 'none'`
  - `accessibilityElementsHidden: true` (decorative)

**Asset note:** `film-grain-200x200.png` must be committed to the repo. Recommended source: real 35mm film scan. Do not synthesize with code.

---

### 17.4 Screen 1 — Line Selection ("The Hook")

**File:** `app/onboarding/lines.tsx`

**Progress indicator:** 3-dot row at top. Dot 1: white filled circle (8pt). Dots 2–3: white outline circle (8pt). `accessibilityLabel="Step 1 of 3"` on the row. `accessibilityElementsHidden=true` on individual dots.

**Back navigation:** No back button on Screen 1 (it's the entry point). System swipe-back gesture disabled.

**Layout (top to bottom):**
1. VoidBackground (absolute fill)
2. SafeAreaView `edges={['top', 'bottom']}`
3. Progress dots row — `paddingTop: safeArea.top + 16`
4. Headline: `"Which lines\ndo you travel?"` (SpaceGrotesk-Bold, 32pt, white, 2-line max)
5. Subhead: `"Pick the ones you use most."` (SpaceGrotesk-Regular, 16pt, rgba(255,255,255,0.6))
6. Line pill grid — 2 columns, gap 12pt
7. Sticky bottom bar (absolute bottom): `"Next →"` button

**Line pill spec:**
- Min height: 52pt (exceeds 44pt minimum)
- Width: fills column (half screen width minus gaps)
- Left: TfL line color dot (12pt diameter) with contrast ring on Circle/Hammersmith/Northern
- Text: line name (SpaceGrotesk-Medium, 14pt) + abbreviated code (SpaceGrotesk-Regular, 11pt, opacity 0.6) — e.g. "Jubilee / JUB"
- `allowFontScaling={true}` — abbreviated names prevent overflow at larger sizes
- `accessibilityLabel="[Full Line Name] line"` — always full name, NOT abbreviation
- Unselected: `backgroundColor: rgba(255,255,255,0.06)`, `borderColor: rgba(255,255,255,0.10)`
- Selected: `backgroundColor: rgba(255,255,255,0.12)`, `borderColor: rgba(255,255,255,0.35)`, checkmark icon (right side, 16pt)
- `accessibilityState={{ selected: isSelected }}`

**Entrance animation (Reanimated FadeInDown):**
- Each pill: `entering={FadeInDown.delay(index * 35).springify()}`
- Headline: `entering={FadeInDown.delay(0).springify()}`

**Press interactions:**
- Select: `.heavy` haptic + `scale: 0.96` spring (back to 1.0 in 200ms)
- Deselect: `.light` haptic + same scale animation

**Limit state (5/5 reached):**
- Unselected pills: `opacity: 0.35`, `pointerEvents: 'none'`
- Subtitle updates to: `"5 lines selected (maximum)"`
- If somehow tapped: `.error` haptic notification

**"Next →" button:**
- Full-width minus 32pt horizontal padding
- Height: 56pt
- `paddingBottom: safeArea.bottom + 16`
- Background: `#FFFFFF`, text: `#0A0A0F` (inverted — bold Foyer CTA style)
- Disabled when `selectedLines.length === 0`: `opacity: 0.35`, non-interactive
- `accessibilityRole="button"`, `accessibilityLabel="Continue to station selection"`, `accessibilityState={{ disabled: !hasSelection }}`
- No skip button on this screen — at least 1 line must be selected.

---

### 17.5 Screen 2 — Station Pinning ("The Refinement")

**File:** `app/onboarding/stations.tsx`

**Back navigation:** System swipe-back enabled. State preserved via Zustand (selected lines not reset).

**Progress indicator:** Dot 2 filled.

**Header micro-confirmation:**
- Selected line pills from Screen 1 animate into a compact horizontal scroll row at the top of this screen
- Each mini-pill: line color dot + abbreviated name (11pt)
- Entrance: `FadeInDown` from y+20, delay 100ms
- `accessibilityLabel="Your selected lines: [comma-separated line names]"` on the row

**Search bar:**
- Auto-focused: `autoFocus={true}` — keyboard opens immediately on mount
- Placeholder: `"Search 270+ London stations"`
- Clear button appears when text entered
- `returnKeyType="search"`, `autoCorrect={false}`, `autoCapitalize="none"`, `spellCheck={false}`
- `accessibilityRole="search"`, `accessibilityLabel="Search London stations"`
- Background: `rgba(255,255,255,0.08)`, border: `rgba(255,255,255,0.12)`, radius: 12pt

**Initial state (no query entered yet):**
- Show: `"Popular on your lines"` section header
- List of 8–10 stations filtered to the user's selected lines, sorted by ridership
- Source: bundled JSON with pre-computed "popular stations per line" arrays

**Search engine (Fuse.js):**
```typescript
const fuse = new Fuse(allStations, {
  keys: ['name', 'aliases'],
  threshold: Math.max(0.2, 0.5 - query.length * 0.05),
  includeScore: true,
  minMatchCharLength: 1,
})
```
- Debounce: 0ms (zero-latency, local data)
- `onChangeText` updates list on every keystroke
- Results sorted: (1) exact prefix → (2) fuzzy score → (3) alphabetical

**Station result row:**
- Height: 60pt (fixed, for `getItemLayout`)
- Station name (SpaceGrotesk-Medium, 15pt, white)
- Zone info (SpaceGrotesk-Regular, 12pt, rgba(255,255,255,0.5)) — e.g. "Zone 1–2"
- Line color dots right-aligned (max 4, then `+N` label)
- Already-pinned: checkmark + `opacity: 0.45` + non-tappable
- `accessibilityLabel="[Station Name], Zone [N], served by [line names]. [Added/Not added]"`
- `accessibilityRole="button"`, `accessibilityState={{ selected: isPinned }}`

**On station tap → Role selection bottom sheet:**
- Appears immediately as a bottom sheet (40% height)
- Title: `"How do you use [Station Name]?"`
- 3 large role buttons stacked: `"Home"`, `"Work"`, `"Other"`
- Each: 52pt height, full-width, SpaceGrotesk-Medium 16pt
- Selecting a role: pins the station with the role, dismisses sheet, `.success` haptic
- Sheet dismiss (swipe down): cancels — station NOT pinned
- `accessibilityViewIsModal={true}` on sheet
- `accessibilityLabel="Select how you use [Station Name]"` on title

**Zero results state:**
- Icon: search glyph with question mark (vector, white, 28pt)
- Headline: `"No matches for '[query]'"`
- Subhead: `"Popular on your lines:"`
- Shows the "popular on your lines" list below (always a fallback, never a dead end)

**Selection pill strip (after 1st pin):**
- Appears below search bar, slides in from top (FadeInDown, 200ms)
- Horizontal scrollable row of pinned station pills
- Each pill: station name + `×` remove button
- `×` removes pin, station returns to results list

**Limit state (5/5 reached):**
- Unselected results: `opacity: 0.35`
- Subtitle: `"5 stations pinned (maximum)"`

**"Continue →" button:** Same style as Screen 1's "Next →".

---

### 17.6 Screen 3 — Permissions ("The Superpowers")

**File:** `app/onboarding/permissions.tsx`

**Back navigation:** System swipe-back enabled. State preserved.

**Progress indicator:** Dot 3 filled.

**The Tease — Personalised Notification Preview:**
- Read `selectedLines` and `pinnedStations` from Zustand
- Render a realistic iOS push notification card using the user's ACTUAL lines and stations
  - e.g.: `"Jubilee Line — Severe Delays. Your 08:42 from London Bridge is affected."`
- Visual: Fractal Glass notification card style (preview of the real app UI they're unlocking)
- This is the ONLY element of Fractal Glass shown during onboarding — deliberately teasing the reward
- `accessibilityLabel="Example notification: [notification text]"`
- `accessibilityElementsHidden=true` on decorative notification chrome

**Headline:** `"Get alerts that\nmatter to you."` (SpaceGrotesk-Bold, 32pt)
**Body:** `"We'll only notify you about lines and stations you actually use."` (16pt, opacity 0.6)

---

#### STEP A — Calendar Permission (FIRST, required before notifications)

Apple requires `NSCalendarsUsageDescription`. Asking without prior in-app disclosure is a conversion killer and a potential App Store rejection risk. Show the disclosure card before triggering the OS prompt.

**Calendar disclosure card:**
- Frosted glass card (only Fractal Glass element permitted here alongside the notification preview)
- Icon: `calendar-outline` (Ionicons, 24pt, white)
- Headline: `"Your schedule, on your side."` (SpaceGrotesk-Medium, 16pt)
- Body (caption1, opacity 0.6): `"We read departure times alongside your calendar — all on your device. Nothing leaves your phone."`
- This copy must match the `NSCalendarsUsageDescription` string in your app's Info.plist exactly.
- `accessibilityLabel="Calendar access disclosure: [body copy]"`

**"Allow Calendar Access" button:**
- Same white-on-black CTA style as previous screens
- Height: 56pt, full-width minus 32pt
- `accessibilityRole="button"`, `accessibilityLabel="Allow calendar access for smarter commute planning"`
- Haptic on tap: `.light` impact
- Triggers `expo-calendar` permission prompt
- **Granted:** `.success` haptic → set `calendarGranted: true` in Zustand → advance to Step B
- **Denied:** `.error` haptic (subtle) → set `calendarGranted: false` → advance to Step B → schedule in-app banner: `"Add calendar in Settings → Privacy & Security → Calendars"` (dismissible, shown once)

---

#### STEP B — Notification Permission (SECOND, after calendar result)

**"Enable Alerts" button:**
- Same white-on-black CTA style
- Height: 56pt, full-width minus 32pt
- `accessibilityRole="button"`, `accessibilityLabel="Enable push notifications for your lines"`
- Haptic on tap: `.light` impact
- After iOS permission dialog:
  - **Granted:** `.success` notification haptic → `completeOnboarding()` → Grand Reveal
  - **Denied:** `.error` notification haptic (subtle) → still `completeOnboarding()` → Grand Reveal → schedule in-app nudge banner: `"Turn on alerts in Settings → Notifications"` (dismissible, shown once)

**"Maybe later" link:**
- `Pressable` with `minHeight: 44`, centered below main button
- Text: `"Maybe later"` (SpaceGrotesk-Regular, 14pt, rgba(255,255,255,0.5))
- Tapping: skips BOTH permission prompts → `completeOnboarding()` directly → Grand Reveal
- `accessibilityRole="button"`, `accessibilityLabel="Skip permission setup for now"`

---

### 17.7 Step 6 — The Grand Reveal (Cinematic Transition)

**File:** `app/_layout.tsx` (router guard layer)

This is the most important UX moment in the entire app. Execute it perfectly.

**Sequence:**
1. `completeOnboarding()` fires (Zustand updates, MMKV persists synchronously)
2. Full-screen overlay fades IN to pure `#000000` — 100ms, instant black
3. Route swap happens behind the black screen (no flash, no white frame)
4. **Audio cue fires** (see spec below) — simultaneously with or just after route swap
5. **Haptic:** `.medium` impact — physical "thud" to accompany audio
6. Black overlay fades OUT over 400ms, ease-out — Dashboard is revealed
7. **VoiceOver announcement:** `AccessibilityInfo.announceForAccessibility("Welcome to your dashboard")`

**Reduce motion handling:**
- If `AccessibilityInfo.isReduceMotionEnabled()` returns true:
  - Skip fade-to-black entirely
  - Skip audio cue
  - Do instant route swap
  - Only fire the haptic (`.medium` impact)
  - Still fire VoiceOver announcement

**Audio cue specification:**
- File: `assets/audio/reveal.aac`
- Format: AAC, mono, 44.1kHz
- Duration: 280–380ms
- Character: Deep, physical "thud" with brief overtone — not a chime, not a whoosh. Feels like a door opening or a page turning.
- Volume: 0.6 (not full — subtle)
- Implementation (`expo-audio` SDK 51+ API — **not** deprecated `expo-av`):
  ```typescript
  try {
    const player = useAudioPlayer(require('../assets/audio/reveal.aac'))
    player.volume = 0.6
    // expo-audio respects the iOS silent switch by default (no playsInSilentModeIOS needed)
    player.play()
    // player auto-releases when component unmounts
  } catch (e) {
    // Audio failed silently — visual transition continues unaffected
  }
  ```
- The iOS silent switch is respected automatically by `expo-audio` default session config. No explicit `playsInSilentModeIOS` call required. If user has phone on silent, no audio plays. This is correct behaviour.

---

### 17.8 Zero State — Premium Dashboard Safety Net

**File:** `components/MyCommuteDashboard.tsx` (or `screens/dashboard/ZeroState.tsx`)

Shown when `hasCompletedOnboarding === true` but `pinnedStations.length === 0 && selectedLines.length === 0`.

**Layout (centered, fullscreen):**
1. VoidBackground at `opacity: 0.10` — faint ghost (barely visible, depth only)
2. **LivingDot pulsing radar:**
   - 3 concentric circles, ghost white
   - Center dot: 8pt solid, `rgba(255,255,255,0.9)`
   - Ring 1: 32pt diameter, `rgba(255,255,255,0.3)`, scale 1.0 → 1.4, opacity 0.3 → 0 (2.0s ease-in-out loop)
   - Ring 2: 64pt diameter, same animation, delay 0.7s
   - Ring 3: 96pt diameter, same animation, delay 1.4s
   - Reduce motion: replace with static concentric rings, no animation
   - `accessibilityElementsHidden={true}` (decorative)
3. **Headline:** `"Your commute is\na blank slate."` (SpaceGrotesk-Bold, 28pt, white)
4. **Body:** `"Add the lines and stations you travel most."` (16pt, opacity 0.6)
5. **Primary CTA:** `"Add Your First Line"` — white-fill button, bouncy press animation (scale 0.97 spring)
   - `accessibilityRole="button"`, `accessibilityLabel="Add your first line to get started"`
   - Opens Add Line sheet (Section 7)
6. **Secondary CTA:** `"Explore without saving"` — ghost button (border only, no fill)
   - `accessibilityRole="button"`, `accessibilityLabel="Browse the live line map without saving anything"`
   - Opens Status tab (Tab 2) — full TfL live overview, no account needed

---

## SECTION 18 — UPDATED DEPENDENCIES LIST (COMPLETE)

Full list of all required packages across the entire app:

| Package | Purpose | Version |
|---------|---------|---------|
| `expo-linear-gradient` | GradientBackground + VoidBackground ambient status gradients | Latest |
| `react-native-purchases` | RevenueCat — subscription and entitlement layer | Latest |
| `expo-calendar` | Calendar permission request (Screen 3, Step A) | Latest |
| `expo` | Base SDK | ~50+ |
| `expo-router` | File-based routing | ~3+ |
| `expo-blur` | Fractal Glass surfaces | Latest |
| `expo-haptics` | All haptic feedback | Latest |
| `expo-audio` | Grand Reveal audio cue (SDK 51+; replaces deprecated `expo-av`) | Latest |
| `expo-font` | SpaceGrotesk (onboarding) | Latest |
| `expo-background-fetch` | 15-min background refresh | Latest |
| `react-native-reanimated` | All animations | ~3+ |
| `react-native-gesture-handler` | Drag-to-reorder, swipes | Latest |
| `react-native-safe-area-context` | `useSafeAreaInsets()` | Latest |
| `react-native-mmkv` | Synchronous persistence | ~2+ |
| `zustand` | State management | ~4+ |
| `@shopify/flash-list` | Virtualized station list | Latest |
| `@react-native-community/netinfo` | Offline detection | Latest |
| `@expo/vector-icons` | Ionicons (app interior) | Latest |
| `fuse.js` | Local fuzzy station search | ~7+ |

**Fonts to bundle:**
- `SpaceGrotesk-Regular.ttf` — onboarding body
- `SpaceGrotesk-Medium.ttf` — onboarding labels
- `SpaceGrotesk-Bold.ttf` — onboarding headlines
- SF Pro: system font, no bundling needed

**Audio assets:**
- `assets/audio/reveal.aac` — Grand Reveal cue (280–380ms, mono AAC)

**Image assets:**
- `assets/grain/film-grain-200x200.png` — VoidBackground texture (real photographic grain)

---

## SECTION 19 — UPDATED MASTER PROMPT v3.0

Use this complete prompt for AI code generation. Replaces v2 prompt from Section 16.

```
You are a Senior React Native (Expo) Engineer building a premium London transport dashboard app called "Commute." Build the COMPLETE app including onboarding.

===== VISUAL ENVIRONMENTS =====

ENVIRONMENT 1 — "THE FOYER" (Onboarding screens only):
- Background: VoidBackground component. Base: #0A0A0F solid + film-grain-200x200.png tiled at 2.5% opacity (real PNG, not SVG noise).
- DYNAMIC GRADIENT LAYER: When selectedLines.length > 0 AND TfL status data exists in Zustand store, apply the Foyer traffic-light gradient over the base using two-layer cross-fade (600ms withTiming on top layer opacity). See Section 2.4 VoidBackground spec for exact gradient hex values.
- NEVER make a new API call inside VoidBackground or any onboarding screen. Read Zustand status store only.
- If status store is empty (genuine first cold launch): remain on solid #0A0A0F. Never block onboarding on network.
- Typography: SpaceGrotesk-Bold 32-34pt letterSpacing:-0.5 for headlines. SpaceGrotesk-Regular 16pt for body.
- allowFontScaling={true} on ALL text. maxFontSizeMultiplier={1.4}.
- CTAs: white (#FFFFFF) background, #0A0A0F text — inverted, bold, brand-defining.
- NO expo-blur in onboarding. NO frosted glass. NO light-tint blurs.
- Text is always white (rgba(255,255,255,0.95)) — Foyer gradients are always dark-to-darker. No contrast issue.

ENVIRONMENT 2 — "FRACTAL GLASS" (App interior: Dashboard, Status, Settings, Subscription):
- Background: GradientBackground component (see Section 2.4). NEVER a static backgroundColor.
- Traffic-light gradient model — non-negotiable:
  - Good Service → Deep Forest (#0A2E1A) → Pale Mint (#F0FFF4)
  - Minor Delays → Deep Amber (#7C3A00) → Warm Cream (#FFF8E8)
  - Severe Delays → Deep Ember (#5C0A0A) → Pale Rose (#FFF0F0)
  - Suspended/Closed → Void Crimson (#3D0000) → Blush (#FFE8E8)
  - Unknown/Offline → Deep Void (#1A1A2E) → Pale Ice (#F0F4FF)
- Status source: useWorstStatus(selectedLines) hook ONLY. Never derive status inline. See Section 2.4.
- Gradient animation: two-layer cross-fade. Top layer opacity 0→1 over 800ms withTiming. NOT withTiming on color strings.
- Cards: expo-blur (tint="light", intensity 20) + rgba(255,255,255,0.15) bg + rgba(255,255,255,0.40) border + radius-16. TINT MUST BE LIGHT — dark tint kills the ambient effect.
- Text on gradient (uncontained): top 65% of screen uses text-primary rgba(255,255,255,0.95). Bottom 35% uses text-primary-on-light rgba(10,10,20,0.92).
- Text inside cards: always text-primary rgba(255,255,255,0.95) regardless of card position.
- Typography: SF Pro (system font), Dynamic Type, never hardcode sizes.
- All values via design tokens — no hardcoded hex in components.
- Reduce motion: skip 800ms crossfade, snap instantly to new gradient. Status change still communicated.

===== STATE MANAGEMENT =====
Store: Zustand + react-native-mmkv (synchronous persistence)
File: store/userPreferencesStore.ts
State:
  schemaVersion: number (current: 1)
  hasCompletedOnboarding: boolean
  onboardingStep: 0 | 1 | 2 | 3
  selectedLines: string[] (max 5)
  pinnedStations: Station[] (max 5) — type Station = { id, name, lines, role: 'home'|'work'|'other' }
  notificationsGranted: boolean
  calendarGranted: boolean
  entitlementActive: boolean (synced from RevenueCat CustomerInfo — never derive from local state)
  trialStartDate: string | null
Actions: completeOnboarding(), toggleLine(id), pinStation(station,role), unpinStation(id), reorderLines(order), reorderStations(order), runMigrations()
Migration: check schemaVersion on hydration, run migrations if outdated

===== ONBOARDING FLOW (4 steps) =====

STEP 0 — Splash (app/splash.tsx):
- 600ms, SpaceGrotesk wordmark on #0A0A0F
- Wait for MMKV hydration (_hasHydrated flag)
- Route: hasCompletedOnboarding=false → Screen 1, =true → Dashboard
- Mid-flow kill recovery: resume at onboardingStep (0→Screen1, 1→Screen2, 2→Screen3)

STEP 1 — Line Selection (app/onboarding/lines.tsx):
- VoidBackground component (absolute fill, #0A0A0F + grain PNG 2.5% opacity)
- 3-dot progress indicator at top (dot 1 filled), accessibilityLabel="Step 1 of 3"
- Headline: "Which lines do you travel?" (2-line max)
- 2-column grid of TfL line pills, min-height 52pt
- Each pill: line color dot (contrast ring on Circle/Hammersmith/Northern) + name + abbreviated code
- allowFontScaling={true} on all pill text. accessibilityLabel uses FULL line name always.
- accessibilityState={{ selected: isSelected }} on each pill
- Entrance: FadeInDown.delay(index * 35).springify() per pill
- Select: .heavy haptic + scale 0.96 spring. Deselect: .light haptic
- Limit (5/5): unselected pills opacity 0.35 + pointer-events none + .error haptic if tapped
- "Next →" button: white-fill, 56pt height, paddingBottom: insets.bottom+16
- Disabled (0 selected): opacity 0.35. No skip button on this screen.
- Back swipe: DISABLED on Screen 1

STEP 2 — Station Search (app/onboarding/stations.tsx):
- Same VoidBackground
- 3-dot progress (dot 2 filled)
- Header: selected line mini-pills animate in (FadeInDown, delay 100ms)
- Search bar: autoFocus={true}, autoCorrect={false}, autoCapitalize="none", accessibilityRole="search"
- Initial state (no query): show "Popular on your lines" from bundled JSON
- Fuse.js: threshold: Math.max(0.2, 0.5 - query.length * 0.05). Zero debounce (local data).
- FlashList (or FlatList with getItemLayout). Row fixed height: 60pt.
- Each row: station name + zone + line color dots (max 4 + "+N"). accessibilityLabel includes zone and lines.
- On station tap: bottom sheet appears (40% height) — "How do you use [Station]?" — 3 role buttons: Home / Work / Other
  - Role selected: pinStation(station, role), .success haptic, sheet dismisses
  - Sheet swipe down: cancel — station NOT pinned
  - accessibilityViewIsModal={true} on sheet
- Zero results: "No matches for '[query]'" + "Popular on your lines:" fallback below
- Selection pill strip (after 1st pin): horizontal scroll row below search bar, FadeInDown 200ms
- Limit (5/5): unselected opacity 0.35
- "Continue →" button: same as Screen 1's Next button
- Back swipe: ENABLED, Zustand state preserved

STEP 3 — Permissions (app/onboarding/permissions.tsx):
- 3-dot progress (dot 3 filled)
- Read selectedLines + pinnedStations from Zustand
- Personalised notification card preview using user's actual lines/stations (Fractal Glass style — teaser)
  - accessibilityLabel="Example notification: [notification text]"
- Headline: "Get alerts that matter to you."
- CALENDAR PERMISSION FIRST (required before notifications):
  - Disclosure card: icon + "Your schedule, on your side." + body copy matching NSCalendarsUsageDescription Info.plist string (on-device only, nothing leaves phone)
  - "Allow Calendar Access" button: .light haptic → expo-calendar permission prompt
    - Granted: .success haptic, set calendarGranted: true, advance to notification step
    - Denied: .error haptic (subtle), set calendarGranted: false, advance to notification step, schedule in-app banner
- NOTIFICATION PERMISSION SECOND:
  - "Enable Alerts" button: .light haptic on tap, then iOS permission dialog
    - Granted: .success haptic → completeOnboarding() → Grand Reveal
    - Denied: .error haptic (subtle) → still completeOnboarding() → Grand Reveal → schedule in-app nudge
- "Maybe later" Pressable: minHeight 44, skips BOTH prompts → completeOnboarding() → Grand Reveal
- Back swipe: ENABLED

STEP 4 — Grand Reveal (app/_layout.tsx router guard):
- completeOnboarding() fires (MMKV persists synchronously)
- Full-screen #000000 overlay fades IN — 100ms
- Route swap happens behind black screen
- GradientBackground is already rendering with the correct status colour behind the black overlay
- Audio cue: use expo-audio (NOT deprecated expo-av). useAudioPlayer hook, volume 0.6, wrap in try/catch, silent mode respected by default
- Haptic: .medium impact simultaneously with audio
- Black overlay fades OUT — 400ms ease-out — Dashboard revealed in its ambient status colour
- If all lines Good Service: luminous green gradient blooms. If Jubilee suspended: deep red erupts. The user knows before reading a word.
- VoiceOver: AccessibilityInfo.announceForAccessibility("Welcome to your dashboard")
- REDUCE MOTION: skip fade-to-black + skip audio + instant route swap + only fire haptic + still announce

===== DASHBOARD (TAB 1) — FRACTAL GLASS =====

ZERO STATE (no saved lines or stations):
- GradientBackground with status-unknown (Deep Void → Pale Ice) — calm, premium, waiting
- LivingDot pulsing radar: center 8pt dot + 3 concentric rings (32/64/96pt), opacity 1→0 scale 1→1.4, 2s ease-in-out loop, staggered 0.7s each, accessibilityElementsHidden=true
- Reduce motion: static rings only
- Headline: "Your commute is a blank slate."
- Primary CTA: "Add Your First Line" (white-fill, bouncy spring press)
- Secondary CTA: "Explore without saving" (ghost button → opens Status tab)

CARDS (Fractal Glass):
- expo-blur (tint="light", intensity 20) + rgba(255,255,255,0.15) bg + rgba(255,255,255,0.40) border + radius-16
- tint MUST be "light" — dark tint absorbs the ambient gradient. Light tint refracts it.
- Left accent: 3pt × full height bar in TfL line color (rendered as a subtle glow/tint, NOT a solid saturated bar)
- 3 departure times in monospaced digits
- Expand/collapse: LayoutAnimation spring, chevron rotates 180°
- accessibilityRole="button", accessibilityState={{ expanded }}, accessibilityLabel includes line + status + next trains

JIGGLE/EDIT MODE:
- Header "Edit" → "Done"
- Jiggle: ±1.4° Reanimated withRepeat, random phase per card
- Drag lift: .heavy haptic + scale 1.06. Drop: .light haptic + spring
- Delete badge: red remove-circle 22pt, hitSlop 11pt all sides, .warning haptic
- Undo toast: 4s auto-dismiss with progress bar, .light haptic on Undo tap
- VoiceOver: accessibilityActions=[moveUp, moveDown] on drag handles
- Reduce motion: border glow pulse instead of rotation

===== HAPTICS (expo-haptics — EVERY trigger) =====
- Enter edit: notificationAsync Warning
- Exit edit: impactAsync Light
- Card drag lift: impactAsync Heavy
- Card drag drop: impactAsync Light
- Delete badge: notificationAsync Warning
- Undo: impactAsync Light
- Add success: notificationAsync Success
- Limit reached: notificationAsync Error
- API retry: impactAsync Light
- All cards error: notificationAsync Error
- Onboarding Next/Continue: impactAsync Light
- Line pill select: selectionAsync
- Station row select: selectionAsync
- Role selection confirm: notificationAsync Success
- Tab switch: selectionAsync
- Grand Reveal: impactAsync Medium
- Permission granted: notificationAsync Success
- Permission denied (soft): notificationAsync Error
- Subscription success: notificationAsync Success
- Check Haptics.isAvailableAsync() on launch; skip if unavailable

===== ACCESSIBILITY (VoiceOver — ALL required) =====
- accessibilityLanguage="en-GB" on root
- All expo-blur views: accessible={true} + explicit accessibilityLabel
- Line cards: see Section 10.1 full spec
- Jiggle mode: announceForAccessibility("Edit mode. Cards can be reordered or removed.")
- VoidBackground grain image: accessibilityElementsHidden=true
- LivingDot radar: accessibilityElementsHidden=true
- Progress dots: row has accessibilityLabel="Step N of 3", dots hidden
- Role selection sheet: accessibilityViewIsModal=true
- Grand Reveal: announceForAccessibility("Welcome to your dashboard")
- Countdown timers: NO accessibilityLiveRegion. Only announce on departure event.
- Dynamic Type: all text dynamicTypeSize(.xSmall ... .accessibility3), numberOfLines={0} on critical data
- Status conveyed by color + icon + text (never color alone)

===== ICONS =====
@expo/vector-icons Ionicons only (app interior). No emojis. SpaceGrotesk for onboarding labels.
Foyer uses text labels rather than icons for CTAs.

===== SAFE AREA =====
useSafeAreaInsets() everywhere. Never hardcode 44 or 34.
SafeAreaView edges={['top','bottom']} on ALL onboarding screens.
Sticky bottom bars: paddingBottom = insets.bottom + 16.

===== PERFORMANCE =====
- FlashList for station search results (or FlatList with getItemLayout, fixed 60pt row height)
- Fuse.js: instantiated once on component mount, not on every keystroke
- Promise.allSettled for all TfL API calls
- useNativeDriver: true on all Animated API
- MMKV synchronous read on app launch — no async wait
- AppState listener: pause/resume tick timer on background/foreground
- expo-background-fetch: 15-min silent background refresh

Generate modular TypeScript. /tokens for design tokens. /hooks for useApiData, useTick, useSafeArea, useHaptics, useReduceMotion, useOnboarding. Export named. JSDoc on public APIs.
```
