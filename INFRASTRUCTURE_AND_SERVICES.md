# MY COMMUTE — INFRASTRUCTURE & SERVICES
## Living Reference: Stack, Free Tiers, Upgrade Triggers, and Cost Tracking

> **How to use this document:**
> This is the operational complement to the Architecture & Execution Plan and the Master Plan. Those documents tell you *what* to build and *why*. This document tells you *what each service costs*, *when it breaks*, and *when to upgrade*. Update this file every time you upgrade a plan, add a service, or hit a ceiling.

---

## DOCUMENT STATUS

| Last reviewed | May 2026 |
|---|---|
| Monthly infra spend | £0 (pre-launch, all free tiers) |
| First required paid upgrade | Vercel Pro (~£17/mo) — required at public launch |
| Next cost inflection | RevenueCat 1% kicks in above $2,500 MTR |

---

## RULING ON STRIPE VS REVENUECAT

This question will come up again. The answer is fixed:

**Stripe is not an alternative to RevenueCat for this app.**

Apple's App Store rules mandate that any purchase unlocking digital content inside an iOS app must go through Apple's own in-app purchase (IAP) system. Apps that bypass this with Stripe are rejected. This is not a gray area — it is an App Store review enforcement point.

RevenueCat is a management layer that sits *on top of* Apple IAP. It handles receipt validation, subscription state, trial expiry, restore purchases, entitlement sync, and webhooks — all the hard infrastructure that raw Apple IAP forces you to build yourself.

**Where Stripe fits later (Phase 4+):** a web paywall at `getmycommute.app/subscribe` can use Stripe via RevenueCat's Web Billing integration. Web-originated purchases bypass Apple's 30% cut. This is a growth optimisation, not a launch concern.

---

## SERVICE REGISTRY

### 1. RevenueCat
**Role:** Subscription and entitlement layer  
**Why this and not alternatives:** Only production-grade option for iOS IAP management that handles Apple receipt validation, restore purchases, trial state, and cross-platform entitlement sync without 3–4 weeks of bespoke engineering.

