# My Commute
## Master Plan
### Full Strategic, Product, GTM, Technical, Fundraising, and Founder Blueprint

## What This Document Is
This is the single consolidated plan for **My Commute** based on everything established so far:

- the original product thesis
- the 100-point operating strategy
- the GTM corrections
- the launch-stack audit
- the full multi-dimension gap audit
- the onboarding architecture and execution plan
- the solo-founder workflow decisions
- the institutional wedge
- the accelerator strategy
- the founder narrative
- the technical architecture explanation

This document is designed to function as the canonical operating blueprint.

It answers:

- what My Commute is
- why it matters
- what stack is locked
- what not to change
- how to launch
- how to monetize
- how to sell B2B
- how to speak about the company to investors and accelerators
- what to do next, in order

## Core Thesis
My Commute is a commuter intelligence and commuter experience product.

At the consumer level, it helps riders make better decisions before and during their journey.

At the institutional level, it can become a system for measuring how transport friction affects:

- attendance
- punctuality
- stress
- wellbeing
- access to campus
- student experience

The wedge is **London student commuters**.

The long-term ambition is broader:

- begin with students
- build a high-frequency commuter utility
- turn usage and commuter pain into a defensible data layer
- use that data to sell insight to universities and later other institutions

## The Big Insight
Most transport products show information.
Very few help a rider answer the actual question:

**What should I do right now?**

That is the product opportunity.

Most institutions care about student outcomes, attendance, retention, and access.
Almost none have a reliable operational view into commuter friction.

That is the B2B opportunity.

My Commute sits between those two:

- useful consumer product
- valuable institutional insight

## The Strategic Position
The strategy is strong because it is not trying to be everything at once.

It is:

- consumer-first in product learning
- institution-aware in future monetization
- London-specific in early focus
- mobile-native in execution
- solo-founder optimized in tooling and operating model

## The 100/100 View
The earlier operating review concluded the plan was around **91/100**, with the remaining gap being executional rather than conceptual.

That is still directionally true, but the newer audit adds a more realistic picture:

- the original strategic gaps were real
- several new product, legal, conversion, and operations gaps were found
- one of the biggest product gaps, **onboarding**, is no longer an open gap because there is now a dedicated onboarding plan

So the current state is:

- the strategy is coherent
- the stack is coherent
- the onboarding architecture is now designed
- the remaining weaknesses are mainly in launch hardening, legal/compliance detail, conversion systems, and B2B operational definition

### Resolved or materially improved gaps
- wrong first B2B hire is now reframed correctly
- stack confusion is resolved
- Sentry is now identified as the correct monitoring layer
- onboarding is no longer undefined
- Expo/React Native vs Flutter confusion is resolved
- Vercel/MongoDB vs stack migration confusion is resolved

### Remaining high-priority gaps
- offline / stale-data behaviour must be explicitly productized
- App Store optimisation is not yet defined
- legal documents and consent logic must be formalized
- B2B anonymisation architecture must be specified before serious sales
- B2B pilot and pricing structure must be defined more concretely
- customer support and operational fallback systems must exist before scale
- personal brand, advisor network, and burnout protection need to become explicit founder systems

## What Is Locked
These decisions are now considered fixed unless a real blocker appears.

### Product Direction
- The company is staying focused on commuter experience and commuter intelligence.
- The initial wedge remains London student commuters.
- The B2B wedge remains university-facing insight and pilot conversations.

### Framework
- **React Native / Expo** stays.
- There is no switch to Flutter.

### Backend
- **Vercel Python serverless functions** stay.
- There is no backend rewrite for the sake of backend fashion.

### Database
- **MongoDB Atlas** stays.
- Existing collections and server logic remain the base.

### Payments
- **RevenueCat** is the chosen subscription and entitlement layer.

### Monitoring
- **Sentry** is the chosen mobile error/crash reporting layer.

### Web Hosting
- **Vercel** hosts the landing page and lightweight web presence.

### Operating Philosophy
- no infra rewrite before launch unless it removes a real blocker
- use leverage-first tooling
- buy complexity wherever possible
- spend founder time on product, UX, distribution, and insight, not plumbing

