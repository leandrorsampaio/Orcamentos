# Sistema de Orçamentos — LVI Planejados / Stilus Decora

A tiny web app for **one** non-technical user (the owner's elderly father, a
marceneiro) to create, save, reprint, and re-send woodworking quotes
("orçamentos") as a fixed, branded PDF. Everything runs on the **Cloudflare
Free plan** and is deployed at **https://orcamento.lsampaio.dev**.

> This README is the single place to (re)load full context. If you are an LLM or
> a new engineer picking this up: read this file top to bottom, then
> [`plan/BUILD_SPEC_orcamentos.md`](plan/BUILD_SPEC_orcamentos.md) for the
> original brief and [`DEPLOY.md`](DEPLOY.md) for deployment. All user-facing
> text is **Brazilian Portuguese**; keep it that way.

---

## 1. Who uses it & the guiding principle

- **Exactly one human user**, gated by **one shared password** (no accounts, no
  roles). He is elderly, non-technical, and works **mostly on a phone**.
- Every UX decision bends toward **maximum simplicity**: two screens only, big
  touch targets, almost every field optional, autosave, live preview, forgiving
  money input, plain PT-BR labels.

## 2. What it does (two screens)

- **Lista** (`/`) — list of orçamentos, `+ Novo orçamento`, search, and an
  "Arquivados" section. Archived items can be permanently deleted.
- **Editor** (`/e/:id`) — a **structured form** (never a rich-text editor) that
  renders into the fixed PDF layout, with a **live PDF preview**.
- **Public share page** (`/o/:shareId`) — server-rendered, read-only, with a
  "Baixar PDF" button. This is the WhatsApp share target.

## 3. Architecture & why

| Concern | Choice | Why |
|---|---|---|
| Hosting/API | One **Cloudflare Worker** (Hono) that also serves the static SPA (Workers Static Assets, `run_worker_first`) | Free, one deploy, custom domain |
| DB | **D1** (SQLite) | Free tier; stores orçamento **data only** |
| PDF | Generated **in the browser** with `pdf-lib` | Server-side PDF needs the paid plan; browser-side is free + deterministic |
| Stored files | **NONE** (no R2, no stored PDFs) | The PDF is regenerated from D1 data on demand → removes an entire cost/abuse surface |
| Email | **Resend** API called from the Worker, PDF sent as base64 attachment | Free tier, supports attachments; optional |
| Auth | One shared password → HMAC-signed `HttpOnly` cookie | Simplest gate for a single user |

**The central rule: the PDF is never a stored artifact.** The editor preview,
the download, and the public page all call the same `src/render/pdf.ts` to
regenerate the identical PDF from the orçamento's JSON. There is no URL that
returns a stored PDF file.

## 4. Tech stack

- **Frontend:** Vanilla TypeScript + Vite (no framework — the UI is a tiny
  hand-rolled `h()`/`mount()` renderer in `src/app/ui.ts`). Two-screen history
  router in `src/app/main.ts`.
- **Backend:** Cloudflare Worker with **Hono** (`src/worker/index.ts`).
- **PDF:** `pdf-lib`. **Money:** integer centavos everywhere.
- **Build:** `vite build` → `dist/`; the Worker serves `dist/` via the `ASSETS`
  binding. `wrangler` for dev/deploy.

## 5. Repo layout (file by file)

```
src/
  shared/                 pure logic shared by Worker + SPA + render
    types.ts              Orcamento / OrcamentoItem / input types
    money.ts              parseCentavos (forgiving) + formatCentavos/formatBRL
    date.ts               todayIso() + formatDataExtenso() ("São Paulo, DD de <mês> de AAAA")
    orcamento.ts          item numbering, total, "show TOTAL when >=2 items", isSendable
  render/
    pdf.ts                THE PDF geometry — pdf-lib port of plan/reference/layout_reference.py
  worker/
    index.ts              Hono app: /api/*, /o/:shareId, static-asset delegation
    env.ts                Env bindings + session constants
    auth.ts               HMAC session cookie, timing-safe compare, cookie helpers
    db.ts                 D1 access; genShareId (CSPRNG), CRUD, copy, archive, delete, revoke
    rateLimit.ts          per-IP login lockout + sliding-window limiter (D1-backed)
    publicPage.ts         server-rendered HTML for /o/:shareId (+ generic 404)
    email.ts              Resend send with PDF attachment
  app/
    main.ts               bootstrap + router (lista / editor) + logout
    styles.css            design tokens + all component styles (mobile-first)
    api.ts                typed fetch wrappers
    pdf-client.ts         browser PDF: bytes/blobUrl/download/print/base64 (+ logo fetch)
    ui.ts                 h(), mount(), confirmDialog(), shortDate()
    views/login.ts        login screen
    views/lista.ts        Lista screen (active + archived, delete)
    views/editor.ts       Editor: form, autosave, live preview, share/send actions
  public-share/main.ts    the /share.js bundle: wires the public page's "Baixar PDF"
migrations/0001_init.sql  D1 schema (orcamentos, counters, login_attempts, rate_limits)
public/logo_final.png     bundled logo (also copied to dist)
index.html                SPA entry (app routes)
wrangler.jsonc            Worker + D1 + assets config
vite.config.ts            two entries: main (SPA) + share (stable /share.js name)
```

