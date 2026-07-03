export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  // secrets
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  // vars
  EMAIL_FROM?: string;
  PUBLIC_BASE_URL: string;
}

export const SESSION_COOKIE = "sess";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