### Onboarding Direction
- onboarding is a designed system now, not an open question
- the app should use a high-contrast onboarding flow before the more complex fractal-glass dashboard experience
- onboarding state should persist in Zustand/MMKV
- the onboarding flow should explicitly guide the user through line selection, station pinning, and a combined permissions screen for both calendar and notifications

## Final Locked Stack
### Frontend
- React Native
- Expo
- Expo Router
- React Native Reanimated
- Fractal Glass UI system
- high-contrast onboarding system built around the "Void" visual language

### Backend
- Python serverless functions on Vercel
- existing `api/index.py`
- existing Vercel cron jobs such as `/api/cron/tfl-sync`

### Database
- MongoDB Atlas
- current cluster and current data model
- collections such as `line_states`, `devices`, and supporting entities already in use

### Payments
- RevenueCat

### Monitoring
- Sentry for mobile crash reporting
- basic backend logging within existing Python routes

### Infrastructure Philosophy
- Vercel for site and serverless API
- no Railway unless a real workload appears that Vercel cannot handle
- no Supabase migration
- no Firebase migration if not already required

## Onboarding Is Now A Built System
The full gap audit correctly identified onboarding as a critical missing piece at the time of the audit. That is no longer true. There is now an explicit onboarding architecture and execution plan.

### What the onboarding plan already establishes
- a branded splash handoff to let state hydrate cleanly
- a persistent Zustand/MMKV onboarding brain
- a dedicated high-contrast onboarding visual system called the **Foyer**
- a reusable `Void` background with solid black plus physical film-grain texture
- a 3-screen onboarding flow:
  - line selection
  - station pinning
  - permissions and personalized alert tease, including both calendar and notification disclosure
- explicit routing into the dashboard after onboarding completion
- a premium zero-state / empty-state safety net

### Why this matters
This changes the product story materially. The app is no longer just "a clever commuter engine." It now has a defined first-use journey, which is critical in a habit-forming product.

### What remains to do
The onboarding architecture exists, but it still needs to be:

- implemented faithfully
- connected to real permission behaviour
- connected to real calendar and notification permission behaviour
- tested with denial cases
- tested for low-friction first value
- linked properly to the dashboard empty state and first alert success moment

## The Reality Check On Stack Decisions
### React Native vs Flutter
Flutter was recommended by creators because it is a strong solo-builder mobile framework.

That recommendation is irrelevant now because:

- My Commute is already built in React Native
- the app already has a highly customized animation-heavy interface
- Expo Router and the existing UI architecture already carry significant implementation value

Changing frameworks now would be pure destruction disguised as optimization.

### MongoDB/Vercel vs Supabase/Firebase
Supabase sounds attractive in theory.
Firebase may sound simpler to some audiences.
Neither matters if the current backend already works.

The Trae audit established that the actual backend reality is:

- custom Python backend already built
- deployed on Vercel
- connected to MongoDB Atlas
- live data model already exists

Therefore the correct decision is:

- keep the working backend
- harden it
- launch it

### RevenueCat
This is non-negotiable because native subscription infrastructure is too expensive in solo-founder time.

RevenueCat is used for:

- trial state
- entitlement state
- purchase restoration
- Apple / Google billing abstraction
- webhook sync to backend

### Sentry vs Axiom
Axiom is a useful observability tool for server-side logging.
But if the app breaks on-device, Sentry is what matters first.

Sentry is therefore the correct launch monitoring layer.

### Vercel vs Railway
Railway is not needed unless there is a real custom backend workload beyond what Vercel serverless and cron can handle.

Right now:

- Vercel is already deployed
- cron is already in place
- serverless routes already exist

So Vercel remains the right choice.

## Product Vision
My Commute should feel like:

- the app that tells you what your morning is going to feel like
- the layer that connects calendar urgency with transit conditions
- the tool that helps you avoid small transport failures turning into life failures

This is not just another TfL interface.
It is a decision-support product.

It should also feel intentional from the first minute of use:

- the onboarding should feel cinematic and premium
- the dashboard should feel alive, not empty
- even degraded or stale states should feel designed rather than broken

