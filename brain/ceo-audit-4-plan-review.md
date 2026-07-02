# CEO Strategic Audit: My Commute — 4-Plan Review

**Date:** July 2, 2026
**Audit scope:** Master Plan v2.0, Execution Plan v4.4, Infrastructure Plan v4.4, UX Plan v4.4
**Reviewer:** CEO Agent

---

## 1. PLAN — Strategic Alignment

### Thesis Score: 9/10

The core thesis — commuter intelligence from consumer utility to B2B institutional data layer — is sound. The student commuter wedge in London is a genuine underserved niche. Existing apps (Citymapper, TfL Go, Google Maps) are generic; none optimize for the *before-you-leave* anxiety loop.

**Critical gap:** The Master Plan identifies "institutional data layer" as the endgame but has zero concrete milestones for *when* consumer adoption triggers B2B mode. What DAU threshold flips the switch? What metric proves cohort aggregation is viable? Without a quantitative gate, the B2B ambition is just a slide deck promise.

**Recommendation:** Add a `B2B Readiness Gate` to the Master Plan: e.g. "At 5,000 MAU with ≥3 commutes recorded per user/week, activate first campus pilot outreach." This turns the B2B wedge from abstract to measurable.

### What Is Locked — 10/10

The locked decisions (4 modes, 471 stations, no trams/buses) are the right call. Every successful transport app started with a narrow scope — Transit started with one city, Citymapper with London. The scope discipline here is better than most MVPs I've seen.

### Monetization Model — 8/10

The 10-commute usage-based trial is clever and defensible:
- ✅ Tracks real value, not calendar time
- ✅ Students hit 10 commutes faster → converts faster
- ✅ UNiDAYS pricing (£4.99/yr) is brilliant for the student wedge

**Risk:** A user who takes one commute/week lasts 10 weeks. A power user who commutes 2x/day burns through in 5 days. The *experience* of the trial is wildly different. Consider a minimum 7-day wall clock floor on the trial so every user gets at least a week, even power users.

### Accelerator & Narrative — 9/10

The founder narrative ("lived the problem, shipped the product") is the right archetype. The film background for ASO video is an actual unfair advantage — most founders cannot produce App Store previews at this quality. This is under-leveraged in the plan.

---

## 2. INFRASTRUCTURE — Cost & Scaling

### Cost Timeline: 8/10

| Stage | Monthly | Risk |
|-------|:-------:|:----:|
| Pre-launch | £0 | 🟢 |
| Beta (TestFlight) | ~£17 | 🟡 Vercel Pro |
| Early growth ($2.5k MTR) | £17 + 1% RevCat | 🟡 |
| Scaling (1k DAU) | £39 + 1% | 🟡 Sentry Team |
| DB ceiling (500 concurrent) | ~£100 | 🔴 |

**Correct insight:** Vercel Pro (£17/mo) is the only spend required before TestFlight. Everything else scales with revenue. This is realistic for a solo-founder pre-launch.

**🔴 Red flag: MongoDB M0 — 500 connection limit.** The audit calls this out correctly. The Singleton pattern mitigates it for warm starts, but under burst load (release day, viral tweet), Vercel spins up dozens of cold functions simultaneously. Each opens a fresh connection → you hit 500 in seconds → `MongoServerSelectionError` → silent data loss.

**Action:** Set up a connection pooler (MongoDB Atlas Serverless? mongoose with maxPoolSize?) BEFORE launch, not at 500 users. The Singleton pattern is necessary but not sufficient.

### Stripe vs RevenueCat Ruling — 10/10

The locked decision is correct. Stripe for digital content in iOS is an App Store rejection. RevenueCat web billing (Stripe via RevenueCat) for web paywall post-launch is the right Phase 4 move.

### Sentry Configuration — 9/10

`tracesSampleRate: 0` + 160/day cap is the right config. Most teams burn through their quota on performance monitoring before shipping.

### APNs Direct Architecture — 10/10

Dropping Firebase for direct APNs via `aioapns` is a bold, correct call for a solo founder. Firebase Cloud Messaging adds complexity, cost, and Google dependency with zero benefit for a single-platform iOS app. This is the kind of decision most teams don't have the conviction to make.

---

## 3. EXECUTION — Implementation Health

### Step Completion: 7/9 Steps Done

