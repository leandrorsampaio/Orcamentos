-- Sistema de Orçamentos — schema (BUILD_SPEC §5)
-- Money is stored as integer centavos inside itens_json. No PDFs are stored.

CREATE TABLE IF NOT EXISTS orcamentos (
  id          TEXT PRIMARY KEY,      -- internal random id
  numero      INTEGER UNIQUE,        -- human sequential number (Orçamento nº N)
  share_id    TEXT UNIQUE,           -- public unguessable id; NULL when link revoked
  nome        TEXT NOT NULL,         -- "Nome do orçamento"
  cliente     TEXT,
  endereco    TEXT,
  data_iso    TEXT,                  -- ISO date (YYYY-MM-DD) shown on the doc
  itens_json  TEXT NOT NULL,         -- JSON array [{descricao, valor_centavos}]
  prazo       TEXT,
  cond_pag    TEXT DEFAULT '50% de sinal, 50% na entrega',
  observacoes TEXT DEFAULT 'Material entregue e instalado no local\nValidade da proposta 10 dias',
  header_key  TEXT DEFAULT 'lvi',    -- 'lvi' | 'stilus'
  status      TEXT DEFAULT 'ativo',  -- 'ativo' | 'arquivado'
  created_at  TEXT,
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_status_updated
  ON orcamentos (status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_share
  ON orcamentos (share_id);

-- Atomic human-friendly sequential counter for `numero`.
CREATE TABLE IF NOT EXISTS counters ( name TEXT PRIMARY KEY, value INTEGER );
INSERT OR IGNORE INTO counters (name, value) VALUES ('numero', 0);

-- Per-IP login throttling / lockout state (BUILD_SPEC §8).
CREATE TABLE IF NOT EXISTS login_attempts (
  ip            TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,             -- epoch ms; NULL when not locked
  window_start  INTEGER              -- epoch ms of the current counting window
);

-- Sliding-window rate limiting for sensitive endpoints (login, send-email).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket    TEXT PRIMARY KEY,        -- e.g. "email:1.2.3.4" or "login:1.2.3.4"
  count     INTEGER NOT NULL DEFAULT 0,
  reset_at  INTEGER NOT NULL         -- epoch ms when the window resets
);