## Product Principles
1. Reduce uncertainty, not just display data.
2. The product must be immediately useful in real commuter situations.
3. Trust is a feature.
4. False alarms are worse than incomplete information.
5. UX clarity beats feature sprawl.
6. Real-time relevance matters more than theoretical completeness.
7. Institutional value is downstream of consumer usefulness.
8. Onboarding must explain the user benefit, not the app's needs.
9. Stale data is better than blank failure, if shown honestly.
10. Degraded premium states should still educate and convert, not confuse.
11. Calendar access must be explicitly disclosed before request, with local-only language that matches the legal policy.

## User Problem
The core user pain is not just delay.
It is the combination of:

- transit uncertainty
- timing pressure
- calendar stakes
- lack of confidence in what to do
- emotional stress caused by daily unpredictability

The commuter is often juggling:

- lecture timing
- work timing
- route changes
- disruption ambiguity
- anxiety about being late

My Commute wins if it reduces that chaos.

It also loses very quickly if:

- first-run onboarding feels confusing
- permission asks feel selfish
- the app goes blank when the Tube loses signal
- stale data is hidden instead of explained

## Why The Student Wedge Works
Student commuters are the right wedge because they are:

- frequent public transport users
- schedule-sensitive
- clustered in cities like London
- socially networked
- tied to institutions that care about their outcomes

This creates a rare strategic bridge:

- consumer utility on one side
- institutional monetization on the other

## The Institutional Thesis
Universities care about:

- attendance
- punctuality
- wellbeing
- retention
- equitable access to campus

Transport friction influences all of them, but is usually unmeasured.

My Commute can become the first system that turns commuting pain into actionable campus insight.

That institutional thesis now needs a more explicit architecture underneath it:

- clear anonymisation rules
- clear cohort thresholds
- clear pilot packaging
- clear pricing
- clear legal basis for how consumer data becomes institutional insight

## The GTM Correction
The biggest unlock in the entire plan is correcting the first B2B move.

### What not to do
Do not hire a traditional enterprise closer immediately.

Why:

- the category is still being defined
- the buyer language is not yet fully learned
- a closer will optimize for pipeline optics rather than market understanding
- an early AE can burn trust in a fragile market

### What to do instead
Run **30 days of founder-led discovery** first.

The founder should take the first 10 B2B conversations personally.

Goal:

- learn real objections
- identify who actually cares
- learn who owns budget
- understand whether the first buyer is welfare, operations, innovation, retention, or student experience
- learn what a pilot must look like to be acceptable

Only after this should My Commute hire a **Fractional Head of Partnerships** with:

- UK university exposure
- public-sector or institutional credibility
- pilot-shaping experience
- category-creation instincts

## The First Institutional Wedge
The first B2B wedge is not a heavy enterprise sell.
It is a **free Campus Transit Impact Report**.

That report should:

- frame commuter friction as a student-outcomes issue
- show the operational relevance of commuter pain
- create an internal document an institution can circulate
- make the case for a bounded pilot

The right institutions to begin with are likely:

- KCL
- UCL
- similar London universities with commuter-heavy student populations

The audit also adds an important parallel channel:

- Student Union partnerships may be a faster first distribution path than university administration

That means the real B2B/institutional sequence may be:

1. student users
2. student union relationship
3. free report / insight proof
4. university administration pilot
5. paid campus dashboard contract

## The Free Report Strategy
The free report is not charity.
It is a wedge.

Its job is to:

- demonstrate value without procurement drag
- create credibility
- generate reference conversations
- help a stakeholder internally advocate for the next step

The report should include:

- commuter friction framing
- likely effects on attendance and stress
- route and timing concentration
- a pilot recommendation
- a privacy-safe, institutional-friendly tone

But the report alone is not enough. The audit correctly highlights that the dashboard product also needs a defined **pilot structure**.

### Pilot structure now required
- first university pilot can be £0 for 90 days
- dashboard access plus founder-delivered monthly report
- case-study rights or at least learning rights should be built into the arrangement
- the free report opens the door; the pilot tests whether the dashboard is worth paying for

## Product Gaps Still Open After The Audit
The onboarding gap is now addressed structurally, but several product gaps remain active.