## 6. Data model (D1)

`orcamentos(id, numero, share_id, nome, cliente, endereco, data_iso,
itens_json, prazo, cond_pag, header_key, status, created_at, updated_at)` plus
`counters` (atomic `numero`), `login_attempts`, `rate_limits`. See
`migrations/0001_init.sql`. Items live as JSON `[{descricao, valor_centavos}]`.

## 7. Domain rules that matter

- **Money is integer centavos** everywhere; formatted to `R$ x.xxx,xx` only at
  render. `parseCentavos` accepts `6400`, `6.400`, `6400,00`, `6.400,00`,
  `R$ 6.400,00` (comma = decimals, dots = thousands).
- **Almost everything is optional.** Only "≥ 1 item with a value" is truly
  needed. Blank fields are simply omitted from the PDF and never block saving.
- **Item numbers** are auto `01, 02, …` in output; the user types only the
  description text.
- **TOTAL line** prints only when there are **≥ 2 items** (`shouldShowTotal`).
- **Date** defaults to today (`data_iso`) and is persisted on open.
- **Header** is always **LVI Planejados** (`header_key = 'lvi'`). The `stilus`
  header exists in code but there is no UI selector (removed by request).
- **numero** (human, sequential) and **share_id** (secret) are decoupled.

## 8. The PDF layout (highest-risk part)

`src/render/pdf.ts` is a faithful port of `plan/reference/layout_reference.py`
(reportlab). Both use a bottom-left origin, y-up, and Helvetica standard
metrics, so the geometry ports ~1:1 (A4, ~2cm margins, logo top-left, company
block top-right, centered bold date, `Cliente:`/`Endereço:`, wrapped bold item
lines with dotted `valor` leaders, `TOTAL`, footer, two signature lines).
**Acceptance = visual match** against `plan/reference/*.pdf` (validated against
Edson). `enc()` normalizes text to WinAnsi so PT-BR accents render and nothing
crashes the font encoder. If you change geometry, re-diff against the samples.

## 9. Security & cost control (priority)

- **No stored PDFs / no R2** → no file endpoint to hammer for cost. Free plan =
  hard limits, **no overage billing**.
- **Public page is edge-cached** (`s-maxage=600`); a link flood is absorbed by
  the CDN.
- **share_id** = 22-char CSPRNG (~131 bits), never sequential. `/o/:shareId`
  returns the **same generic 404** for missing/revoked/archived (no
  enumeration). `revoke-link` rotates the id, instantly killing a leaked URL.
- **Login** is constant-time compared, rate-limited, and locks an IP for 15 min
  after 5 fails. All `/api/*` except login/logout/session require the signed
  cookie.
- **Delete** is only allowed on **archived** records — enforced in the SQL
  (`DELETE ... WHERE status='arquivado'`), not just the UI.
- **Email endpoint** is auth-gated + capped (10/hour/IP) so it can't burn the
  Resend quota.

## 10. UX decisions already made (don't "fix" these by accident)

- Editor is grouped into titled **section cards** (Dados / Itens / Prazo e
  pagamento / Enviar orçamento) on a slightly darker background so white cards
  pop; 2px borders.
- **"Adicionar item"** sits directly below the item list (not a sticky bar).
- **"Fazer uma cópia"** is in the editor top toolbar; **"+ Novo orçamento"** is
  in the Lista top bar beside "Sair".
- **Live preview is always on** ("Como vai ficar" panel + "🔄 Atualizar"
  button); it also auto-refreshes ~0.7s after edits. The preview iframe opens
  with `#navpanes=0&pagemode=none` to keep the PDF thumbnail sidebar collapsed.
- **Responsive editor:** single column (form on top, preview below, capped
  ~960px) up to **1400px**; only at **≥1400px** does it go side-by-side with a
  fixed **900px** form + sticky preview. (Deliberately no cramped middle zone.)
- Archived orçamentos render in a separate, visually-recessed section at the
  bottom of the Lista, revealed by a bottom toggle button.

## 11. Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # set APP_PASSWORD + SESSION_SECRET
npm run db:local                   # apply schema to the local D1
npm run build                      # build the SPA into dist/
npm run dev                        # wrangler dev → http://localhost:8788
```

**Gotchas when modifying:**
- The Worker serves the **built** `dist/`, so **re-run `npm run build`** after
  frontend edits (then restart `wrangler dev`). There is no HMR in this setup.
- `npm run check` type-checks (strict). Keep it green.
- `.dev.vars` is git-ignored; never commit secrets.
- The three render consumers (editor preview, download, public `/share.js`) all
  go through `src/render/pdf.ts` — change layout in one place only.
- All labels are PT-BR (see BUILD_SPEC §12) — match the existing strings.

## 12. Deployment

Full step-by-step in [`DEPLOY.md`](DEPLOY.md). Short version:

```bash
npx wrangler d1 create orcamentos-db     # paste database_id into wrangler.jsonc
npm run db:remote                        # schema → remote D1
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET   # openssl rand -base64 48
npx wrangler secret put RESEND_API_KEY   # optional (email)
npm run deploy                           # vite build && wrangler deploy
```

Then, in the dashboard: add the custom domain `orcamento.lsampaio.dev`, enable
**Bot Fight Mode**, and add one **Rate Limiting** rule on `/api/*`.
