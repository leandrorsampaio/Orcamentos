// D1 data access. Money stays as integer centavos inside itens_json.

import type { Env } from "./env";
import type { HeaderKey, Orcamento, OrcamentoInput, OrcamentoItem, OrcamentoListItem, Status } from "../shared/types";
import { OBSERVACOES_PADRAO } from "../shared/orcamento";
import { todayIsoSaoPaulo } from "../shared/date";

interface Row {
  id: string;
  numero: number | null;
  share_id: string | null;
  nome: string;
  cliente: string | null;
  endereco: string | null;
  data_iso: string | null;
  itens_json: string;
  prazo: string | null;
  cond_pag: string | null;
  observacoes: string | null;
  header_key: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const SHARE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** 22-char id over [A-Za-z0-9_-] → ~131 bits entropy (BUILD_SPEC §9). */
export function genShareId(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += SHARE_ALPHABET[b & 63];
  return out;
}

function genId(): string {
  return crypto.randomUUID();
}

// One item, normalized. `a_combinar` is only written when true (so older
// items keep their JSON shape) and such an item never carries a value.
function cleanItem(i: Partial<OrcamentoItem> | null | undefined): OrcamentoItem {
  const descricao = typeof i?.descricao === "string" ? i.descricao : "";
  if (i?.a_combinar === true) return { descricao, valor_centavos: 0, a_combinar: true };
  const v = i?.valor_centavos;
  return { descricao, valor_centavos: typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0 };
}

function parseItens(json: string): OrcamentoItem[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(cleanItem)
      .filter((i) => i.descricao.trim() !== "" || i.valor_centavos !== 0 || i.a_combinar);
  } catch {
    return [];
  }
}