| Metric | Free tier | Paid |
|---|---|---|
| Monthly Tracked Revenue free | Up to $2,500/mo | — |
| Fee above threshold | — | 1% of MTR (gross, before Apple's cut) |
| Core features on free | Full SDK, webhooks, entitlements, paywalls, customer profiles | — |
| Analytics / A-B tests | Limited on free | Unlocked on Pro |

**Upgrade trigger:** When MTR exceeds $2,500 in any calendar month. Fee is automatic — no manual upgrade required.  
**Note on MTR:** RevenueCat charges on *gross* revenue (before Apple takes 15–30%), not your net payout. Factor this into pricing.

**Current plan:** Free  
**Upgrade cost:** 1% MTR (no flat monthly fee)  

---

### 2. Vercel
**Role:** Python serverless API functions + landing page hosting  
**Risk level: AMBER — action required at launch**

| Metric | Hobby (free) | Pro ($20/mo) |
|---|---|---|
| Bandwidth | 100 GB/mo | 1 TB/mo |
| Function invocations | 1M/mo | 10M/mo |
| Active CPU | 4 hrs/mo | Much higher |
| Runtime log retention | **1 hour** | 1 day |
| Commercial use | **Personal/non-commercial only** | Full commercial |

**Critical action:** Vercel Hobby explicitly prohibits commercial use. A live app with paying subscribers is commercial. **Upgrade to Pro before public launch.** Cost: $20/mo (~£17).

**Second issue:** 1-hour log retention on Hobby makes production debugging nearly impossible. Sentry covers this gap for mobile crashes, but backend Python errors need at least 1-day retention — another reason to upgrade at launch.

**Upgrade trigger:** Before first public user with a paid subscription.  
**Current plan:** Hobby (free)  
**Upgrade cost:** $20/mo (~£17/mo)

---

### 3. MongoDB Atlas
**Role:** Primary database (line states, devices, sync data)  
**Risk level: GREEN with one code-level action required**

| Metric | M0 Free | M10 Paid (first paid tier) |
|---|---|---|
| Storage | 512 MB | 10 GB |
| Max connections | 500 | 1,500 |
| RAM | Shared (no guarantee) | 2 GB dedicated |
| Automated backups | **None** | Yes |
| Commercial use | Allowed | Allowed |

**512 MB is sufficient for:** hundreds of thousands of device records, TfL line state snapshots, notification logs, and community signal data at beta scale.

**The 500-connection ceiling is a real risk.** Vercel serverless functions open a new MongoDB connection per invocation by default. Under load, this exhausts the connection pool and causes `MongoServerSelectionError`. Fix this *before launch* with connection caching in `api/index.py`:

```python
# Singleton pattern — reuse the MongoClient across warm invocations
_client = None

def get_db():
    global _client
    if _client is None:
        _client = MongoClient(os.environ["MONGODB_URI"])
    return _client["my_commute"]
```

**No automated backups on free tier.** Until you upgrade: manually export a `mongodump` weekly and store it somewhere (even a Google Drive folder is fine at this stage).

**Upgrade trigger:** When any of the following occur — storage exceeds 400 MB, connection errors appear in Sentry, or the app reaches 500+ concurrent active users.  
**Current plan:** M0 Free  
**Upgrade cost:** M10 = ~$56/mo. Jump is significant — optimise connection pooling and schema to delay this as long as possible.

---

### 4. Sentry
**Role:** Mobile crash reporting and error monitoring  
**Risk level: GREEN**

| Metric | Developer (free) | Team ($26/mo annual) |
|---|---|---|
| Errors/month | 5,000 | 50,000 |
| Dashboard users | 1 | Unlimited |
| Data retention | 30 days | 30 days |
| Performance monitoring | Basic (shared quota) | Full |

**5,000 errors/month is sufficient until ~1,000 DAU** with well-written error handling.

**Two required config changes before launch:**

1. **Disable performance monitoring** on the free plan. It shares the 5K error quota. A 10% sample rate on 500 DAU will burn your quota in days. Set `tracesSampleRate: 0` in your Expo Sentry config until you're on a paid plan.

2. **Set a daily rate limit.** In Sentry project settings → Client Keys → set a daily cap of ~160 events/day (5,000 ÷ 30). This prevents a single bad deploy from consuming your entire monthly quota in hours.

**Upgrade trigger:** When DAU exceeds 1,000 or when you consistently hit the 5K limit before month-end.  
**Current plan:** Developer (free)  
**Upgrade cost:** $26/mo (annual billing)

---

### 5. Expo EAS Build ← NOT YET IN STACK — ADD BEFORE FIRST TESTFLIGHT
**Role:** Cloud CI/CD for building the bare workflow app for App Store submission  
**Risk level: RED if absent**

| Metric | Free tier | Production tier |
|---|---|---|
| Builds/month | 30 | More |
| iOS builds | Yes | Yes |
| Android builds | Yes | Yes |
| Priority queue | No | Yes |

**Why this is required:** Expo bare workflow apps cannot be reliably built for App Store submission from a local machine across all environments. EAS Build handles iOS signing, provisioning profiles, and certificates in the cloud. Without it, you are manually managing Xcode signing — a significant solo-founder time sink and a common source of mysterious build failures.

**Action:** Run `npm install -g eas-cli && eas build:configure` before your first TestFlight submission.

**Current plan:** Not added  
**Upgrade cost:** Free at launch scale (30 builds/month)

---

## COST TIMELINE

| Stage | Trigger | Monthly cost | Services paying for |
|---|---|---|---|
| Pre-launch (now) | — | £0 | All free tiers |
| Public launch | First paid subscriber | ~£17 | Vercel Pro |
| Early growth | $2,500 MTR | ~£17 + 1% MTR | Vercel Pro + RevenueCat |
| Scaling | 1,000+ DAU | ~£17 + ~£22 + 1% MTR | + Sentry Team |
| DB ceiling hit | ~500 concurrent users | ~£63 additional | + MongoDB M10 |
| Healthy indie app (~$10K MTR) | — | ~£150/mo total | All services scaled |

---

## SERVICES NOT IN STACK AND WHY

| Service | Why not |
|---|---|
| Firebase | Not needed — MongoDB already in use. Migrating for no gain. |
| Supabase | Same reason. No migration without a real blocker. |
| Railway | Not needed until Vercel fails a real workload. |
| AWS / GCP | Over-engineered for this stage. No managed benefit over Vercel. |
| Bugsnag | Sentry free tier covers the same need. Avoid duplication. |
| Datadog | Enterprise pricing. Not appropriate until post-Series A. |

---

## FUTURE SERVICES (ADD IN ORDER)

| Priority | Service | When | Why |
|---|---|---|---|
| Before beta | **Expo EAS Build** | Before first TestFlight | Bare workflow requires it |
| Phase 4–5 | **Resend or Loops** | Before B2B outreach | Transactional email (receipts, win-back, reports) |
| Phase 4 | **RevenueCat Web Billing + Stripe** | After stable launch | Web paywall to bypass 30% Apple cut |
| Phase 5 | **Plausible or Fathom** | Before B2B meetings | Privacy-safe analytics for Campus Transit Reports |
| Phase 6 | **Cloudflare (free)** | Before serious traffic | DDoS protection + edge caching for landing page |

---

## REVISION LOG

| Date | Change |
|---|---|
| May 2026 | Document created. Stack audit completed. All services on free tiers. Vercel commercial-use risk identified. MongoDB connection pooling fix documented. EAS Build gap identified. |

