# Agent Instructions & Project Design Specifications

This document captures the locked UI specs, architectural conventions, reference implementations, and platform gotchas for the **My Commute** React Native application.

AI agents (including Fable and Antigravity) must read this file before writing or modifying any components to ensure alignment on the first pass.

---

## 0. HARD RULE — Single-Source Modules (locked 2026-07-31)

> No component may compute permission state, severity color, or line-filtered arrivals independently. All three MUST route through `permissionOrchestrator.ts`, `getSeverityColor.ts`, `getVisibleArrivals` selector respectively. Any PR introducing a second implementation of any of these three is rejected on sight — this is the exact bug class we just spent a week fixing.

- `store/permissionOrchestrator.ts` — THE permission state machine. Nothing calls `Location.requestForegroundPermissionsAsync()`, `requestBackgroundPermissionsAsync()`, or any OS permission API directly. Everything routes through `requestPermission(key, trigger)`.
- `utils/getSeverityColor.ts` — THE status→color mapping (single source, TfL statusSeverity code → 3-tier good/minor/severe). `LINE_IDENTITY_COLORS` (line chips/bars) and severity colors (status dots) are two separate token systems — never merged.
- `selectors/stationLines.ts` — THE `getVisibleArrivals(allArrivals, userSelectedLines)` selector. Every station card imports this; no component computes its own line filter.

## 1. Visual & UI Design System

### Frosted Glassmorphism (Level 1 & 2)

* **Background texture**: Cards and panels utilize `BlurView` with `intensity={45}` and `tint="dark"` overlayed with a translucent white background (e.g., `rgba(255, 255, 255, 0.06)`).
* **Modals & Overlays (Level 3)**: Use a darker glass overlay: `BlurView` with `intensity={80}` and `tint="dark"`.
* **Translucent Borders**: Standard cards and panels must use a hairline border: `borderWidth: StyleSheet.hairlineWidth`, `borderColor: 'rgba(255, 255, 255, 0.18)'`.

### Interactive Buttons & Touch Targets

* **Standard Edit/Done Pills**:
  * Background: `rgba(255, 255, 255, 0.12)`
  * Border: `rgba(255, 255, 255, 0.30)` (borderWidth: 1)
  * Text: `rgba(255, 255, 255, 0.80)`
  * Border Radius: `16`
  * Padding: Horizontal `14`, Vertical `6` (or `16` and `7` for primary buttons). Avoid fixed heights.
* **Section Add (`+`) Buttons**:
  * Shape: 28x28 circular hitboxes (`width: 28`, `height: 28`, `borderRadius: 14`).
  * Background: `rgba(255, 255, 255, 0.12)`
  * Border: `rgba(255, 255, 255, 0.30)` (borderWidth: 1)
  * Icon (`+`): Color `#FFFFFF` (full white), centered.
* **Primary CTAs**:
  * Shape: Capsule shape (e.g., `borderRadius: 26`, `height: 52`).
  * Background: Solid white/translucent white.
  * Text: Color `#07103a` (navy) for active, or translucent when disabled.

---

## 2. Animation & Navigation Conventions

### Modals & Bottom Sheets

* **iOS Blur View Preservation**: iOS native `presentationStyle="pageSheet"` overrides local `BlurView` overlays with a solid system color. To preserve glassmorphism, modals must be configured with:
  * `presentationStyle="overFullScreen"`
  * `transparent={true}`
* **Transition**: Use `animationType="slide"`.
* **Visual Anchors**: Include a drag handle wrap at the top of bottom sheets:
  * Handle: `width: 40`, `height: 4`, `borderRadius: 2`, `backgroundColor: 'rgba(255, 255, 255, 0.25)'`.

### Press Animations

* Every interactive button/card must use the custom hook `usePressAnimation(configKey, disabled)`.
* **Haptics & Audio Feedback**:
  * Selecting/Adding: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` + `playSound('select', 0.45)`.
  * Deselecting/Removing: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` + `playSound('deselect', 0.35)`.
  * Errors/Limits: `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)` + `playSound('error')`.

---

## 3. Reference Implementations

### Line Subscription & TfL Status Mapping

* **Locked reference file**: [components/ManageLinesModal.tsx](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/components/ManageLinesModal.tsx).
* **TfL Severity Mapping** — canonical table used by ALL files:
  * `10`, `18`, `14` → `good` (Good Service / Special Service / Information).
  * `9`, `7` → `minor` (Minor Delays / Reduced Service).
  * `6` → `severe` (Severe Delays).
  * `5`, `4`, `3`, `0`, `11`, `8`, `16`, `17`, `19`, `1`, `2`, `20` → `suspended` (Suspended / Part/Planned/Whole Closure / Bus Service / Not Running).
* **Overground Branch Aggregation**:
  * London Overground operates on multiple sub-branches: `liberty`, `lioness`, `mildmay`, `suffragette`, `weaver`, and `windrush`.
  * The status for `'overground'` must be aggregated across all active branches, resolving to the **worst status severity** (lowest severity number) among them.

### Station Selection & Fuzzy Match Search

* **Locked reference file**: [components/ManageStationsModal.tsx](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/components/ManageStationsModal.tsx).
* **Fuzzy Matching Options (Fuse.js)**:
  * Keys: `['name']`
  * Threshold: `0.2`
  * Minimum Match Char Length: `4`
  * Search Distance: `60`
* **Station Deduplication**:
  * Always group `FULL_STATIONS` from `data/tflStations` by lowercase cleaned names (`station.name.toLowerCase().trim()`) to deduplicate platforms and branches before search.

### Immediate Sync State

* Dashboard preferences must update **immediately on tap** (writing directly to `useUserPreferencesStore`), eliminating "Save" buttons in bottom sheets.

---

## 4. Known Gotchas & Platform Quirks

* **iOS Blur Backgrounds**: Modals that require frosted glass overlays must never use `pageSheet` style.
* **TfL Stop IDs**: Elizabeth Line arrivals route differently because NaPTAN IDs starting with `910G` represent National Rail interchange points. Use the backend fallback endpoint `/api/stations/...` rather than querying National Rail endpoints directly.
* **Layout Shifts**: Ensure lists rendering high numbers of `StationCard` items (74px minHeight) use `FlatList` with `initialNumToRender` and `windowSize` optimization to prevent performance lag on older devices.

### Known Issue: Tier2Cache multi-line station collision

```text
KNOWN ISSUE: Tier2Cache is keyed by stationId only (last write wins).
Stations served by multiple lines (Victoria + DLR at Stratford, etc.)
will have cache collisions — whichever line's grab ran last overwrites
the previous. The lineId guard in resolveRerouteMode prevents false-
positive reroutes from this collision, but the underlying cache shape
needs a per-line key (stationId:lineId) before multi-line stations
get full reroute coverage. Not a demo-blocker. Fix before public launch.
```

---

## 5. Session Memory & Brain Documentation

* **Brain Folder Authority**: A dedicated `brain` folder at the root level `brain/` (relative to project root) maintains the project memory files (`architecture.md`, `decisions.md`, `memory.md`, and `patterns.md`).
* **Update Protocol**: Agents must check and read these files at the beginning of each session and update them at the end of execution to keep all design parameters, decisions, and patterns fully synchronized.