function rowToOrcamento(r: Row): Orcamento {
  return {
    id: r.id,
    numero: r.numero,
    share_id: r.share_id,
    nome: r.nome,
    cliente: r.cliente,
    endereco: r.endereco,
    data_iso: r.data_iso,
    itens: parseItens(r.itens_json),
    prazo: r.prazo,
    cond_pag: r.cond_pag,
    observacoes: r.observacoes,
    header_key: (r.header_key === "stilus" ? "stilus" : "lvi") as HeaderKey,
    status: (r.status === "arquivado" ? "arquivado" : "ativo") as Status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function sanitizeItens(itens: OrcamentoItem[] | undefined): OrcamentoItem[] {
  if (!Array.isArray(itens)) return [];
  return itens.map(cleanItem);
}

/** Atomically allocate the next human sequential number (one statement, so
 *  two creates at the same moment can't read the same value). */
async function nextNumero(env: Env): Promise<number> {
  const row = await env.DB
    .prepare("UPDATE counters SET value = value + 1 WHERE name = 'numero' RETURNING value")
    .first<{ value: number }>();
  if (!row) throw new Error("counter 'numero' missing");
  return row.value;
}

export async function listOrcamentos(env: Env, includeArchived: boolean): Promise<OrcamentoListItem[]> {
  const sql = includeArchived
    ? "SELECT id, numero, nome, cliente, data_iso, updated_at, status FROM orcamentos ORDER BY updated_at DESC"
    : "SELECT id, numero, nome, cliente, data_iso, updated_at, status FROM orcamentos WHERE status = 'ativo' ORDER BY updated_at DESC";
  const res = await env.DB.prepare(sql).all<OrcamentoListItem>();
  return res.results ?? [];
}

export async function getById(env: Env, id: string): Promise<Orcamento | null> {
  const row = await env.DB.prepare("SELECT * FROM orcamentos WHERE id = ?").bind(id).first<Row>();
  return row ? rowToOrcamento(row) : null;
}

/** Public lookup: exact share_id, only active records (revoked/archived → null). */
export async function getByShareId(env: Env, shareId: string): Promise<Orcamento | null> {
  if (!shareId) return null;
  const row = await env.DB
    .prepare("SELECT * FROM orcamentos WHERE share_id = ? AND status = 'ativo'")
    .bind(shareId)
    .first<Row>();
  return row ? rowToOrcamento(row) : null;
}

export async function createOrcamento(env: Env, input: OrcamentoInput): Promise<Orcamento> {
  const now = new Date().toISOString();
  const id = genId();
  const numero = await nextNumero(env);
  const shareId = genShareId();
  const nome = (input.nome ?? "").trim() || `Orçamento nº ${numero}`;
  const condPag = input.cond_pag === undefined ? "50% de sinal, 50% na entrega" : input.cond_pag;
  const observacoes = input.observacoes === undefined ? OBSERVACOES_PADRAO : input.observacoes;
  const headerKey: HeaderKey = input.header_key === "stilus" ? "stilus" : "lvi";

  await env.DB.prepare(
    `INSERT INTO orcamentos
      (id, numero, share_id, nome, cliente, endereco, data_iso, itens_json, prazo, cond_pag, observacoes, header_key, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'ativo', ?, ?)`,
  )
    .bind(
      id,
      numero,
      shareId,
      nome,
      input.cliente ?? null,
      input.endereco ?? null,
      input.data_iso ?? null,
      JSON.stringify(sanitizeItens(input.itens)),
      input.prazo ?? null,
      condPag,
      observacoes,
      headerKey,
      now,
      now,
    )
    .run();

  const created = await getById(env, id);
  if (!created) throw new Error("failed to create");
  return created;
}

export async function updateOrcamento(env: Env, id: string, input: OrcamentoInput): Promise<Orcamento | null> {
  const existing = await getById(env, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const nome = input.nome !== undefined ? (input.nome.trim() || existing.nome) : existing.nome;

  await env.DB.prepare(
    `UPDATE orcamentos SET
       nome = ?, cliente = ?, endereco = ?, data_iso = ?, itens_json = ?,
       prazo = ?, cond_pag = ?, observacoes = ?, header_key = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      nome,
      input.cliente !== undefined ? input.cliente : existing.cliente,
      input.endereco !== undefined ? input.endereco : existing.endereco,
      input.data_iso !== undefined ? input.data_iso : existing.data_iso,
      JSON.stringify(input.itens !== undefined ? sanitizeItens(input.itens) : existing.itens),
      input.prazo !== undefined ? input.prazo : existing.prazo,
      input.cond_pag !== undefined ? input.cond_pag : existing.cond_pag,
      input.observacoes !== undefined ? input.observacoes : existing.observacoes,
      input.header_key !== undefined ? (input.header_key === "stilus" ? "stilus" : "lvi") : existing.header_key,
      now,
      id,
    )
    .run();

  return getById(env, id);
}

export async function copyOrcamento(env: Env, id: string): Promise<Orcamento | null> {
  const src = await getById(env, id);
  if (!src) return null;
  return createOrcamento(env, {
    nome: `${src.nome} (cópia)`,
    cliente: src.cliente,
    endereco: src.endereco,
    data_iso: todayIsoSaoPaulo(), // not toISOString(): that is UTC, tomorrow after 21:00 in Brazil
    itens: src.itens,
    prazo: src.prazo,
    cond_pag: src.cond_pag,
    observacoes: src.observacoes,
    header_key: src.header_key,
  });
}

export async function setStatus(env: Env, id: string, status: Status): Promise<Orcamento | null> {
  const existing = await getById(env, id);
  if (!existing) return null;
  await env.DB.prepare("UPDATE orcamentos SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id)
    .run();
  return getById(env, id);
}

/** Permanently delete — only allowed for archived records. Returns rows removed. */
export async function deleteOrcamento(env: Env, id: string): Promise<number> {
  const res = await env.DB.prepare("DELETE FROM orcamentos WHERE id = ? AND status = 'arquivado'").bind(id).run();
  return res.meta?.changes ?? 0;
}

/** Rotate the share link to a fresh unguessable id (kills any leaked URL). */
export async function revokeLink(env: Env, id: string): Promise<Orcamento | null> {
  const existing = await getById(env, id);
  if (!existing) return null;
  await env.DB.prepare("UPDATE orcamentos SET share_id = ?, updated_at = ? WHERE id = ?")
    .bind(genShareId(), new Date().toISOString(), id)
    .run();
  return getById(env, id);
}
