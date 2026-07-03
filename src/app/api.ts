// Typed fetch wrappers for the Worker API.

import type { Orcamento, OrcamentoInput, OrcamentoListItem } from "../shared/types";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error((data.message as string) || (data.error as string) || `HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = data.error as string;
    throw err;
  }
  return data as T;
}

export const api = {
  session: () => req<{ authed: boolean }>("GET", "/api/session"),
  login: (password: string) => req<{ ok: true }>("POST", "/api/login", { password }),
  logout: () => req<{ ok: true }>("POST", "/api/logout"),

  list: (archived: boolean) =>
    req<{ orcamentos: OrcamentoListItem[] }>("GET", `/api/orcamentos${archived ? "?archived=1" : ""}`),
  get: (id: string) => req<{ orcamento: Orcamento }>("GET", `/api/orcamentos/${id}`),
  create: (input: OrcamentoInput) => req<{ orcamento: Orcamento }>("POST", "/api/orcamentos", input),
  update: (id: string, input: OrcamentoInput) =>
    req<{ orcamento: Orcamento }>("PUT", `/api/orcamentos/${id}`, input),
  copy: (id: string) => req<{ orcamento: Orcamento }>("POST", `/api/orcamentos/${id}/copy`),
  archive: (id: string, status: "ativo" | "arquivado") =>
    req<{ orcamento: Orcamento }>("POST", `/api/orcamentos/${id}/archive`, { status }),
  remove: (id: string) => req<{ ok: true }>("DELETE", `/api/orcamentos/${id}`),
  revokeLink: (id: string) => req<{ orcamento: Orcamento }>("POST", `/api/orcamentos/${id}/revoke-link`),
  sendEmail: (payload: { to: string; subject: string; body: string; pdfBase64: string; nome: string }) =>
    req<{ ok: true }>("POST", "/api/send-email", payload),
};
