PROJECT MEMORY: MY COMMUTE
1. Core Project Identity
App Name: My Commute.  

Mission: A high-end, cinematic London Underground navigation app that provides background push notifications for line disruptions.  

Workflow: Vibe Coding — AI must provide complete, copy-pasteable files, not snippets or partial replacements.  

2. Backend Architecture (LIVE)
URL: [https://my-commute-brain.vercel.app](https://my-commute-brain.vercel.app).

Status: Verified "online" and "tfl_connected: true".

Stack: Python 3.12 (FastAPI), MongoDB (Motor/Pymongo), Vercel Serverless.  

Critical Fixes (Do Not Revert):

Dependency Locking: pymongo is strictly locked to version 4.6.1 to prevent ImportError crashes in the motor library.

Circular Import Fix: The _severity_to_visuals mapping is duplicated inside notification_service.py to prevent it from trying to import back from api/index.py.

APNS: Uses direct Apple Push Notification Service (no Firebase) via .p8 key content injected as the APNS_KEY_CONTENT environment variable.  

3. Frontend Architecture (IN-PROGRESS)
Stack: React Native / Expo (Managed Workflow).  

State Management: Zustand (located in store/userPreferencesStore.ts).  

Animation: react-native-reanimated for all cinematic transitions.

UI/UX Philosophy:

Color Palette: Deep Premium Black (#050505).

Vibe: Dark mode, minimalist, high-end letter spacing, and smooth fade-in/fade-out transitions.

4. Progress Tracking
[COMPLETED] Vercel Backend deployment and TfL API integration.

[COMPLETED] Cinematic app/splash.tsx with high-end fade animations.

[CURRENT TASK] Building app/onboarding/lines.tsx — an interactive grid for selecting favorite tube lines with "jiggle mode" feedback.
Building app/onboarding/lines.tsx.

Logic: Once the user selects lines and hits "Continue," the app must update the onboardingComplete flag in the Zustand store to true and route them to the main (tabs) dashboard.