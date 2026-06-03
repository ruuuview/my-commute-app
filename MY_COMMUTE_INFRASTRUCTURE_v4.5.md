# INFRASTRUCTURE & SERVICES
## My Commute — Stack, Free Tiers, Upgrade Triggers & Cost Tracking
### v4.7 — Production Audit Pass Complete (Synced with Execution, UX, Master Plan)

---

> **Document Hierarchy Notice**
> This is the **operational cost and quota authority document**. It owns service configuration, spend thresholds, upgrade triggers, and environment architecture. It does not own product decisions (→ `MY_COMMUTE_MASTER_PLAN.md`), implementation steps (→ `MY_COMMUTE_EXECUTION_PLAN.md`), or visual/UX specifications (→ `MY_COMMUTE_UX_PLAN.md`).
>
> **Linked Documents:**
> - Strategy authority: `MY_COMMUTE_MASTER_PLAN.md` (v2.0+)
> - Implementation authority: `MY_COMMUTE_EXECUTION_PLAN.md` (v4.6+)
> - UX/UI authority: `MY_COMMUTE_UX_PLAN.md` (v4.6+)
>
> **Sync Protocol:** Update this file every time you upgrade a plan, add a service, or hit a quota ceiling. Any new service added here must also be added to the locked stack in `MY_COMMUTE_MASTER_PLAN.md §2` before it is considered ratified.

---

## DOCUMENT STATUS

| Field | Value |
|---|---|
| Last reviewed | June 2026 (Production Audit Sync — v4.7) |
| Monthly infra spend | £0 (pre-launch, all free tiers) |
| First required paid upgrade | Vercel Pro (~£17/mo) — Required before TestFlight |
| Next cost inflection | RevenueCat 1% kicks in above $2,500 MTR |

---

## RULING ON STRIPE VS REVENUECAT

**Stripe is not an alternative to RevenueCat for this app.**

Apple's App Store rules mandate that any purchase unlocking digital content inside an iOS app must go through Apple's own in-app purchase (IAP) system. Apps that bypass this with Stripe are rejected.

RevenueCat is a management layer that sits on top of Apple IAP. It handles receipt validation, subscription state, trial expiry, restore purchases, entitlement sync, and webhooks.

**Where Stripe fits later (Phase 4+):** A web paywall at `getmycommute.app/subscribe` can use Stripe via RevenueCat's Web Billing integration to bypass Apple's 30% cut. This is a post-launch growth optimisation.

> **↑ Strategy Reference — Master Plan: "What Is Locked §2 (The Final Locked Stack)" + "Monetization & The Usage-Based Trial"**
> This ruling is a locked decision. It must not be reopened at the implementation layer. The cold-start `Purchases.getCustomerInfo()` listener in **Execution Plan Step 1** and the Restore Purchases button in **Execution Plan Step 8** are both downstream consequences of this architecture.

---

## CRITICAL ARCHITECTURE ADDITIONS (PRE-LAUNCH)

### 1. Environment Separation & Secrets

Never test in production. A bug fix tested in prod corrupts real user data, and Apple reviewers hitting a dev API is an App Store review failure mode.

**Action:** Create two separate MongoDB Atlas clusters (or databases within a cluster): `my_commute_dev` and `my_commute_prod`.

**Secrets:** Never hardcode keys. Use EAS Secrets for mobile build variables and Vercel Environment Variables (`.env.development` and `.env.production`) for backend secrets.

> **↑ Strategy Reference — Master Plan: "What Is Locked §2 (Stack)"** + **Execution Plan: "Section 2 — Dependencies"**
> EAS Secrets depend on `eas-cli` being installed and `eas build:configure` having been run — both are gated in **Execution Plan Section 2**. Environment separation must be in place before the first TestFlight invite. This directly blocks the **Launch Execution Sequence Item 6** in the Master Plan.

---

### 2. TfL API Resiliency (Caching Layer)

The app is entirely dependent on the TfL Unified API. TfL goes down regularly.

**Action:** Implement an in-memory TTL cache (or Vercel KV/Redis) on your Vercel backend using a `stale-while-revalidate` pattern. Never let the app break just because TfL rate-limits you.

