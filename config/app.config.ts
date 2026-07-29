export const APP_CONFIG = {
  // Push brain (FastAPI/MongoDB) — line status, stations, sessions, profile, push
  BACKEND_URL: "https://my-commute-brain.vercel.app",
  // Next.js backend (Neon/Drizzle) — claims, eligibility, refunds
  BACKEND_API_URL: "@url:`https://my-commute-backend.vercel.app`",
  API_TIMEOUT: 10000,
  APP_GROUP_ID: "group.com.mycommute.app",
} as const;

export default APP_CONFIG;
