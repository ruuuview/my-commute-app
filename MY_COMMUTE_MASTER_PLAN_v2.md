# My Commute
## Master Plan v2.1
### Full Strategic, Product, GTM, Technical, Fundraising, and Founder Blueprint
### v2.1 — Fully Synchronized with UX, Execution, and Infrastructure Specs v4.5

---

> **Document Hierarchy Notice**
> This is the **strategic authority document**. It owns all *decisions* — the why, the what, and the non-negotiables. Every detail across all other documents traces back to a section here. When a decision changes, it changes here first. All linked documents inherit the update.
>
> **Linked Documents (full suite):**
> - Implementation authority: `MY_COMMUTE_EXECUTION_PLAN_v4.5.md`
> - UX/UI authority: `MY_COMMUTE_UX_PLAN_v4.5.md`
> - Infrastructure authority: `MY_COMMUTE_INFRASTRUCTURE_v4.5.md`
>
> **Sync Protocol:** Any change to a locked decision in this document must trigger a simultaneous audit of all three linked documents. Each section's bridge callout below identifies which documents and sections are affected.

---

## What This Document Is
This is the single consolidated plan for **My Commute**. It serves as the canonical operating blueprint, answering what the product is, how it operates, how it makes money, and how it scales from a consumer utility into a B2B intelligence layer.

---

## Core Thesis
My Commute is a commuter intelligence and commuter experience product.
* **Consumer Level:** It helps riders make better decisions before and during their journey, reducing timing anxiety.
* **Institutional Level:** It measures how transport friction affects attendance, punctuality, stress, and student experience.

The wedge is **London student commuters**. The long-term ambition is to build a high-frequency commuter utility, turn usage into a defensible data layer, and sell actionable insight to universities and institutions.

---

## What Is Locked (The Non-Negotiables)
These decisions are fixed. Do not trade launch momentum for theoretical stack improvement.

### 1. Product Direction & Scope
* **Target:** 1.4M+ daily high-speed rail commuters.
* **Data Scope (The Heavy Commuter Core):** Strictly supported modes are `tube, elizabeth-line, overground, dlr` (24 Lines, 471 Stations).
* **Excluded Modes:** Trams, Buses, River Services, Cable Cars. Keep the app premium, lightning-fast, and focused purely on high-stakes heavy transit.

> **→ Execution Bridge**
> This scope decision directly constrains **Execution Step 4** (Screen 2 — Station Pinning). The Fuse.js search index must be scoped to exactly 471 stations across the 4 supported modes. Any station dataset expansion must be approved here first, before the search threshold formula in Step 4 is recalibrated.

---

### 2. The Final Locked Stack
* **Frontend:** React Native, Expo (Bare Workflow required for Live Activities), Expo Router.
* **UI Engine:** Antigravity interaction physics, "Fractal Glass" ambient refraction (including premium sinusoidal jiggles and synchronous reduced-motion animations via Reanimated 3), and the "Void" onboarding visual language.
* **Backend:** Python serverless functions on Vercel Pro.
* **Database:** MongoDB Atlas (M0 moving to M10, with Singleton connection pooling).
* **Monetization:** RevenueCat (Entitlements, Webhooks, Apple IAP abstraction).
* **Observability:** Sentry for mobile crash reporting (with strict daily rate limits to protect quotas).

> **→ Execution Bridge**
> Stack decisions map to **Execution Step 1** (MMKV/Zustand store), **Step 6** (routing and transition), and **Step 8** (RevenueCat subscription screen). The dependency checklist in **Execution Step 0 / Section 2** is the operational expression of this locked stack. No new dependencies enter the project without first being added here.
>
> **→ Infrastructure Bridge**
> The full service registry in `MY_COMMUTE_INFRASTRUCTURE_v4.5.md` is the cost and quota expression of this stack. Vercel, MongoDB Atlas, RevenueCat, Sentry, and EAS Build each map to a stack item. Any new service added to the Infrastructure doc must appear in this locked stack list first.
>
> **→ UX Bridge**
> The "Fractal Glass" and "Void" UI engine referenced here is fully specified in `MY_COMMUTE_UX_PLAN_v4.5.md §0 — Design Philosophy`. The design token system in UX Plan §1.1 is the implementation contract for these visual decisions.

---

