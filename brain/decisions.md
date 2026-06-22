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
* **Layout Height Gating:** LineCards and StationCards are locked to a strict height of **68px** to preserve screen real estate and scroll bounds.

---

## 4. Monetization & Subscriptions

* **Usage Model:** Enforces a usage-based trial (e.g. 10 commutes) monitored at cold start via AppState listeners.
* **App Store Readiness:** A visible "Restore Purchases" and hosted Legal Agreement links must be present inside settings to ensure App Store approval.
