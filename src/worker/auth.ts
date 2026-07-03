// Single-user auth: one shared password → an HMAC-signed session cookie.
// The password is never stored client-side; the cookie is the only token.
// (BUILD_SPEC §8 Auth protection.)

import { Env, SESSION_COOKIE, SESSION_TTL_MS } from "./env";

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buf(s: string): BufferSource {
  return new TextEncoder().encode(s) as unknown as BufferSource;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", buf(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Constant-time comparison of two strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // compare against max length so length itself doesn't short-circuit timing
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Create a signed session token that expires `SESSION_TTL_MS` from now. */
export async function createSessionToken(env: Env, nowMs: number): Promise<string> {
  const payload = JSON.stringify({ v: 1, exp: nowMs + SESSION_TTL_MS });
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payload));
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf(payloadB64)));
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/** Verify a token's signature and expiry. */
export async function verifySessionToken(env: Env, token: string, nowMs: number): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(env.SESSION_SECRET);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64) as unknown as BufferSource,
      buf(payloadB64),
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > nowMs;
  } catch {
    return false;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** True if the request carries a valid session cookie. */
export async function isAuthed(req: Request, env: Env, nowMs: number): Promise<boolean> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return false;
  return verifySessionToken(env, token, nowMs);
}
