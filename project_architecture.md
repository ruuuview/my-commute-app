# MY COMMUTE - PROJECT ARCHITECTURE & CONTEXT

- App: "My Commute" — Live London Underground navigation for London commuters.
- UX Philosophy: Dark (#050505), cinematic, premium aesthetic with high
  interactivity (jiggle modes).
- Backend: Vercel (<https://my-commute-backend.vercel.app>) using Python,
  FastAPI, and motor.
- Critical Fixes: Locked pymongo==4.6.1; fixed circular imports in
  notification_service.py.
- Frontend: React Native / Expo (Managed Workflow) using Zustand for state
  in [userPreferencesStore.ts](file:///Users/ruuuview/Desktop/my%20commute%20project%20folder/frontend/store/userPreferencesStore.ts).
- APNS: Direct Apple Push via .p8 key content (no Firebase).
- Current Task: Build app/onboarding/lines.tsx line selection grid with
  jiggle-mode feedback.
