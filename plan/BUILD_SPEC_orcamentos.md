# Build Spec — Sistema de Orçamentos (LVI Planejados / Stilus Decora)

**Audience of this doc:** Claude Code (or any engineer) building the app.
**End user of the app:** an elderly, non-technical marceneiro (the owner's father). Every UX decision bends toward *maximum simplicity*.
**Language of the app UI:** Brazilian Portuguese (PT-BR). This spec is in English; all user-facing strings must be PT-BR.

---

## 1. What we're building

A tiny web app where one non-technical user creates, saves, reprints, and re-sends woodworking quotes ("orçamentos"), each rendered into a fixed branded layout. Hosted on Cloudflare free tier at `orcamento.lsampaio.dev`.

Two screens only:
1. **Lista** — list of previous orçamentos + a big "Novo orçamento" button.
2. **Editor** — a structured form (NOT a rich-text editor) that produces the branded PDF.

There is exactly **one** human user, gated by **one shared password**. No usernames, no accounts, no roles.

### Non-goals (explicitly out of scope for v1)
- Multiple users / permissions.
- A WYSIWYG / Word-style rich-text editor. (Rejected on purpose — see §4.)
- Server-side PDF rendering. (Rejected — needs paid Cloudflare plan. See §3.)
- Storing generated PDF binaries. (Rejected — cost/security. See §3 and §9.)
- Client phone/address book. WhatsApp uses the recipient-picker flow (no stored numbers).

---

## 2. Core UX principles (the user is elderly & non-technical)

> Full visual/accessibility spec, PT-BR label glossary, mobile rules, and color palette are in **§13** and **§14**. This section is the summary.

- **Mobile-first.** He will often create orçamentos on his **cellphone**. Design for a phone screen first, then scale up to desktop. Everything must be fully usable one-handed on a small screen (see §13).
- **Almost every field is optional.** Only what's truly needed to produce a usable quote is required (realistically: at least one item with a value). `Endereço`, `Prazo`, `Data` edits, even `Cliente` should be optional and simply omitted from the output when blank. Never block him with a "campo obrigatório" wall.
- **Light, calm color palette** (see §13) — light background, dark text, one accent color.
- **Two screens, nothing nested deeper.** List ⇄ Editor. That's it.
- **Big touch targets.** Buttons ≥ 48px tall, large readable labels with icon + text (never icon-only).
- **Few choices per screen.** Top toolbar in the editor has at most: Voltar, Salvar, Imprimir, PDF, WhatsApp, E-mail.
- **Autosave** in the editor (debounced, e.g. every few seconds and on blur), so "Salvar" is a safety net, not a requirement he can forget. Show a subtle "Salvo ✓" indicator.
- **No destructive actions without confirmation.** Prefer **archive over delete** — an "Arquivar" action that hides it from the main list but never truly loses data. If a real delete exists, require a clear confirm dialog ("Tem certeza que deseja apagar? Isso não pode ser desfeito.").
- **Sequential human-friendly numbers.** Every orçamento gets an incrementing `numero` (Orçamento nº 42) so he can reference it by phone. (This is separate from the secret share ID — see §9.)
- **Live preview.** As he fills the form, show a live preview of the orçamento so he sees exactly what will print. WYSIWYG *output*, structured *input*.
- **Copy = "Fazer uma cópia".** Opens a new orçamento pre-filled from an existing one (new numero, new share ID). Available both in the list (per row) and inside the editor.
- **Forgiving math.** The app computes the TOTAL. He never adds anything by hand.
- **Currency input helper.** Value fields accept `6400`, `6.400`, `6400,00` and normalize to `R$ 6.400,00` on the PDF. Never make him format money.

---

## 3. Architecture (all Cloudflare free tier)

| Concern | Choice | Why |
|---|---|---|
| Hosting | Cloudflare **Pages** (static SPA) + **Pages Functions** / a **Worker** for the API | Free, custom domain built in |
| Database | **D1** (SQLite) | Free tier: generous daily read/write; stores orçamento data only |
| PDF | **Generated in the browser** with a JS lib (`pdf-lib` or `jsPDF`) | Server-side PDF on Cloudflare needs the **paid** Workers plan. Browser-side is free and deterministic. |
| Stored files | **NONE.** No R2. No stored PDFs. | We store the *data*; the PDF is regenerated on demand from data. Removes an entire cost + security surface. |
| Email | **Resend** API (free tier ~3k/mo) called from the Worker, PDF sent as base64 attachment | Free, simple, supports attachments |
| Auth | One shared password → signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie | Simplest possible gate for a single user |

**Key architectural rule: the PDF is never a stored artifact.** Both the admin editor and the public share page regenerate the identical PDF client-side from the orçamento's JSON data. There is no URL that returns a stored PDF file. This is central to the cost/security story.

### Routes

Public (no auth):
- `GET /o/:shareId` — branded HTML page rendering one orçamento (read-only) + a big "Baixar PDF" button that generates the PDF in the browser. Used for the WhatsApp share link.

Auth-gated (password cookie required):
- `GET /` — the app (Lista). If no valid cookie → login screen.
- `POST /api/login` — exchange password for cookie. **Rate-limited + lockout.**
- `POST /api/logout`
- `GET /api/orcamentos` — list (returns metadata: numero, nome, cliente, updatedAt, status).
- `GET /api/orcamentos/:id` — full data for editing.
- `POST /api/orcamentos` — create.
- `PUT /api/orcamentos/:id` — update (autosave target).
- `POST /api/orcamentos/:id/copy` — "Fazer uma cópia".
- `POST /api/orcamentos/:id/archive` — archive/unarchive.
- `POST /api/orcamentos/:id/revoke-link` — rotate/disable the public shareId.
- `POST /api/send-email` — send current orçamento by email (PDF attached). **Auth + strict rate limit.** Never public.

---

## 4. Editor = structured form (NOT a rich text editor)

**Do not build a Word-style editor.** Build a form that always renders into the fixed layout in §6.

### Top toolbar (in the editor), left→right
- **Voltar** (back to Lista; autosaves first)
- Field: **Nome do orçamento** (free text, e.g. "Cliente Edson — armários")
- **Salvar** (manual save; autosave also runs)
- **Imprimir** (browser print of the preview / PDF)
- **PDF** (download the .pdf)
- **WhatsApp** (see §7)
- **E-mail** (see §7)
- **Fazer uma cópia**

### Form body fields
**Optionality rule:** everything except "at least one item with a value" is **optional**. Any blank field is simply omitted from the printed orçamento — never shown as an empty label, never blocks saving/sending. Use the exact PT-BR labels from **§14**.

- **Cliente** (text, optional)
- **Endereço** (text, optional — many orçamentos have none; omit the whole line if blank)
- **Data** — defaults to today, editable but optional; rendered as "São Paulo, DD de <mês por extenso> de AAAA".
- **Itens** — a repeating list. This is the only thing that really matters. Each item row:
  - `descrição` (multi-line text — this is the bulk of the content)
  - `valor` (currency; the currency helper from §2 applies)
  - row controls: mover para cima / mover para baixo / remover
  - Items auto-number **01, 02, 03…** in output.
- **＋ Adicionar item** button (big).
- **Prazo de entrega** (text, e.g. "10 dias") — optional.
- **Condição de pagamento** — defaults to "50% de sinal, 50% na entrega"; optional/editable.
- **Rodapé fixo** (always printed, not editable in v1): "material entregue e instalado no local".
- **TOTAL** — auto-computed sum of item valores; only shown when there are ≥ 2 items (single-item orçamentos in the samples omit a separate TOTAL line). Make this rule configurable but default to that behavior.

### Live preview
Render the preview beside/below the form using the **same** rendering code path as the PDF, so what he sees is what prints.

---

## 5. Data model (D1)

```sql
CREATE TABLE orcamentos (
  id          TEXT PRIMARY KEY,      -- internal random id
  numero      INTEGER UNIQUE,        -- human sequential number (Orçamento nº N)
  share_id    TEXT UNIQUE,           -- public unguessable id (see §9); NULL/blank when link revoked
  nome        TEXT NOT NULL,         -- "Nome do orçamento"
  cliente     TEXT,
  endereco    TEXT,
  data_iso    TEXT,                  -- ISO date shown on the doc
  itens_json  TEXT NOT NULL,         -- JSON array [{descricao, valor_centavos}]
  prazo       TEXT,
  cond_pag    TEXT DEFAULT '50% de sinal, 50% na entrega',
  header_key  TEXT DEFAULT 'lvi',    -- which company header (see §6)
  status      TEXT DEFAULT 'ativo',  -- 'ativo' | 'arquivado'
  created_at  TEXT,
  updated_at  TEXT
);

CREATE TABLE counters ( name TEXT PRIMARY KEY, value INTEGER );
-- seed: INSERT INTO counters VALUES ('numero', 0);
```

- Money stored as **integer centavos** to avoid float errors. Format to `R$ x.xxx,xx` only at render.
- `numero` allocated atomically from `counters`.
- `share_id` generated with a CSPRNG (see §9).

---

## 6. The orçamento layout (must match exactly)

The output reproduces the existing paper template. Header is a logo (left) + company block (right), a divider rule, then the body.

**Logo:** provided asset `logo_final.png` (Stilus Decora "SD" monogram, dark red + blue, on white). Bundle it with the app.

**Default company header — `header_key = 'lvi'` (LVI Planejados):**
```
Stilus Decorações
Rua Chico Pontes, 812, Vila Guilherme - CEP 02067-002
Fone: (011) 2978-2067 / Cel: (WhatsApp) 9-1096-1541
E-mail: stilusdecora@gmail.com   Instagram: stilus_decora
LVI Planejados
CNPJ: 65.440.996/0001-00  Inscrição Estadual: 158.418.630.117
```
(Labels "Fone:", "Cel:", "E-mail:", "Instagram:", and the "Stilus Decorações" title and "LVI Planejados" line are **bold**; the rest regular. Title ~13pt, header lines ~9.5pt.)

**Alternate header — `header_key = 'stilus'` (original, keep available):**
Same block but last two lines:
```
J.I. Sampaio Medeiras Ltda-ME
CNPJ: 35.778.591/0001-07  Inscrição Estadual: 128.266.130.111
```

**Body layout:**
- Centered, bold: `São Paulo, DD de <mês> de AAAA`
- `Cliente: <nome>` (bold label)
- `Endereço: <endereço>` (bold label; omit line if empty)
- For each item: bold `NN / <descrição>` wrapped to page width, then a `valor` line with a **dot leader** to a right-aligned `R$ <valor>`.
- If ≥ 2 items: bold `TOTAL` line with dot leader to right-aligned `R$ <total>`.
- `prazo de entrega: <...>` (bold, omit if empty)
- `cond. de pag.: <...>` (bold)
- `material entregue e instalado no local` (bold)
- Two signature dotted lines near the bottom.

Page: A4, ~2cm side margins. Fonts: a clean sans (Helvetica/Arial equivalent). Text color near-black `#1A1A1A`.

> Reference implementation of this exact layout already exists in Python/reportlab (owner has it). Port the geometry faithfully to the browser PDF lib. A visual diff against the existing sample PDFs (Sandra, Flávia, Michel, Pablo, Edson) is the acceptance test.

---

## 7. Sending features

### Imprimir
Browser print of the rendered orçamento (print stylesheet or print the generated PDF). Must produce the same layout as the PDF.

### PDF
Generate and download `Orcamento_<nome>.pdf` client-side.

### WhatsApp (free, no API)
- Saves first, ensures a `share_id` exists.
- Opens `https://wa.me/?text=<encoded message>` — **no phone number**, so WhatsApp lets him pick the contact from his own list (chosen deliberately; easier + no stored numbers, no typo risk).
- Message template (PT-BR), URL-encoded, e.g.:
  `Olá! Segue o orçamento da Stilus Decora: https://orcamento.lsampaio.dev/o/<share_id>`
- The link opens the public read-only page (§3 route `/o/:shareId`) with a "Baixar PDF" button.

### E-mail (Resend)
- Auth-gated endpoint `POST /api/send-email`.
- The browser generates the PDF, sends `{ to, subject, body, pdfBase64, nome }` to the Worker.
- Worker calls Resend with the PDF as an attachment. From-address on a domain verified in Resend (e.g. `orcamentos@lsampaio.dev`).
- **Strict rate limit** on this endpoint (see §8) — this is the main way someone could burn your Resend quota, so it must never be reachable without the session cookie and must be capped per time window.

---

## 8. Security & cost-control requirements (PRIORITY)

The owner's explicit fears: (a) an attacker loading PDFs thousands of times to run up costs, and (b) someone guessing PDF/orçamento URLs. Address both head-on.

### Cost / abuse protection
1. **Stay on the Cloudflare Free plan.** Free plan = hard limits, **no overage billing**. Worst case under a flood is HTTP 429, never a surprise invoice. Do not enable paid add-ons that introduce metered billing.
2. **No stored PDF files, no R2.** The "PDF folder hammered for cost" vector does not exist because PDFs are regenerated client-side from D1 data. There is no file endpoint to abuse.
3. **Cloudflare does not bill bandwidth/egress** — high view counts of the public page do not create egress cost (unlike S3).
4. **Edge-cache the public page.** Serve `GET /o/:shareId` with a `Cache-Control` allowing Cloudflare edge caching (e.g. `public, max-age=300, s-maxage=600`). A flood of the same link is absorbed by the CDN and never hits the Worker or D1. Bust cache on update/revoke (cache-tag or short TTL).
5. **Rate limiting.** Add a Cloudflare Rate Limiting rule (one free rule available) and/or in-Worker per-IP throttling on `/api/*`, especially `/api/login` and `/api/send-email`. Return 429 with `Retry-After`.
6. **Enable Bot Fight Mode** (free) in the Cloudflare dashboard.
7. **Cap the email endpoint** independently (e.g. N sends per hour) regardless of auth, to bound Resend usage.
8. **Optional billing alert.** Even though the free plan can't overage-bill, set a Cloudflare Notification/billing alert for peace of mind.

### URL-guessing protection
1. **`share_id` is a CSPRNG value with ≥ 122 bits of entropy** — e.g. a UUIDv4, or a 22-char nanoid over `[A-Za-z0-9_-]`. Never sequential, never derived from `numero` or timestamp. Use `crypto.getRandomValues` / `crypto.randomUUID()`.
2. **Public `numero` and secret `share_id` are decoupled.** The guessable, human number never appears in a public URL; the public URL never reveals the sequence.
3. **No enumeration.** `GET /o/:shareId` returns the **same generic 404** for "not found", "revoked", and "archived". No timing/format differences that hint existence.
4. **No public list endpoint.** Only the authenticated admin can list orçamentos. The public page serves exactly one record by exact `share_id` match.
5. **Revocable links.** `POST /api/orcamentos/:id/revoke-link` rotates or nulls `share_id`, instantly killing a leaked URL. Re-sharing mints a fresh id.
6. **Minimal data on the public page.** Show only what belongs on the quote. No internal ids, no admin controls, no other orçamentos.

### Auth protection
1. Compare submitted password to a secret (`APP_PASSWORD`) stored as a Cloudflare secret/env var — never in the repo, never shipped to the client.
2. On success, set a signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (e.g. HMAC-signed token with expiry, secret = `SESSION_SECRET`). Cookie is the only thing the browser holds; the password is never stored client-side.
3. **Brute-force defense on `/api/login`:** rate-limit per IP + temporary lockout after several failures (e.g. 5 tries → cooldown). Constant-time compare.
4. Reasonable session lifetime (e.g. 30 days) so dad rarely re-enters the password; "Sair" clears it.
5. All `/api/*` (except login) and `/` require a valid cookie.

---

## 9. Environment / secrets

Set as Cloudflare secrets (not committed):
- `APP_PASSWORD` — the shared login password.
- `SESSION_SECRET` — random 32+ byte key for signing the session cookie.
- `RESEND_API_KEY` — for email.
- `EMAIL_FROM` — e.g. `orcamentos@lsampaio.dev` (domain verified in Resend).
- `PUBLIC_BASE_URL` — `https://orcamento.lsampaio.dev` (used to build share links).

D1 binding: `DB`. Bundle `logo_final.png` as a static asset.

---

## 10. Deployment steps (for the owner)

1. Cloudflare → create a **Pages** project (or Worker) from the repo. Keep on **Free** plan.
2. Create a **D1** database; run the schema in §5; bind as `DB`.
3. Add the secrets from §9 (`wrangler secret put ...` or dashboard).
4. Add DNS: `orcamento.lsampaio.dev` → the Pages/Worker (Cloudflare-managed since `lsampaio.dev` is already on Cloudflare).
5. In the Cloudflare dashboard: enable **Bot Fight Mode**, add one **Rate Limiting** rule on `/api/*`.
6. **Resend:** create account, verify `lsampaio.dev` domain, create API key → put in `RESEND_API_KEY`.
7. Smoke test: login → create → PDF → WhatsApp link opens → email arrives → public link renders → revoke kills it.

---

## 11. Interface, accessibility, mobile & colors

The end user is elderly and non-technical and will frequently work **on a phone**. Optimize relentlessly for that. Base the component style on the **GOV.UK Design System** philosophy (inclusive, plain, tested with low-digital-confidence and older users); alternatives with the same spirit: **USWDS**, **NHS.UK**. Meet **WCAG 2.2 AA** (aim AAA on text contrast). Also follow the **NIA "Making Your Website Senior-Friendly"** checklist and **W3C WAI older-users** guidance.

### Mobile-first (primary target = cellphone)
- **Design for a ~360px-wide phone first**, then enhance for tablet/desktop. Single-column layout on phone. No horizontal scrolling, ever.
- **Toolbar on phone:** don't cram 7 buttons in a row. Keep **Voltar** + **Salvar** always visible (sticky top), and put **Imprimir / PDF / WhatsApp / E-mail / Fazer uma cópia** in a clearly labeled "Enviar / Compartilhar" area (big stacked buttons), not a hidden hamburger.
- **Sticky primary action.** The main button (e.g. "Adicionar item" in the editor, "Novo orçamento" in the list) stays reachable with the thumb — sticky at the bottom on phone.
- **Native inputs.** Use `inputmode="decimal"` on money fields so the numeric keypad appears; use real `<input type="date">` for Data. Big tap targets (≥ 48×48px) with ≥ 8px spacing.
- **Live preview on phone** goes *below* the form (collapsible "Ver como vai ficar"), not side-by-side.
- **Works with system font scaling / pinch-zoom.** Never disable zoom. Respect the OS "larger text" setting.
- Test on a real phone as part of acceptance, in addition to the dad user-test.

### Typography & readability
- Base font **20–22px** on phone (never below 18px). Line-height ~1.5.
- System font stack (fast, familiar): `-apple-system, "Segoe UI", Roboto, Arial, sans-serif`.
- Near-black text `#1F2933` on light background — high contrast, no gray-on-gray for body text.
- Labels **always visible above the field** — never placeholder-as-label (placeholders disappear and confuse).

### Buttons & controls
- Buttons **look like buttons**: solid fill, rounded corners, ≥ 48px tall, generous padding.
- **Icon + text always.** Never icon-only. Never rely on color alone to convey meaning (add text/icon).
- One **primary** (filled, accent color) action per screen; everything else is **secondary** (outlined) or **tertiary** (text). Destructive actions ("Apagar") in a muted red and always behind a confirm.
- No hover-dependent UI, no hidden menus, no stacked modals. Everything visible and in a **consistent, fixed position** every time.

### Feedback & forgiveness
- **Autosave** with a persistent, large "Salvo ✓" indicator that lingers a few seconds (not a blink-and-gone toast).
- Confirm before destructive actions; prefer **Arquivar** over Apagar.
- Plain-language inline messages next to the relevant field, telling him how to fix it — no error codes, no red walls.
- No time limits on anything.

### Color palette (light, calm)
Light theme only. Uses the brand's blue/red accents sparingly on a soft neutral background.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F8FA` | app background (soft off-white) |
| `--surface` | `#FFFFFF` | cards, form, preview sheet |
| `--border` | `#D9DEE5` | dividers, input borders |
| `--text` | `#1F2933` | body text (near-black, high contrast) |
| `--text-muted` | `#5B6672` | secondary/helper text (still AA on white) |
| `--primary` | `#2F5B8C` | primary buttons/links (brand blue) |
| `--primary-contrast` | `#FFFFFF` | text on primary |
| `--accent` | `#7A2E2E` | brand dark-red highlights, sparing |
| `--success` | `#2E7D46` | "Salvo ✓", success states |
| `--danger` | `#B23A3A` | destructive actions only |

Keep it airy: lots of whitespace, one accent at a time, no gradients or heavy shadows. Verify every text/background pair passes WCAG AA contrast.

---

## 12. PT-BR labels (use these exact strings)

All UI is **Brazilian Portuguese**, plain and short. Use these exact labels.

**Login**
- Title: `Entrar`
- Field: `Senha`
- Button: `Entrar`
- Error: `Senha incorreta. Tente novamente.`

**Lista (home)**
- Screen title: `Meus orçamentos`
- Primary button: `+ Novo orçamento`
- Per-row actions: `Abrir` · `Fazer uma cópia` · `Arquivar`
- Empty state: `Você ainda não tem orçamentos. Toque em "+ Novo orçamento" para começar.`
- Search (optional): `Procurar orçamento`
- Toggle: `Mostrar arquivados`

**Editor — toolbar**
- `Voltar`
- `Salvar`  (saved indicator: `Salvo ✓`)
- `Imprimir`
- `PDF` (or `Baixar PDF`)
- `WhatsApp` (or `Enviar por WhatsApp`)
- `E-mail` (or `Enviar por e-mail`)
- `Fazer uma cópia`

**Editor — fields (all optional except an item)**
- `Nome do orçamento`  (helper: `Só para você encontrar depois. Ex.: "Cliente Edson - armários"`)
- `Cliente`
- `Endereço`
- `Data`
- Section heading: `Itens do orçamento`
- Item: `Descrição`  · `Valor`
- Item controls: `Mover para cima` · `Mover para baixo` · `Remover item`
- `+ Adicionar item`
- `Prazo de entrega`
- `Condição de pagamento`
- Total line label (output): `TOTAL`
- Preview toggle (phone): `Ver como vai ficar`

**Send / share**
- E-mail dialog: title `Enviar por e-mail`, fields `Para (e-mail)`, `Assunto`, `Mensagem`, button `Enviar`
- WhatsApp default message: `Olá! Segue o orçamento da Stilus Decora: <link>`
- Sending states: `Enviando…` / `Enviado ✓` / `Não foi possível enviar. Tente de novo.`

**Confirmations**
- Delete: `Tem certeza que deseja apagar? Isso não pode ser desfeito.` — buttons `Apagar` / `Cancelar`
- Archive: `Arquivar este orçamento?` — `Arquivar` / `Cancelar`
- Revoke link: `Desativar o link de compartilhamento? Quem tiver o link antigo não conseguirá mais abrir.` — `Desativar` / `Cancelar`

**Public share page (`/o/:shareId`)**
- Button: `Baixar PDF`
- If revoked/not found (generic, no enumeration): `Orçamento não encontrado.`

---

## 13. Acceptance criteria

- A non-technical user can, in under a minute, create an orçamento, print it, and share a WhatsApp link — using only the two screens.
- **Fully usable one-handed on a ~360px phone**: no horizontal scroll, numeric keypad on money fields, primary actions reachable with the thumb.
- **Meets WCAG 2.2 AA** (AAA on text contrast); every text/background pair in the §11 palette verified; UI uses only the exact PT-BR labels from §12.
- Every field except "at least one item with a value" is optional; blank fields are omitted from output and never block saving or sending.
- Output PDF is visually indistinguishable from the existing sample orçamentos (header, dot leaders, total, signatures).
- Money math is always correct (integer centavos).
- Public link works for anyone with the URL; guessing another orçamento's URL is infeasible; revoking a link 404s it immediately.
- No configuration or action available in the app can move the account off the free plan or create a stored-file cost surface.
- Login is brute-force-resistant; the email endpoint cannot be triggered without a session.

---

## 14. Suggested build order

1. Skeleton: Pages + Worker + D1 + login/cookie. Set up the §11 design tokens (colors, type, mobile-first layout shell) up front so every screen inherits them.
2. Data CRUD + Lista screen (mobile-first, §11/§12 labels).
3. Editor form + live preview (all fields optional per §4).
4. Client-side PDF generation matching the template (visual-diff against samples).
5. Public `/o/:shareId` page + edge caching + revoke.
6. WhatsApp share.
7. Resend email + rate limits.
8. Bot Fight Mode / rate-limit rule / final security pass against §8.
9. Accessibility/mobile pass: real-phone test + WCAG AA contrast check + the dad user-test.