### 1. Offline / no-internet experience
This is a true commuter-core gap.

Users on the Tube will often have:

- no signal
- stale data
- partial state sync

The app cannot behave like that is a rare edge case.

#### Required product rule
- never go visually dead if cached information exists
- show last successful update time clearly
- maintain designed cards and gradients even in stale mode
- explain uncertainty honestly

### 2. Dodge Rate prompt timing
The prompt logic should not be vague.

Working assumption from the audit:

- ask around 15 minutes after the calendar event start time

Why:

- the user now knows whether they made it
- the emotional memory is fresh
- response quality should be much better

### 3. Degraded widget state
The widget should not become a meaningless grey block after the trial or entitlement expires.

Required principle:

- degraded state should still show something useful
- it should also teach the user what premium restores

### 4. Premium zero-state and empty-state design
The onboarding plan already adds a dashboard safety net for no content.
This is now part of the real product strategy, not a nice-to-have.

### 5. Calendar permission is part of onboarding, not an invisible background detail
The plan now explicitly requires Screen 3 to ask for:

- Calendar access first
- Notification access second

with clear disclosure that calendar reads are used to find commute times and remain on-device.

### 5. Secondary feature opportunities
Not pre-launch requirements, but meaningful later adds:

- Apple Watch complication
- Siri Shortcut

These belong in the roadmap, not the current launch-critical lane.

## Monetization Strategy
The immediate monetization path is consumer subscription.

### Subscription model
- a trial period
- visible countdown such as `14 Days Left`
- premium features and/or notification capability gated by entitlement

### Why RevenueCat matters
RevenueCat handles:

- billing abstraction
- entitlement sync
- restore purchases
- recurring payment state
- Apple/Google complexity

### Backend payment flow
RevenueCat webhooks should update user premium status in MongoDB via the Vercel Python backend.

### Product behavior
When trial expires:

- the app should clearly communicate trial/premium status
- locked functionality should degrade gracefully
- push notifications can be restricted according to the premium plan logic

### New conversion systems required by the audit
The monetization architecture is stronger now, but still incomplete without:

- a churn win-back mechanic
- a private referral loop, not only public UGC
- an App Store rating trigger strategy

### Churn recovery
The audit is right that a lapsed subscriber should not just disappear.

Current working concept:

- give a small number of free recovery rides or monitoring credits
- send a win-back notification or email
- re-open habit formation before asking for payment again

### Referral logic
The TikTok UGC loop is creative, but not enough on its own.

The plan should also include a private referral mechanism such as:

- invite friend
- friend completes a qualifying number of monitored commutes
- both receive premium time

### Ratings strategy
App Store reviews should not be random.

Best principle from the audit:

- ask after a clearly positive value moment
- never ask after a bad journey
- ask once, not constantly

## Notification and Reliability Logic
Your technical narrative includes a sophisticated notification strategy:

- silent push first
- ACK fallback to visible push
- tertiary local notification failsafe

That is not trivial.
It is a real architectural decision and should remain part of the technical story.

For launch, the system must be tested against:

- background app state
- killed app state
- poor network
- delayed push delivery
- trial expiration logic

It must also be paired with:

- explicit offline/stale-state UX
- TfL API failure fallback
- support tooling when things go wrong at rush hour

## Community Signal / Waze Protocol
The crowdsource/disruption signal layer is strategically strong but dangerous if it triggers too early.

### Risk
With a small user base, one or two reports are noise, not signal.

If the product shows unreliable community alerts:

- trust dies early
- the app feels gimmicky
- the signal layer hurts instead of helps

### Fix
Use a threshold such as:

- minimum 3 independent reports
- same line
- within a defined short time window

Below threshold:

- rely on official data

Above threshold:

- blend community signal and official data
- label source clearly

This same principle should govern all "smartness" in the app:

- avoid false confidence
- prefer visible uncertainty to silent wrongness
- let trust build slowly

## Marketing And Growth Gaps Added By The Audit
The original master plan underweighted owned growth mechanics. The audit improves this.

### 1. App Store Optimisation
This is now a required launch workstream, not an optional polish pass.

The app needs:

- keyword strategy
- screenshot copy strategy
- icon testing
- title/subtitle strategy that is more searchable than a generic name alone

### 2. Owned media
The company cannot depend only on one PR narrative.

The plan should include:

- weekly London commute data posts
- build-in-public content
- recurring insight posts that become both audience building and credibility building

### 3. Physical distribution
Fresher Fair / in-person campus demos are now part of the distribution logic.

This matters because:

- seeing the Dynamic Island / live experience in person is a stronger sell than abstract explanation

### 4. Viral formats
The commuter personality quiz is a strong optional growth experiment, but not launch critical.

Treat it as:

- medium-priority growth experiment
- post-launch content and acquisition asset

## Technical Architecture Narrative
Every accelerator and investor discussion will eventually reduce to:

**Can you clearly explain what you built?**

The answer should be:

> My app uses React Native with Expo bare workflow. It has a custom animated UI built with Reanimated and Expo Router. The backend is Python serverless functions on Vercel connected to MongoDB Atlas. RevenueCat handles subscriptions and entitlements. Sentry handles mobile crash reporting. The product uses TfL live data, calendar integration, local caching, and a layered notification system to deliver time-sensitive commuter intelligence.

The more detailed version can include:

- React Native with Expo bare workflow
- Reanimated-driven custom UI
- Expo Router navigation
- Vercel Python serverless API
- MongoDB Atlas backend storage
- local caching via MMKV with safe singleton/lazy initialization patterns
- TfL API live status
- iCal/calendar reads
- silent push, ACK fallback, local fallback
- RevenueCat for subscriptions
- Sentry for crash reporting

That is already founder-level technical depth.

To stay accurate with the onboarding plan, your fuller architecture explanation can now also mention:

- Zustand/MMKV persistence
- a three-step onboarding system
- permission-aware first-run personalization for both calendar and notifications
- designed stale-data handling as a core requirement

## The Truth About "Built By Me and AI"
This needs to be explicitly locked in because it affects confidence, applications, and storytelling.

### The reality
You are not pretending to be a traditional computer science engineer.

You may not pass a deep, adversarial systems interview without preparation.

But:

- you shipped a real product
- you debugged real crashes
- you worked through EAS builds
- you fixed technical issues
- you made architecture decisions
- you understand your own stack
- you know why components are there

That is real founder-level technical execution.

The correct framing is:

> I used modern tools, including AI, to move faster, but I own the architecture, the debugging, the product decisions, and the system behavior.

That is a strong answer.

## Founder Story
The strongest founder story currently available is not "I am a genius engineer."
It is:

- I lived the problem
- I became obsessed with it
- I taught myself enough to build the first version
- I shipped
- now I need to scale the company properly

This is the most powerful version:

> I spent years living in London and seeing the same broken commuter experience every morning. People juggling time pressure, stress, missed trains, late lectures, two or three apps open, but no system helping them make the right decision at the right moment. I taught myself enough to build the first version of My Commute so I could prove the problem was real. Now I’m building the company around that conviction.

## Narrative Hook
The broader press/founder narrative around your background may be powerful, but it must be tested before full use.

What matters:

- authenticity
- clarity
- resilience under questioning

Action:

- test the story with investors
- test it with journalists
- test it with users
- simplify if it feels forced

The audit also adds an important narrative correction:

- your film background should be used more aggressively as an advantage
- you can produce a product film, app preview, and emotionally sharp founder narrative better than many technical founders can

## Accelerator Strategy
The current ranking is:

### 1. EF
Best if your biggest problem is:

- no deep technical co-founder
- need for team completion
- desire to pair with a strong technical builder

Your profile at EF is:

- domain-obsessed founder
- compelling lived insight
- already shipped a product
- needs a deeper technical partner to scale it

My Commute is proof of obsession, not proof that you are trying to cosplay as a staff engineer.

### 2. Antler
Best if the focus is:

- backing you as a founder with a real product
- product-first and founder-first evaluation
- momentum around the actual company you already built

Your Antler story is:

- domain knowledge
- founder execution
- real product
- real narrative
- early GTM structure

### 3. Seedcamp
Later, not first.

Best approached with:

- more traction
- stronger team
- or a clearer proof layer