### 3. The Solo-Founder Operating Philosophy
* **Own the product. Rent the plumbing.** Buy complexity wherever possible.
* **Asynchronous Background Agents:** Utilize **Jules** for autonomous background tasks, dependency management, and automated code health (`react-doctor`, `antigravity-awesome-skills`).
* **Vibe Design:** Utilize **Stitch** for UI translation and rapid visual prototyping within the Antigravity IDE.

> **→ Execution Bridge**
> This philosophy governs *how* each Execution Step is resourced. Steps involving boilerplate UI (Steps 2, 3, 5) are primary candidates for Stitch delegation. Steps involving dependency audits and store logic (Steps 1, 8) are primary candidates for Jules. Human decision-making is reserved for architecture pivots and any step that alters a locked decision above.

---

## The Zero-Open Lifecycle (Dynamic Island)
The app relies on a strict Live Activity lifecycle to protect battery and deliver hyper-relevant timing without opening the app:
* **The Start Trigger:** The Dynamic Island automatically activates **15 minutes before** the calculated "leave-by" time for a calendar event, OR when the user breaches a background geofence near their pinned origin station.
* **The Active State:** It silently pulses real-time, down-to-the-minute arrival times strictly for the user's pinned lines at their selected origin station.
* **The Stop Trigger:** The Live Activity automatically terminates the moment the user reaches their destination geofence, or exactly **15 minutes after** the linked calendar event has started.

> **→ Execution Bridge**
> The calendar trigger depends on `calendarGranted` state wired in **Execution Step 5** (Screen 3 — Permissions). The geofence origin depends on `pinnedStations` schema wired in **Execution Step 1**. The Live Activity implementation itself is post-launch scope and does not appear in v4.5 of the Execution Plan — it must be added as Step 10 in the next Execution Plan revision.

---

## Offline & Stale-Data Architecture (The Tube Reality)
Users on the Tube will lose signal. The app cannot behave like this is an edge case.
* **Rule 1:** Never go visually dead or blank if cached information exists.
* **Rule 2:** Maintain designed cards and gradients even in stale mode.
* **Rule 3:** Show a clear, human-readable last-updated timestamp (e.g., "Updated 4 min ago") with an amber warning dot or pulsing status text. Explain uncertainty honestly.

> **→ Execution Bridge**
> These rules govern the behaviour of `MyCommuteDashboard.tsx` specified in **Execution Step 7** and fully wired in **Execution Step 9**. The `hasContent` zero-state logic was extended with a stale-data status state that consumes `staleState` and `staleMinutes` from `useTflPoller` to pulse beautiful amber status text without replacing the active commuter cards.
>
> **→ Infrastructure Bridge**
> The server-side expression of these rules is the `stale-while-revalidate` TfL API caching layer in `MY_COMMUTE_INFRASTRUCTURE_v4.5.md §2`. The client-side status text is fed by network availability, HTTP server failures, and fetch timeouts (8000ms) within `useTflPoller`. Both layers must be in place for offline behaviour to be complete.
>
> **→ UX Bridge**
> The three ghost states (zero, loading, stale) are fully specified in `MY_COMMUTE_UX_PLAN_v4.5.md §5.3`. The stale state has been fully implemented in components and hooks.

---

## Monetization & The Usage-Based Trial
We are not using a lazy, time-based SaaS metric. We are using a value-driven metric.
* **The Trial:** A strictly usage-based **10-Commute Trial**.
* **Entitlement Logic:** RevenueCat tracks usage limits via webhooks, displaying a visible countdown UI (e.g., `7 Commutes Left`).
* **Locked State:** When the trial expires, the first departure remains visible (Free tier), while subsequent departures blur out with an "Unlock all departures" CTA.
* **Pricing:** £4.99/mo, **£34.99/yr (Primary CTA)**, £19.99/yr (First 500 Founding Members), £4.99/yr (UNiDAYS Student verification).

