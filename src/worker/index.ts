// Worker entry: API + public share page + static SPA delegation.
// run_worker_first is enabled, so every request lands here first.

import { Hono } from "hono";
import type { Env } from "./env";
import {
  clearCookieHeader,
  createSessionToken,
  isAuthed,
  sessionCookieHeader,
  timingSafeEqual,
} from "./auth";
import {
  checkLoginAllowed,
  getClientIp,
  rateLimit,
  recordLoginFail,
  recordLoginSuccess,
} from "./rateLimit";
import {
  copyOrcamento,
  createOrcamento,
  deleteOrcamento,
  getById,
  getByShareId,
  listOrcamentos,
  revokeLink,
  setStatus,
  updateOrcamento,
} from "./db";
import { renderNotFoundPage, renderPublicPage } from "./publicPage";
import type { OrcamentoInput } from "../shared/types";
import { sendOrcamentoEmail } from "./email";

const app = new Hono<{ Bindings: Env }>();

const now = () => Date.now();

// ---- Public share page (no auth). Edge-cacheable, generic 404. ----
app.get("/o/:shareId", async (c) => {
  const o = await getByShareId(c.env, c.req.param("shareId"));
  if (!o) {
    return c.html(renderNotFoundPage(), 404, { "Cache-Control": "no-store" });
  }
  return c.html(renderPublicPage(o), 200, {
    // absorbed by the Cloudflare edge; busted by the short TTL after edits/revoke
    "Cache-Control": "public, max-age=300, s-maxage=600",
    "X-Robots-Tag": "noindex, nofollow",
  });
});

// ---- Auth endpoints ----
app.post("/api/login", async (c) => {
  const ip = getClientIp(c.req.raw);
  const gate = await checkLoginAllowed(c.env, ip, now());
  if (!gate.allowed) {
    return c.json({ error: "locked", message: "Muitas tentativas. Tente novamente mais tarde." }, 429, {
      "Retry-After": String(gate.retryAfterSec),
    });
  }
  const limit = await rateLimit(c.env, `login:${ip}`, 20, 60_000, now());
  if (!limit.allowed) {
    return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfterSec) });
  }

  let password = "";
  try {
    const body = (await c.req.json()) as { password?: string };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  if (!c.env.APP_PASSWORD || !timingSafeEqual(password, c.env.APP_PASSWORD)) {
    await recordLoginFail(c.env, ip, now());
    return c.json({ error: "invalid", message: "Senha incorreta. Tente novamente." }, 401);
  }

  await recordLoginSuccess(c.env, ip);
  const token = await createSessionToken(c.env, now());
  return c.json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader(token) });
});

app.post("/api/logout", (c) => {
  return c.json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader() });
});

app.get("/api/session", async (c) => {
  return c.json({ authed: await isAuthed(c.req.raw, c.env, now()) });
});

// ---- Auth gate for the rest of /api/* ----
app.use("/api/*", async (c, next) => {
  const p = c.req.path;
  if (p === "/api/login" || p === "/api/logout" || p === "/api/session") return next();
  if (!(await isAuthed(c.req.raw, c.env, now()))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

// ---- Orçamentos CRUD ----
app.get("/api/orcamentos", async (c) => {
  const includeArchived = c.req.query("archived") === "1";
  return c.json({ orcamentos: await listOrcamentos(c.env, includeArchived) });
});

app.get("/api/orcamentos/:id", async (c) => {
  const o = await getById(c.env, c.req.param("id"));
  if (!o) return c.json({ error: "not_found" }, 404);
  return c.json({ orcamento: o });
});

app.post("/api/orcamentos", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as OrcamentoInput;
  return c.json({ orcamento: await createOrcamento(c.env, input) }, 201);
});

app.put("/api/orcamentos/:id", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as OrcamentoInput;
  const o = await updateOrcamento(c.env, c.req.param("id"), input);
  if (!o) return c.json({ error: "not_found" }, 404);
  return c.json({ orcamento: o });
});

app.post("/api/orcamentos/:id/copy", async (c) => {
  const o = await copyOrcamento(c.env, c.req.param("id"));
  if (!o) return c.json({ error: "not_found" }, 404);
  return c.json({ orcamento: o }, 201);
});

app.post("/api/orcamentos/:id/archive", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { status?: string };
  const status = body.status === "ativo" ? "ativo" : "arquivado";
  const o = await setStatus(c.env, c.req.param("id"), status);
  if (!o) return c.json({ error: "not_found" }, 404);
  return c.json({ orcamento: o });
});

app.delete("/api/orcamentos/:id", async (c) => {
  const removed = await deleteOrcamento(c.env, c.req.param("id"));
  if (removed === 0) {
    // not found OR not archived — deleting is only allowed after archiving
    return c.json({ error: "not_deletable", message: "Só é possível apagar um orçamento arquivado." }, 409);
  }
  return c.json({ ok: true });
});

app.post("/api/orcamentos/:id/revoke-link", async (c) => {
  const o = await revokeLink(c.env, c.req.param("id"));
  if (!o) return c.json({ error: "not_found" }, 404);
  return c.json({ orcamento: o });
});

// ---- E-mail (Resend). Auth-gated + strict rate limit. ----
app.post("/api/send-email", async (c) => {
  const ip = getClientIp(c.req.raw);
  const limit = await rateLimit(c.env, `email:${ip}`, 10, 60 * 60_000, now()); // 10/hour/IP
  if (!limit.allowed) {
    return c.json({ error: "rate_limited", message: "Limite de envios atingido. Tente mais tarde." }, 429, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
    body?: string;
    pdfBase64?: string;
    nome?: string;
  };
  const result = await sendOrcamentoEmail(c.env, body);
  if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status);
  return c.json({ ok: true });
});

// ---- Static SPA (everything else) ----
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404 && c.req.method === "GET" && (c.req.header("Accept") || "").includes("text/html")) {
    const url = new URL(c.req.url);
    url.pathname = "/";
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }
  return res;
});

export default app;
