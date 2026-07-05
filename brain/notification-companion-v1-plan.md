# Dynamic Island + Companion — v1 Implementation Plan

## Current State

| Component | Status | Location |
|---|---|---|
| Widget (Home + Lock Screen) | ✅ **Done** (722 lines, WidgetKit, color-coded, TfL fetch, App Group, cache fallback, adaptive refresh) | `ios/CommuteWidget/CommuteWidget.swift` |
| Native Module Bridge | ✅ **Done** (reloadWidget, saveWidgetStatusCache) | `ios/MyCommute/WidgetModule.swift` |
| App Group | ✅ **Done** (`group.com.mycommute.app`) | `ios/CommuteWidget/CommuteWidget.entitlements` |
| Dynamic Island | ❌ **Needs build** | — |
| Geofencing | ❌ **Needs build** | — |
| Push Notifications | ❌ **Needs build** | — |
| Pattern Detection | ❌ **Needs build** | — |
| AI Briefing (in-app) | ❌ **Needs build** | — |

## Architecture — How The Pieces Connect

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   React Native App (JS)                         │
│                                                 │
│   ┌──────────────┐  ┌───────────────────┐       │
│   │ Pattern      │  │ Geofence Manager  │       │
│   │ Detection    │  │ (expo-location)   │       │
│   │ (pure math)  │  │                   │       │
│   └──────┬───────┘  └────────┬──────────┘       │
│          │                   │                   │
│          ▼                   ▼                   │
│   ┌──────────────────────────────────────────────┐
│   │        Native Module Bridge Layer             │
│   │                                               │
│   │  WidgetModule (exists)  → WidgetKit reload    │
│   │  LiveActivityModule     → ActivityKit start/  │
│   │    (new)                   update/end         │
│   └──────────────────────────────────────────────┘
│                        │
└────────────────────────┼─────────────────────────┘
                         │ (App Group bridge + ActivityKit push token)
                         ▼
┌─────────────────────────────────────────────────┐
│           iOS Native Layer                       │
│                                                  │
│  ┌────────────────┐   ┌──────────────────────┐   │
│  │ WidgetKit       │   │ ActivityKit          │   │
│  │ (CommuteWidget) │   │ (CommuteLiveActivity)│   │
│  │ ✅ Done         │   │ ❌ Needs build       │   │
│  │                 │   │                      │   │
│  │- Home/Lock scr. │   │- Dynamic Island      │   │
│  │- TfL fetch      │   │- Lock Screen banner  │   │
│  │- Timeline update│   │- Compact: dest + min │   │
│  │- Cache fallback │   │- Minimal: X min      │   │
│  │- Color-coded UI │   │- Expanded: details   │   │
│  └────────────────┘   └──────────────────────┘   │
│                                                  │
│  ┌────────────────┐   ┌──────────────────────┐   │
│  │ Background      │   │ Push Notifications   │   │
│  │ Location Tasks  │   │ (Expo or native)     │   │
│  │ (expo-location) │   │                      │   │
│  │ ❌ Needs build  │   │ ❌ Needs build       │   │
│  └────────────────┘   └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Dynamic Island — Live Activity (ActivityKit)

**New file:** `ios/CommuteWidget/CommuteLiveActivity.swift`

**What it displays:**

| State | Compact Leading | Compact Trailing | Minimal |
|---|---|---|---|
| Active commute (station→work) | `Brixton` | `28 min` | `28 min` + train icon |
| Active commute (work→home) | `Finsbury Park` | `34 min` | `34 min` + train icon |
| Idle (not commuting) | Next commute hint | `Tomorrow 8:15` | Clock icon |

**Implementation:**

```
┌──────────────────────────────────────────┐
│ ActivityAttributes struct                │
│ - destinationStation: String             │
│ - destinationLine: String (for color)    │
│ - estimatedArrival: Date                 │
│ - commutePhase: enum (active/idle)       │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ ActivityContentState struct              │
│ - nextTrainMinutes: Int                  │
│ - currentStatus: String                  │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ SwiftUI View                             │
│ - DynamicIsland { … }                    │
│ - LockScreenLiveActivity { … }           │
└──────────────────────────────────────────┘
```