| Step | Status | Notes |
|------|--------|-------|
| 0: Splash/Fonts | ✅ | |
| 1: MMKV/Brain | ✅ | |
| 2: Void Background | ✅ | |
| 3: Onboarding Screen 1 | ✅ | |
| 4: Onboarding Screen 2 | ✅ | |
| 5: Permissions Screen | ✅ | |
| 6: Grand Reveal | ✅ | |
| 7: Zero State | ✅ | |
| 8: Monetization | ⏳ Legal links pending | |
| 9: Geofencing/Widgets | ✅ | |

### Code Quality Assessment

The codebase shows strong patterns:
- Shared value architecture for animations (useJiggle, usePressAnimation) ✅
- Zustand + MMKV for zero-latency state ✅
- Glassmorphism standardized via GLASS tokens ✅
- No nested gradient border wrappers (GlassRim removed) ✅

**🔴 Pain point:** The card shadow inconsistency. Some cards have GLASS-driven shadows (LineCard, DepartureCard, StationCard, LineDetailModal), others don't (StationDetailScreen line sections, ManageStationsModal compactCard, LinePill). The visual result is uneven depth across the dashboard. Either standardize shadows everywhere or remove them from all cards.

### Open Action Items

| # | Item | Risk | Status |
|---|------|:----:|--------|
| 1 | Source `grain.png` | Medium | Open — blocks Step 2 in spirit |
| 2 | Source `thud.wav` | Low | Open — blocks Step 6 audio cue |
| 3 | Host Privacy Policy + ToS | **P0** | ⛔ Blocks TestFlight |
| 4 | Loading skeleton (100% shimmer) | Medium | Open |
| 5 | Stale-data UI (amber dot + timestamp) | Medium | Open |
| 6 | Calibrate Fuse.js threshold | Low | Open |
| 7 | Run `eas build:configure` | **P0** | ⛔ Blocks every signed build |
| 8 | Upgrade Vercel to Pro | **P0** | ⛔ Blocks TestFlight |
| 9 | Set Sentry daily cap | **P0** | Open but low effort |

**3 P0 blockers** for TestFlight — Vercel Pro, EAS configure, legal links. These are the actual launch gate. Everything else can ship with deferred items.

---

## 4. UX/UI — Design System

### Visual Environment Split — 10/10

Two-environment system (Void onboarding → Fractal Glass dashboard) is architecturally clean. The Grand Reveal transition is the right premium product moment.

**Concern:** The UX Plan specifies `tint="light"` with `intensity: 20` for glass cards. The codebase uses `tint="dark"` with `intensity: 45`. The spec and implementation are **out of sync**. The UX document says "NEVER use dark tint on blur; it absorbs the ambient gradient" — but the actual code does exactly this. This needs reconciling: either the spec changes to accept dark tint's absorption effect, or the code switches to light tint.

### Ghost States — 7/10

The three-state table (zero/loading/stale) is well-specified. But only zero state is implemented. Loading state shimmer and stale-state amber dot + timestamp are open items. The stale-data architecture is critical for Tube UX — users going underground is not an edge case, it's the core use case.

### Accessibility — 6/10

Considerations are present (reduceMotion, VoiceOver, contrast ratios) but not comprehensively validated. WCAG 4.5:1 contrast in glass cards is called out as a requirement but the spec admits it hasn't been verified. This is a launch risk — Apple's accessibility review rejects apps with insufficient contrast.

---

## Consolidated Verdict

| Dimension | Score |
|-----------|:----:|
| **Strategy & Direction** | 9/10 |
| **Infrastructure & Cost** | 8/10 |
| **Execution** | 8/10 |
| **UX/UI** | 7/10 |
| **Overall** | **8/10** |

### Top 3 Priorities Before TestFlight

1. **🔴 Vercel Pro + EAS configure + Legal links** — the 3 P0 items that actually block launch
2. **🟡 Reconcile blur tint** — UX spec says `tint="light"` intensity 20, code uses `tint="dark"` intensity 45. One of them is wrong.
3. **🟡 Standardize card shadows** — currently inconsistent across components. Pick one approach.

### Top 3 Strategic Moves Post-Launch

1. **Usage trial minimum floor:** Add 7-day wall clock minimum to the 10-commute trial
2. **B2B Readiness Gate:** Define the MAU/engagement threshold that triggers institutional sales
3. **ASO video advantage:** Produce the Grand Reveal + premium zero state as App Store preview video — this is your film background's highest-leverage moment
