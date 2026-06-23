# Strategic Decisions

This document captures the immutable constraints and structural design decisions locked down for the My Commute application.

---

## 1. Hardware and Target Environment

* **Physical Target:** Development runs **strictly on a physical iPhone device**, *never* on iOS simulators or Xcode.
* **Build Engine:** Cloud-based Expo Application Services (EAS CLI) handles compilation and signing.
* **APNS Support:** Push token tests rely on active APNS channels, which are unavailable on standard simulators.

---

## 2. Onboarding Flow

* **Compact Structure:** The setup is capped at exactly **2 screens** (Step 1: Lines selection, Step 2: Station search and pinning).
* **Permission Deferral:** Location, Notification, and Calendar prompt screens are bypassed during onboarding. They trigger contextually on the dashboard to lower friction and comply with native rules.
* **No Bypass on Step 1:** The user must select at least one line before proceeding to Step 2. Station selection may be bypassed.

---

## 3. UI/UX Style Constraints

* **Theme Overlay:** The foyer (onboarding) uses Option C gradients. The dashboard uses dynamic gradients matching the worst active disruption status (Suspended/Severe -> Red, Minor -> Amber, Good -> Deep Space).
* **Glassmorphism Tokens:** Dashboard card components apply frosted glass styling (`BlurView` intensity 45 or 80) paired with translucent borders (`rgba(255, 255, 255, 0.18)`).
* **Layout Height Gating:** Standard onboarding modules are sized for optimal breathing room: `LineCard` scales dynamically between 40px and 48px, while `StationCard` has a 74px minHeight.
* **Modal Configuration (iOS Blur Preservation):** Modals that require frosted glass overlays must never use `pageSheet` style, which overrides blurs with solid system colors. They must use `presentationStyle="overFullScreen"`, `transparent={true}`, and `animationType="slide"`.
* **Standard Touch Target Specifications:**
  * **Section Add (+) Buttons:** Styled as `28x28` circular hitboxes (`borderRadius: 14`), background `rgba(255, 255, 255, 0.12)`, border `rgba(255, 255, 255, 0.30)` with `borderWidth: 1`, and a centered white `Ionicons` `add` icon (size 16).
  * **Edit/Done Pills:** Capsule shape (`borderRadius: 16`), background `rgba(255, 255, 255, 0.12)`, border `rgba(255, 255, 255, 0.30)` (`borderWidth: 1`), text `rgba(255, 255, 255, 0.80)`, and dynamic padding (`paddingHorizontal: 14`, `paddingVertical: 6`).
* **Environment Safeguards:** Debug controls like "Reset Onboarding (Debug)" are strictly gated behind `__DEV__` to keep them hidden from production end-users.

---

## 4. Monetization & Subscriptions

* **Usage Model:** Enforces a usage-based trial (e.g. 10 commutes) monitored at cold start via AppState listeners.
* **App Store Readiness:** A visible "Restore Purchases" and hosted Legal Agreement links must be present inside settings to ensure App Store approval.

---

## 5. Serverless Backend Resilience

* **Optional Dependencies:** Heavy libraries like `aioapns` (which require C-extensions for cryptography/ssl) are imported dynamically via `try...except ImportError` so the server can run without compilation failures on Vercel.
* **Database Cold Starts:** MongoDB client initialization must use `connect=False` and tight 5-second timeouts (`serverSelectionTimeoutMS=5000`) at the module level to prevent cold start connection hangs from timing out the Vercel function.

---

## 6. Reanimated & UI Thread Safety

* **Ref Mutation thread safety:** React Refs (`useRef`) and React State (`useState`) cannot be safely mutated directly inside Reanimated UI thread worklets (like `withTiming` callbacks). All such operations must be wrapped in JS helper functions and executed on the JS thread using `runOnJS`.
