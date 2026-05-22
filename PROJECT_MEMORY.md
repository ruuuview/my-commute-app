PROJECT MEMORY: MY COMMUTE

1. Core Project Identity
App Name: My Commute.  
Mission: A high-end, cinematic London Underground navigation app that provides background push notifications for line disruptions.  
Workflow: Vibe Coding — AI must provide complete, copy-pasteable files, not snippets or partial replacements.  

2. Current Documentation & Strategy Authority
- Strategy & Rules: `MY_COMMUTE_MASTER_PLAN_v2 (1).md`
- Execution Authority: `MY_COMMUTE_EXECUTION_PLAN_v4.4.md`
- Infrastructure: `MY_COMMUTE_INFRASTRUCTURE_v4.4.md`
- UX/UI: `MY_COMMUTE_UX_PLAN_v4.4.md`

3. Backend Architecture (LIVE)
URL: [https://my-commute-brain.vercel.app](https://my-commute-brain.vercel.app).
Status: Verified "online" and "tfl_connected: true".
Stack: Python 3.12 (FastAPI), MongoDB (Motor/Pymongo), Vercel Serverless.  

Critical Fixes (Do Not Revert):
Dependency Locking: pymongo is strictly locked to version 4.6.1 to prevent ImportError crashes in the motor library.
Circular Import Fix: The _severity_to_visuals mapping is duplicated inside notification_service.py to prevent it from trying to import back from api/index.py.
APNS: Uses direct Apple Push Notification Service (no Firebase) via .p8 key content injected as the APNS_KEY_CONTENT environment variable.  

4. Frontend Architecture (IN-PROGRESS)
Stack: React Native / Expo (Managed Workflow).  
State Management: Zustand (located in store/userPreferencesStore.ts) + React Native MMKV.  
Animation: react-native-reanimated for all cinematic transitions.

UI/UX Philosophy (The Foyer & The Void):
Color Palette: Deep Premium Black (#0A0A0F) with grain overlay for depth.
Vibe: Dark mode, minimalist, high-end letter spacing (-0.5 SpaceGrotesk-Bold), and smooth fade-in/fade-out transitions.

5. Progress Tracking (Execution Plan v4.4)
[COMPLETED] Vercel Backend deployment and TfL API integration.
[COMPLETED] Cinematic app/splash.tsx with high-end fade animations.
[COMPLETED] Step 1: Upgraded the MMKV/Zustand Brain (store/userPreferencesStore.ts).
[COMPLETED] Step 2: The Global "Void" Background (components/VoidBackground.tsx) with dynamic ambient gradients.

[COMPLETED] Step 3: Building app/onboarding/lines.tsx — an interactive grid for selecting favorite tube lines with staggered fade-in animations and accessible pills.
[COMPLETED] Step 4: The Refinement (Station Pinning with Fuse.js) — app/onboarding/stations.tsx using a dynamically fetched dataset of 801 stations and FlashList.

[CURRENT TASK] Step 5: The Superpowers (Permissions & Personalization) — app/onboarding/permissions.tsx.

Logic: Present the calendar disclosure and then the notifications step, enforcing the correct order before finalizing the transition to the dashboard.