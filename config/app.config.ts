// frontend/config/app.config.ts
// Unified Railway backend configuration.

export const APP_CONFIG = {
  // Primary Railway backend (Next.js/Neon/Drizzle) — line status, stations, sessions, claims, refunds
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || "https://my-commute-backend-v2-production.up.railway.app",
  BACKEND_API_URL: process.env.EXPO_PUBLIC_BACKEND_API_URL || "https://my-commute-backend-v2-production.up.railway.app",
  API_TIMEOUT: 10000,
  APP_GROUP_ID: "group.com.mycommute.app",
} as const;

export default APP_CONFIG;