**Technical requirements:**
- ActivityKit requires iOS 16.1+
- Live Activity runs in the **same Widget Extension target** as the widget
- Registration: `Info.plist` needs `NSExtensionFileProviderSupportsLiveActivities`
- App needs `Push Notification` capability for push-to-update (optional for v1)

**Refresh model (v1):** Timer-based countdown (no push-to-update needed)
- App starts Live Activity with destination + absolute arrival date
- Live Activity renders a `TimerView(publishDate:)` that automatically counts down
- No periodic API calls needed from the Live Activity itself
- When user crosses work/home geofence → app ends the Live Activity

---

### 2. Native Module Bridge — LiveActivityModule

**New file:** `ios/MyCommute/LiveActivityModule.swift`

**Bridge API:**

```typescript
// From JS (React Native)
NativeModules.LiveActivityModule.startCommuteActivity({
  destinationStation: 'Brixton',
  destinationLine: 'victoria',       // for color
  estimatedArrival: '2026-07-04T09:28:00Z',  // ISO string
  nextTrainMinutes: 2
})

NativeModules.LiveActivityModule.updateCommuteActivity({
  nextTrainMinutes: 5
})

NativeModules.LiveActivityModule.endCommuteActivity()
```

**What it does:**
- `startCommuteActivity(data)` → requests ActivityKit authorization → creates/pushes Live Activity with attributes + state
- `updateCommuteActivity(state)` → updates the Live Activity with new state
- `endCommuteActivity()` → ends the Live Activity (dismisses Dynamic Island)
- `isActivityActive()` → returns whether a Live Activity is currently running

---

### 3. Geofencing Infrastructure

**New JS module:** `services/GeofenceService.ts`

**Geofence regions (per user pattern):**

| Region | Trigger | Size | Action |
|---|---|---|---|
| 🏠 Home | User leaves home | ~200m radius | Start departure context |
| 🚉 Station | User enters station zone | ~100m radius | Call TfL API → start Live Activity |
| 🏢 Work | User enters work zone | ~200m radius | End Live Activity → Send arrival push |

**expo-location setup needed:**
- Install `expo-location`
- Request `LOCATION_FOREGROUND` (for app open) + `LOCATION_BACKGROUND` (for geofence triggers)
- Register background task for geofence events
- Define geofence regions based on pattern-detected stations

**Edge cases to handle:**
- WFH day / sick day → no geofences active (detected by time-of-day + day-of-week pattern)
- Weekend → different geofence schedule or inactive
- Multiple stations on same line → user may pass through intermediate stations, only trigger at their usual station
- Geofence calibration → station entrances vary, may need radius tuning

---

### 4. Push Notifications

**Two types of push:**

| Type | Trigger | Content | Frequency |
|---|---|---|---|
| ✅ Arrival check-in | Work/home geofence entry | "You alright? Made it in 31 min." | 1 per arrival |
| ⚠️ Disruption alert | TfL status change on saved line | "[Line]: [Status]. Expect delays." | Max 2/day, commute hours only |

**Implementation:**
- Expo Push Notifications for delivery
- Disruption: poll TfL API on Vercel cron + push when status changes for user's saved lines
- Arrival: local notification triggered by geofence (no server needed)

**Guardrails (crucial):**
- Disruption notifications only during commute hours (7am-8pm)
- Max 2 disruption notifications per day
- Never push the same disruption twice
- Arrival push only fires if geofence entry detected (not on app launch)

---

### 5. AI Briefing (In-App)

**Not a notification.** Appears when user opens the app.

**Time variants:**

| Time | Content |
|---|---|
| 🌅 Morning | "Morning. Victoria: smooth. Your 28 min looks good." |
| ☀️ Afternoon | "Afternoon. Piccadilly has minor delays. FYI." |
| 🌆 Evening | "Northern: good. Last train 23:15. Don't get stranded." |
| 🌙 Late | "Night mode. Tomorrow's commute looks normal." |