### Best immediate move
Apply to **EF and Antler in parallel**.

Why:

- EF solves the co-founder gap
- Antler validates the company path
- both become stronger as you keep building publicly

## What To Say In EF
### Problem
- years of exposure to London commuting pain
- repeated observation of broken decision-making moments

### Insight
- calendar urgency + transit conditions is an under-served intersection
- commuter behavior itself may become a valuable signal layer

### Proof of conviction
- taught yourself enough to build
- shipped a live product
- built the system in React Native/Expo with a real backend
- started validating institutional interest

### What you need
- a deep technical co-founder
- someone who can scale what you have proven deserves to exist

## What To Say In Antler
### Positioning
- product-first founder
- domain insight plus technical execution
- already shipping, not just ideating

### Story
- London commuter pain observed over years
- strong narrative sense
- product shipped
- B2B wedge emerging
- now ready to turn it into a venture company

## Investor Positioning
The investor story is not:

- "I built a cool app"

It is:

- commuter pain is frequent and emotionally real
- the product solves an immediate decision-support problem
- the student wedge creates fast learning
- the institutional wedge creates monetizable insight
- the founder has already executed past the idea stage
- the stack is locked and launch-focused

It now also includes:

- onboarding is designed, not hypothetical
- the app has a clearer first-use and conversion architecture
- the company understands its legal and operational gaps more honestly
- the founder has a differentiated storytelling advantage because of the film background

## Hiring Strategy
### Immediate non-hire rule
Do not hire a conventional AE first.

### First commercial hire
Fractional Head of Partnerships with:

- university or public-sector experience
- pilot-creation skills
- institutional credibility

### Technical support
You still need one of:

- co-founder
- fractional CTO
- strong senior engineer/contractor
- high-quality technical advisor

Because once institutional work begins, solo execution bandwidth becomes the constraint.

### Advisor layer
The audit correctly highlights that the plan needs an explicit advisor network.

Ideal early advisor set:

- one UK university / student experience advisor
- one transport / TfL / mobility policy advisor
- one consumer subscription or growth advisor

## Compliance Strategy
### The immediate truth
SOC 2 is not a now problem for user launch.
It is a now problem for future B2B readiness.

### Why it matters
Institutional and enterprise buyers eventually ask for serious compliance posture.

### Plan
- start Vanta, Drata, or equivalent readiness early
- use a DPA and anonymization policy for year-1 pilot comfort
- begin the clock before bigger deals mature

### New audit corrections
The audit adds several legal/compliance items that must become explicit:

- Terms of Service must exist, not only a Privacy Policy
- calendar access must have a clear disclosed legal basis
- TfL commercial-use terms must be checked before monetized scale
- anonymisation architecture must be real, not hand-wavy

### Minimum pre-launch legal pack
- Privacy Policy
- Terms of Service
- clear calendar-permission disclosure
- calendar usage description in app config / Info.plist matching onboarding copy
- subscription terms
- push notification consent explanation

### Minimum pre-B2B legal/data pack
- DPA
- anonymisation specification
- legitimate interest / consent logic documented
- TfL usage clarification in writing if required for derived B2B data

## B2B Data Architecture Must Be Explicit
The biggest B2B hole identified in the audit is not the sales story. It is the anonymisation story.

Before serious B2B conversations, the company needs a written view on:

- what user-level data is collected
- what stays only on device
- what is aggregated
- minimum cohort sizes for reporting
- how small groups are suppressed or noise-added
- how GDPR risk is reduced

Without this, the B2B thesis is strategically interesting but operationally unsafe.

## Finance And Revenue Planning Corrections
The original plan leaned more strategic than financial. The audit adds the missing realism.

### Consumer revenue must be modeled net of platform fees
- Apple commission matters
- net revenue matters more than gross screenshots

### Retention must be cohort-based
- recurring revenue only matters if people stay
- annual subscription assumptions need retention logic underneath them

### VAT and company structure cannot stay fuzzy forever
- this is not a launch-day blocker for the product itself
- but it becomes real fast once there is recurring revenue or B2B invoicing

