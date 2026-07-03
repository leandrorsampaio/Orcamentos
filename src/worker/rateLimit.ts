// Abuse control: per-IP login lockout + sliding-window rate limiting, backed
// by D1 (BUILD_SPEC §8). Cheap and good enough for a single-user app; the
// Cloudflare dashboard Rate Limiting rule + Bot Fight Mode are the outer layer.

import type { Env } from "./env";

const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // count fails within 15 min
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // lock for 15 min after too many fails

export function getClientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
}

export interface LimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/** Is this IP currently allowed to attempt a login? */
export async function checkLoginAllowed(env: Env, ip: string, now: number): Promise<LimitResult> {
  const row = await env.DB
    .prepare("SELECT fails, locked_until, window_start FROM login_attempts WHERE ip = ?")
    .bind(ip)
    .first<{ fails: number; locked_until: number | null; window_start: number | null }>();
  if (row?.locked_until && row.locked_until > now) {
    return { allowed: false, retryAfterSec: Math.ceil((row.locked_until - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function recordLoginFail(env: Env, ip: string, now: number): Promise<void> {
  const row = await env.DB
    .prepare("SELECT fails, window_start FROM login_attempts WHERE ip = ?")
    .bind(ip)
    .first<{ fails: number; window_start: number | null }>();

  let fails = 1;
  let windowStart = now;
  if (row && row.window_start && now - row.window_start < LOGIN_WINDOW_MS) {
    fails = row.fails + 1;
    windowStart = row.window_start;
  }
  const lockedUntil = fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCKOUT_MS : null;

  await env.DB
    .prepare(
      `INSERT INTO login_attempts (ip, fails, locked_until, window_start)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET fails = ?, locked_until = ?, window_start = ?`,
    )
    .bind(ip, fails, lockedUntil, windowStart, fails, lockedUntil, windowStart)
    .run();
}

export async function recordLoginSuccess(env: Env, ip: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}

/**
 * Generic sliding-window limiter. Returns allowed=false with Retry-After when
 * the bucket exceeds `limit` requests within `windowMs`.
 */
export async function rateLimit(
  env: Env,
  bucket: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<LimitResult> {
  const row = await env.DB
    .prepare("SELECT count, reset_at FROM rate_limits WHERE bucket = ?")
    .bind(bucket)
    .first<{ count: number; reset_at: number }>();

  if (!row || row.reset_at <= now) {
    await env.DB
      .prepare(
        `INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = ?`,
      )
      .bind(bucket, now + windowMs, now + windowMs)
      .run();
    return { allowed: true, retryAfterSec: 0 };
  }

  if (row.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
  }

  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket = ?").bind(bucket).run();
  return { allowed: true, retryAfterSec: 0 };
}