**Implementation:**
- Briefing API endpoint on Vercel → cheap LLM call (stateless)
- Input: `{timeOfDay, savedLines, lineStatuses, homeStation, workStation, numCommutes}`
- Output: One sentence string
- No storage. No user data retention.

---

### 6. Pattern Detection (Pure Math)

**Already decided — no AI. Frequency counter by time bucket.**

- MMKV stores departure times by day-of-week
- After 5 commutes → detect most common departure station, time window, and destination
- Suggestion card: "I notice you leave from [station]. Watch this route?" → [Yes] / [Wrong station] / [Dismiss]

---

## v1 Scope Call

| Feature | Priority | Effort | Timeline Risk |
|---|---|---|---|
| Pattern detection | 🔴 P0 | 1 day | Low |
| Dynamic Island (station→destination + ETA) | 🔴 P0 | 2 days | Medium (new ActivityKit) |
| Geofence setup (home + station + work) | 🔴 P0 | 1 day | Low |
| Arrival push notification | 🔴 P0 | ½ day | Low |
| AI Briefing in-app | 🟡 P0 | 1 day | Low |
| Disruption push alerts | 🟠 P1 | 1 day | Medium (infra needed) |
| Widget (already done) | ✅ | 0 | None |
| Event advisories ("parade in central") | ⚪ P2 | 2 days (editorial) | **High — cut for v1** |
| Full companion chit-chat beyond arrival | ⚪ P2 | Varies | **Cut — iterative on data** |

---

## Implementation Order (Dependency Chain)

```
Step 1: Pattern Detection (no dependencies)
  → establishes home/work stations

Step 2: Geofencing (depends on step 1)
  → set regions for home, station, work

Step 3: LiveActivityModule + CommuteLiveActivity (no deps on steps 1-2, can parallel)
  → build & test in isolation first

Step 4: Wire geofence → Dynamic Island (depends on 2 + 3)
  → station geofence fires → call TfL API → start Live Activity
  → work geofence fires → end Live Activity → send arrival push

Step 5: Arrival push notification (depends on step 2)

Step 6: AI Briefing screen (no deps, parallel with everything)

Step 7: Disruption push alerts (can parallel, lower priority)
```

**Critical path:** Pattern Detection → Geofencing → Live Activity wiring

**Parallel work available:**
- LiveActivityModule development (Step 3) can happen independently
- AI Briefing (Step 6) is fully independent
- Widget already done, no dependencies

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| 🟢 Dynamic Island not supported (< iOS 16.1) | Low (iPhone 14 Pro+ are recent) | Conditionally show nothing. Feature is bonus, not core. |
| 🟡 Background location rejected by user | Medium (~40% decline rate) | Graceful fallback: no geofence = no Dynamic Island. App still works. Explain value in permission prompt. |
| 🟢 TfL API rate limiting from Live Activity | Low | Timer-based countdown avoids API calls from Live Activity itself. Fetch only when geofence triggers. |
| 🟡 Dynamic Island countdown drifts from real train time | Medium | Acceptable — app shows `2 min` at station entry, countdown is approximate. User knows it's a best-effort snapshot. |

---

## Total v1 Build Estimate

| Component | Effort | Parallelizable |
|---|---|---|
| Pattern Detection | 1 day | No (blocking) |
| Geofencing | 1 day | No (blocking) |
| LiveActivityModule + CommuteLiveActivity | 1.5 days | ✅ Yes, with mock data |
| Wire geofence → Dynamic Island | 0.5 day | No (waiting on above) |
| Arrival push | 0.5 day | ✅ Yes |
| AI Briefing (API + in-app) | 1 day | ✅ Yes |
| Disruption push | 1 day | ✅ Yes (lower priority) |

**Total: ~4-5 days** (can be tighter if parallelizing)
**July 8 EIC deadline:** Achievable if we start now.