### Non-dilutive funding
Innovate UK or similar grants are not immediate priorities, but they are now valid medium-term options once a UK entity and some pilot evidence exist

## Operations And Support Systems
The original plan underweighted support operations. The audit is right.

### Before public scale, you need:
- a support email flow
- in-app issue reporting
- a simple incident/status communication channel
- automated crash visibility

### TfL dependency handling
TfL API dependence is not a background detail. It is core operational risk.

So the app should implement:

- backoff/retry behaviour
- cached last-known-good state
- visible last-updated timestamp
- fallback handling when the primary feed fails

### Why this matters
SOC 2 Type II takes time.
If started now, it is ready when B2B conversations get serious.

## The Solo-Founder Operating Philosophy
The correct mindset is no longer:

- build everything from scratch

It is:

- use leverage-first tools
- offload payment complexity
- offload monitoring complexity
- keep the working backend
- keep the working frontend
- spend time on UX, launch, users, GTM, and narrative

In one line:

**Own the product. Rent the plumbing.**

And also:

**Design the edge cases before the users punish you for them.**

## Founder Systems Added By The Audit
The audit surfaces founder-level issues that now belong in the master plan.

### 1. Personal brand
You should not stay invisible.

Required system:

- weekly building-in-public posts
- visible founder identity
- recurring proof of shipping

### 2. Advisor network
You should not rely only on luck for institutional access.

### 3. Burnout protection
This has to become part of the operating plan, not a side thought.

Minimum rule:

- one protected day or half-day per week
- defined "done enough" thresholds for sprints
- avoid turning every feature into a perfection spiral

### 4. Film background as an asset
This is no longer just a narrative footnote.

Use it to create:

- the product video
- the App Store preview
- founder-facing storytelling materials
- stronger build-in-public content

## Launch Philosophy
The launch goal is not to make the architecture elegant in theory.
The launch goal is to make the product reliable enough that a real user can trust it.

### What matters before launch
- onboarding works
- paywall works
- entitlement state works
- trial countdown works
- onboarding implementation matches the onboarding plan
- push logic works
- premium lockout logic works
- crash reporting works
- backend errors are visible
- app behavior under weak network is acceptable
- stale-state UX is acceptable
- legal disclosure for calendar and subscriptions exists
- review / referral / win-back strategy is at least minimally defined

### What does not matter before launch
- infrastructure purity
- framework trend chasing
- speculative backend migrations
- fancy enterprise abstractions you do not need yet
- building every growth experiment before the core loop works

## What Not To Change
1. Do not switch to Flutter.
2. Do not migrate from MongoDB/Vercel without a real blocker.
3. Do not rebuild subscriptions yourself.
4. Do not add Railway unless Vercel fails a real need.
5. Do not overcomplicate observability.
6. Do not hire an AE before founder discovery.
7. Do not let accelerator anxiety turn into stack thrash.
8. Do not treat onboarding as unresolved; implement the plan you already have.
9. Do not let stale/offline UX remain undefined.

## Launch Execution Sequence
### Phase 1: Lock architecture
- confirm Expo bare workflow and Live Activities path
- confirm notification architecture
- keep current backend and DB as source of truth
- freeze the onboarding architecture as the source of truth for first-run UX

### Phase 2: Implement onboarding and first-run UX
- implement splash handoff
- implement persisted onboarding state
- implement the 3-screen onboarding flow
- implement first empty-state / premium zero-state
- ensure permission copy explains user benefit
- implement Screen 3 as a combined calendar + notifications permissions screen
- request calendar first, then notifications

### Phase 3: Add monetization
- integrate RevenueCat
- connect RevenueCat webhook events to Vercel backend
- update premium/trial state in MongoDB
- render trial UI such as `14 Days Left`
- test restore purchase flow
- define degraded widget/premium state

### Phase 4: Add reliability
- install Sentry
- add backend logging
- verify cron visibility
- test API failures and push failures
- implement stale-data handling and visible timestamps
- implement TfL failure fallback behaviour

### Phase 5: Legal and conversion hardening
- publish Privacy Policy and Terms of Service
- add explicit calendar data disclosure
- align calendar disclosure copy across onboarding, app config, and legal docs
- define App Store rating trigger
- define basic churn recovery
- define basic referral path or defer it explicitly

