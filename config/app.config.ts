// frontend/config/app.config.ts
// Unified Railway backend configuration.

export const APP_CONFIG = {
  // Primary Railway backend (Next.js/Neon/Drizzle) — line status, stations, sessions, claims, refunds
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL || "https://backend-iota-eight-21.vercel.app",
  BACKEND_API_URL: process.env.EXPO_PUBLIC_BACKEND_API_URL || "https://backend-iota-eight-21.vercel.app",
  API_TIMEOUT: 10000,
  APP_GROUP_ID: "group.com.mycommute.app",
} as const;

export default APP_CONFIG;