> **↑ Strategy Reference — Master Plan: "Offline & Stale-Data Architecture"**
> This backend cache is the server-side complement to the client-side stale-data UI rules in the Master Plan. The stale-data detection in client-side hook (`useTflPoller`) monitors fetch timeout (8000ms), network availability, and HTTP errors to show accurate status messages in real-time. When the cache is stale, `useWorstStatus` must propagate a `stale: true` flag upstream to trigger the warning state and stale UI.

---

### 3. RevenueCat Webhook

**Action:** Create `/api/revenuecat-webhook.py` with signature verification. This ensures your backend knows immediately if Apple processes a refund or subscription cancellation, keeping the database perfectly synced with user entitlements.

> **↑ Strategy Reference — Master Plan: "Monetization & The Usage-Based Trial"**
> The webhook is what keeps `entitlementActive` accurate on the backend. The client-side `AppState` listener in **Execution Plan Step 1** handles foreground re-validation. Together these two mechanisms are the complete entitlement sync system. Neither is sufficient alone.

---

## SERVICE REGISTRY

---

### 1. RevenueCat
**Role:** Subscription and entitlement layer

| Metric | Free tier | Paid |
|---|---|---|
| Monthly Tracked Revenue (MTR) | Up to $2,500/mo | — |
| Fee above threshold | — | 1% of MTR (gross, before Apple's cut) |
| Core features on free | Full SDK, webhooks, entitlements, paywalls | — |

**Upgrade trigger:** When MTR exceeds $2,500 in any calendar month. Fee is automatic.
**Current plan:** Free

> **↑ UX Plan Reference — Section 11 (Monetisation / Trial Flow)**
> RevenueCat's entitlement state is what drives the locked card blurring and "Unlock all departures →" CTA specified in **UX Plan §11.4**. The `entitlementActive` Zustand field in **Execution Plan Step 1** is the local mirror of RevenueCat's server state. Treat discrepancy between these as a P1 bug.

---

### 2. Vercel
**Role:** Python serverless API functions + landing page hosting
**Risk level: RED — Action required before Beta**

| Metric | Hobby (free) | Pro ($20/mo) |
|---|---|---|
| Function invocations | 1M/mo | 10M/mo |
| Runtime log retention | 1 hour | 1 day |
| Commercial use | Personal/non-commercial only | Full commercial |

**Critical action:** Vercel Hobby explicitly prohibits commercial use. Apple reviewers count as users of a commercial product. You must upgrade to Pro before sending your first external TestFlight invite. 1-hour log retention makes backend debugging impossible.

**Upgrade trigger:** Before first TestFlight invite.
**Current plan:** Hobby (free)
**Upgrade cost:** $20/mo (~£17/mo)

> **↑ Strategy Reference — Master Plan: "Launch Execution Sequence Item 1"**
> `Run eas build:configure and lock Vercel Pro` is the first item in the Master Plan launch sequence. This is not optional. The TfL caching layer (Section 2 above) and the RevenueCat webhook (Section 3 above) both run on Vercel — they cannot go to production on a Hobby plan. This upgrade gates everything downstream.

---

### 3. MongoDB Atlas
**Role:** Primary database (line states, devices, sync data)
**Risk level: RED — Code action required immediately**

| Metric | M0 Free | M10 Paid (first paid tier) |
|---|---|---|
| Storage | 512 MB | 10 GB |
| Max connections | 500 | 1,500 |
| Automated backups | None | Yes |

The 500-connection ceiling is a launch killer. Vercel serverless functions open a new MongoDB connection per invocation. Under rush-hour load, this will instantly exhaust the connection pool and cause a `MongoServerSelectionError`, resulting in silent data loss.

**Required Fix:** Apply the Singleton pattern in `api/index.py` to cache the connection across warm invocations:

```python
# Singleton pattern — reuse the MongoClient across warm invocations
_client = None

def get_db():
    global _client
    if _client is None:
        _client = MongoClient(os.environ["MONGODB_URI"])
    return _client["my_commute"]
```

**Backup Strategy:** M0 has zero automated backups. One bad script drops the collection forever.
**Action:** Schedule a weekly `mongodump` via cron and pipe it to an S3 bucket or Google Drive until you upgrade to M10.

**Upgrade trigger:** When storage exceeds 400 MB, connection errors appear, or the app hits 500+ concurrent active users.
**Current plan:** M0 Free
**Upgrade cost:** M10 = ~$56/mo

> **↑ Strategy Reference — Master Plan: "What Is Locked §2 (Stack)"** + **Execution Plan: "Step 1 — MMKV/Zustand Brain"**
> The Singleton pattern here is the backend equivalent of the cold-start `AppState` listener in **Execution Plan Step 1**. Both protect against state corruption under concurrent load. The `my_commute_dev` / `my_commute_prod` environment separation (Section 1 above) must use this same Singleton pattern in both environments from day one.

---

### 4. Sentry
**Role:** Mobile crash reporting and error monitoring
**Risk level: RED — Configuration action required**

| Metric | Developer (free) | Team ($26/mo annual) |
|---|---|---|
| Errors/month | 5,000 | 50,000 |
| Performance monitoring | Basic (shared quota) | Full |

**Two required config changes to protect your free quota:**

1. **Disable performance monitoring:** It shares the 5K error quota. A 10% sample rate on 500 DAU will burn your quota in three days. Set `tracesSampleRate: 0` in your Expo Sentry config.
2. **Set a daily rate limit:** In Sentry project settings → Client Keys, set a daily cap of ~160 events/day. This prevents a single bad deploy loop from blinding you for the rest of the month.

**Upgrade trigger:** When DAU exceeds 1,000 or when you hit the daily cap 3 days in a row.
**Current plan:** Developer (free)
**Upgrade cost:** $26/mo (annual billing)

> **↑ Strategy Reference — Master Plan: "What Is Locked §2 (Stack)"**
> Sentry is the crash observability layer for the locked stack. The daily rate limit of ~160 events/day must be configured before TestFlight — a bad onboarding animation regression (see **Execution Plan Steps 3–5**) or a Reanimated crash can silently burn the monthly quota in a single session if the cap is not set.

---

### 5. Expo EAS Build
**Role:** Cloud CI/CD for building the bare workflow app for App Store submission
**Risk level: RED — Action required**

Why this is required: Expo bare workflow apps cannot be reliably signed for Apple from a local machine. EAS Build handles iOS signing, provisioning profiles, and certificates in the cloud.

**Action:** Run `eas build:configure` immediately.
**Current plan:** Free at launch scale (30 builds/month).

> **↑ Execution Plan Reference — Section 2 (Dependencies)**
> `eas-cli` is the first dependency in **Execution Plan Section 2**. `eas build:configure` is also the first item in the **Master Plan Launch Execution Sequence**. These three documents are unanimous: this is the first action to take. Until EAS Build is configured, no production build can be signed, no TestFlight invite can go out, and no App Store submission is possible.

---

## COST TIMELINE

| Stage | Trigger | Monthly cost | Services paying for |
|---|---|---|---|
| Pre-launch (now) | — | £0 | All free tiers |
| Beta Launch | First TestFlight Invite | ~£17 | Vercel Pro (Commercial License) |
| Early growth | $2,500 MTR | ~£17 + 1% MTR | Vercel Pro + RevenueCat |
| Scaling | 1,000+ DAU | ~£17 + ~£22 + 1% MTR | + Sentry Team |
| DB ceiling hit | ~500 concurrent users | ~£63 additional | + MongoDB M10 |

> **↑ Strategy Reference — Master Plan: "Launch Execution Sequence"**
> The Beta Launch cost inflection (~£17/mo) is the only spend required before TestFlight. Every other cost trigger is a consequence of growth — which is the right problem to have. The Vercel Pro upgrade must be treated as a launch blocker, not a growth expense.

---

## OPEN ACTION ITEMS (Post v4.6)

| # | Item | Risk | Blocks |
|---|---|---|---|
| 1 | Run `eas build:configure` | P0 | Every signed build |
| 2 | Upgrade Vercel to Pro | P0 | TestFlight / App Store review |
| 3 | Set Sentry `tracesSampleRate: 0` + daily cap | P0 | Quota burn |
| 4 | Apply MongoDB Singleton pattern to `api/index.py` | P0 | Rush-hour connection pool |
| 5 | Create `my_commute_dev` + `my_commute_prod` Atlas clusters | P1 | Environment separation |
| 6 | Set up EAS Secrets + Vercel env vars | P1 | Secure key management |
| 7 | Schedule weekly `mongodump` to S3/Drive | P1 | Data loss on M0 |
| 8 | Create `/api/revenuecat-webhook.py` with sig verification | P1 | Entitlement sync accuracy |