### Phase 6: Harden product behavior
- test onboarding
- test premium expiry
- test cold-start app behavior
- test push delivery in real-world conditions
- test background behavior
- test permission denial paths
- test no-signal Tube scenarios

### Phase 7: Launch public beta / App Store
- ship
- observe crashes
- observe retention
- observe paywall conversion
- collect user pain signals
- monitor support issues and stale-data complaints

### Phase 8: Begin B2B learning
- founder-led discovery calls
- free Campus Transit Impact Reports
- early university conversations
- student union conversations
- define the £0 pilot and pricing model

## The First 30 Days After Locking The Stack
### Product
- finish launch-critical flows
- implement the onboarding plan, not just describe it
- eliminate major crash bugs
- ensure monetization state is trustworthy
- fix stale/offline behaviour
- define degraded premium/widget states

### Growth
- begin public building narrative
- prepare landing page on Vercel
- frame the product clearly
- begin ASO work
- prepare App Store screenshot/storytelling assets

### GTM
- book first discovery conversations with KCL/UCL-style targets
- do not sell too hard
- listen and learn
- explore student union route in parallel
- define B2B pilot packaging

### Founder
- practice the architecture explanation
- practice the founder story
- prepare EF and Antler applications
- begin building a small visible founder presence

## The 12-Month Strategic Sequence
### This week
- lock final stack
- validate Expo/Live Activities reality if still unresolved
- stop all stack thrash
- treat the onboarding plan as implementation work, not open strategy work

### Month 1
- implement onboarding and stale-state UX
- integrate RevenueCat
- install Sentry
- tighten launch flows
- begin founder-led institutional discovery
- publish minimum legal pack
- start compliance readiness thinking

### Month 2
- launch or expand beta
- deliver first free Campus Transit Impact Report
- tune notification and community thresholds
- define B2B pilot and campus pricing
- begin owned-media / weekly commute content rhythm

### Month 3
- push institutional conversations forward
- evaluate technical partner/co-founder path
- apply or continue progressing with EF/Antler
- begin advisor outreach

### Month 4-6
- secure first B2B pilot
- strengthen product reliability
- build early traction narrative
- test referral / win-back / review systems more deliberately

### Month 6-12
- deepen institutional proof
- continue compliance motion
- add second operator
- prepare for fundraising with stronger evidence
- produce stronger founder media assets, including the product film if not already done

## The Technical Interview / Architecture Answer
Here is the clean version to memorize:

> My Commute is built with React Native and Expo bare workflow. The app uses a custom animation-heavy UI with Reanimated and Expo Router. The backend is Python serverless functions on Vercel connected to MongoDB Atlas. We use TfL live data and calendar integration to drive commuter intelligence. Local caching is handled safely in-app, and notifications use a layered delivery strategy. RevenueCat manages subscriptions and entitlement state, and Sentry handles mobile crash reporting.

That answer is enough to establish:

- you understand your architecture
- you made real tradeoffs
- you are not bluffing

## The Core Founder Truth
You are not winning by pretending to be a perfect traditional engineer.
You are winning by being:

- deeply obsessed with the problem
- fast enough to ship
- technical enough to build and explain
- self-aware enough to know where you need help

That is exactly what good early-stage investors and accelerators look for.

## The Master Principle
Everything now reduces to one rule:

**Do not trade launch momentum for theoretical stack improvement.**

## Final Summary
My Commute is now a coherent company concept with a real operating path:

- the product thesis is strong
- the stack is locked
- the monetization layer is clear
- onboarding is now designed at architecture level
- the launch philosophy is realistic
- the B2B wedge is defined
- the first commercial hire is correctly reframed
- the compliance clock is understood
- the audit has exposed the real remaining gaps more honestly
- the accelerator strategy is clear
- the founder narrative is strong

Nothing important is missing conceptually anymore, but several important details still need executional definition before launch and before serious B2B scale.

The challenge is no longer:

- what should this company be?

The challenge is now:

- can you execute the next 90 days without distracting yourself, while closing the real launch, legal, and operations gaps the audit exposed?

That is the game.
