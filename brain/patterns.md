# Development Patterns

This document captures standard patterns, structures, and idioms used within the My Commute codebase.

---

## 1. Native Animation Patterns (Reanimated v3)

* **UI-Thread Gating:** All shimmering card placeholder animations and layout transformations must run strictly on the native UI thread.
* **Reduced Motion Support:** Always check accessibility preference constraints via `useReducedMotion()`. If active, snap animations immediately:

  ```typescript
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) {
      animationValue.value = targetValue;
      return;
    }
    animationValue.value = withTiming(targetValue, { duration: 300 });
  }, [reducedMotion]);
  ```

* **Sinusoidal Floats (Editing mode):** Keep wiggle effects soft using low-frequency sin timing to prevent rendering jitter.

---

## 2. Fuzzy Matching & Deduplication (Fuse.js)

* **Search Threshold:** Configured globally at `0.2` with a `distance: 60` and `minMatchCharLength: 4` to match stations in under 10ms.
* **Deduplication:** Always filter `FULL_STATIONS` using lowercase keys `station.name.toLowerCase().trim()` to group platforms and branches prior to indexing or searching.

---

## 3. Storage & Immediate Sync States

* **No Save Buttons:** Bottom sheets and settings modify `useUserPreferencesStore` values *immediately* on interactive action (taps, switches, or picks).
* **MMKV Access:** Read and write values directly using synchronous helpers without async-await wrappers to eliminate UI layout lag.

---

## 4. Platform Gating

* **iOS Glassmorphic Preserves:** iOS Modals requiring glassmorphism overlays must use `presentationStyle="overFullScreen"`, `transparent={true}`, and `animationType="slide"`.
* **Network Check Guards:** Wrap background schedulers and requests in connectivity checks (`NetInfo`) to fallback gracefully to cached profiles.
* **Proximity & Location Geofencing:** Always request location permissions sequentially: foreground permission must be requested and approved (`status === 'granted'`) before background permission is requested. Pinned stations are mapped to geofencing regions (identifier as station ID, 500m radius) using latitude and longitude coordinates matched locally from `data/stationCoordinates.json`.
* **Press Event Animation Routing:** All interactive buttons or touch target items route gestures through the custom `usePressAnimation` hook to coordinate haptics and spring animations. For gesture handlers (like `TapGestureHandler`), map touch states (`State.BEGAN`, `State.ACTIVE`, `State.FAILED`, `State.CANCELLED`) to `pressAnim.onPressIn()` / `pressAnim.onPressOut()`.

---

## 5. Promise-Based Native Bridge Communication

* **Error Visibility & Propagation:** Expose standard Promise interfaces (`RCTPromiseResolveBlock` / `RCTPromiseRejectBlock` in Objective-C/Swift) for native modules bridging with external resources or Shared App Groups (`UserDefaults`). This allows the JS/TS layer to await operations and implement robust error logs, preventing silent updating or cache failures.