> **→ Execution Bridge**
> `entitlementActive` in the Zustand store (**Execution Step 1**) is the runtime expression of this monetization decision. The cold-start `Purchases.getCustomerInfo()` AppState listener is mandatory — not optional — because trial expiry can occur while the app is backgrounded. The "Restore Purchases" button in **Execution Step 8** is a direct App Store compliance requirement of this monetization model.
>
> **→ Infrastructure Bridge**
> The RevenueCat service entry in `MY_COMMUTE_INFRASTRUCTURE_v4.5.md §1` governs the free tier threshold ($2,500 MTR) and the webhook requirement. The webhook (`/api/revenuecat-webhook.py`) is the backend mechanism that keeps `entitlementActive` accurate server-side. The Stripe ruling in the Infrastructure doc is a permanent architectural constraint of this monetization model.
>
> **→ UX Bridge**
> The trial countdown copy (*"Trial — 7 commutes left"*) and the locked card blur state are specified in `MY_COMMUTE_UX_PLAN_v4.5.md §11`. Those UX states are the user-facing expression of this monetization decision.

---

## Compliance & Legal (Launch Blockers)
* **Calendar Permissions:** Must be explicitly disclosed *before* the OS prompt. Copy must state: "We read departure times alongside your calendar — all on your device. Nothing leaves your phone."
* **Required Docs:** Privacy Policy and Terms of Service must be hosted at `getmycommute.app/legal` prior to App Store submission.
* **Restore Purchases:** A visible button calling `Purchases.restorePurchases()` is mandatory on the paywall.

> **→ Execution Bridge**
> All three compliance items have direct Execution Plan owners: calendar disclosure copy lives in **Step 5**, legal links live in **Step 8**, and Restore Purchases lives in **Step 8**. These are not design decisions — they are App Store review hard-blocks. They must be completed before any TestFlight submission. Mark them as P0 in sprint planning.

---

## The Institutional Wedge (B2B Strategy)
Do not hire a traditional enterprise closer immediately. Run 30 days of founder-led discovery first.
1. **The Hook:** A free "Campus Transit Impact Report" detailing route concentration and likely effects on attendance and stress.
2. **The Pilot:** A £0, 90-day pilot for university administration, providing dashboard access and a founder-delivered monthly report.
3. **Data & Privacy Architecture (Mandatory pre-B2B):** B2B data must rely strictly on aggregated cohorts. User-level data stays on-device. Establish minimum cohort sizes for reporting and noise-addition to ensure GDPR compliance before scaling institutional sales.

> **→ Execution Bridge**
> The B2B layer has **zero dependencies in v4.5 of the Execution Plan** — it is deliberately post-launch scope. However, the `pinnedStations` and `selectedLines` schema defined in **Execution Step 1** must be architected to support anonymous cohort aggregation from day one. Do not store PII in these fields. Flag this constraint to the engineering agent before Step 1 is closed.

---

## Accelerator & Narrative Strategy
The strongest founder story is not "I am a genius engineer." It is:
> *I lived the problem. I became obsessed with it. I taught myself enough to build the first version and ship a real product. Now I need to scale the company properly.*
 
* **EF (Entrepreneur First):** Position as a domain-obsessed founder with a shipped product seeking a deep technical partner to scale.
* **Antler:** Position as a product-first founder with strong execution, real narrative, and an emerging B2B wedge.
* **The Film Advantage:** Leverage the film background to produce unparalleled product videos, App Store previews, and emotionally sharp build-in-public content.

> **→ Execution Bridge**
> The App Store preview video and ASO metadata referenced in the **Launch Execution Sequence** are the primary deliverables that activate this narrative advantage. The cinematic transition in **Execution Step 6**, premium zero state in **Execution Step 7**, and the polished slim line pills in **Execution Step 9** are the highest-leverage moments for preview video storytelling. Prioritise these for screen-recording once stable.

---

## Launch Execution Sequence (Next 30 Days)
1. **Run `eas build:configure`** and lock Vercel Pro.
2. Implement the exact 3-screen Foyer onboarding architecture.
3. Wire up RevenueCat for the 10-commute trial and degraded UI states.
4. Build the offline/stale-data UI (Step 9).
5. Draft App Store Optimisation (ASO) metadata and legal documents.
6. Ship to TestFlight Beta.

> **→ Execution Bridge**
> This sequence maps directly to the Execution Plan step order: Items 1–2 → Steps 0–5, Item 3 → Steps 1 & 8, Item 4 → Step 7 & Step 9 (extended with stale-data logic), Item 5 → Step 8 legal links. Item 6 is the gate that requires all P0 compliance items from the Compliance section above to be closed.
