# Architecture

This document describes the high-level architecture of the **My Commute** React Native application.

---

## 1. High-Level Overview

My Commute consists of a mobile frontend and a backend API server:
*   **Frontend:** React Native / Expo (Bare Workflow) targeting physical iOS devices.
*   **Backend:** Python 3.12 (FastAPI) server running on Vercel with MongoDB (Motor).

```
                      +-------------------+
                      |   Mobile Client   |
                      |  (React Native)   |
                      +---+-----------+---+
                          |           |
             REST API &   |           | APNS Push
             Departures   v           | Notifications
                      +---+-----------+---+
                      |   Vercel API  |<--+
                      |   (FastAPI)   |   |
                      +-------+-------+   | TfL Live Feed
                              |           |
                              v           |
                      +-------+-------+   |
                      |    MongoDB    |   |
                      |   (Database)  |---+
                      +---------------+
```

---

## 2. Frontend Structure

### Router and Navigation (Expo Router)
*   **Onboarding:** A 2-screen setup flow:
    1.  `app/onboarding/lines.tsx` (Tube line selection)
    2.  `app/onboarding/stations.tsx` (Station pinning using Fuse.js search)
*   **Dashboard Stack:** Main dashboard is a tabbed routing container:
    *   `app/(tabs)/index.tsx` -> renders `components/MyCommuteDashboard.tsx`
    *   `app/journeyPlanner.tsx` (Alerts & disruptions detail)
    *   `app/settings.tsx` (Preferences, debug controls, and subscriptions)

### Components & Interactive Elements
*   **In-Place Status Portal:** Renders live TfL status and delays dynamically inside [LineCard.tsx](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/components/LineCard.tsx) using in-place layout measurements and Reanimated spring transitions, bypassing the bottom-sheet status modal.
*   **Gestures & Haptics:** Touch controls utilize `usePressAnimation` for haptics feedback, and long-press controls trigger cards to jiggle (edit mode) or morph (status portal).

### State Management & Storage
*   **Zustand Store:** Custom hooks access shared preferences instantly via `store/userPreferencesStore.ts`.
*   **MMKV Storage:** A fast, synchronous, C++ based Key-Value engine wrapper (`react-native-mmkv`) persists store states.

### Background Tasks & Scheduling
*   **Services Module:** Background fetch, local schedule alerts, and geofencing.
    *   `services/calendarScheduler.ts` matches local calendars against Tube stations to schedule leave-by warnings.
    *   `services/backgroundTask.ts` executes background fetch checks, TfL polling, and runs the `'geofencing-task'` to register background regions (500m radius mapped via `data/stationCoordinates.json`) for proximity alerts.
    *   `services/notificationRegistrationService.ts` registers APNS device push tokens securely with the backend.

---

## 3. Backend Structure

*   **Journey Planner API:** `/api/journey-planner` handles routing calculations.
*   **Line Status API:** `/api/lines` aggregates status updates across all London Underground branches.
*   **Station Arrivals API:** `/api/stations/<id>` feeds real-time departures.
*   **Push Notifications (APNS):** Direct APNS communication handles background alerts without Firebase intervention.
