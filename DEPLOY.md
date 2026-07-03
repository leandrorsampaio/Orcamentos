# Deploy — Sistema de Orçamentos (Cloudflare Free plan)

Everything here stays on the **Free** plan (no metered billing). Run the commands
from the project root. You only do this once; afterwards, `npm run deploy` ships
updates.

## 0. Prerequisites

- A Cloudflare account with `lsampaio.dev` already on Cloudflare (it is).
- Node 18+ and this repo cloned locally.
- `npm install` has been run.

Log in wrangler to your account (opens a browser):

```bash
npx wrangler login
```

## 1. Create the D1 database

```bash
npx wrangler d1 create orcamentos-db
```

Copy the printed `database_id` into **`wrangler.jsonc`**, replacing
`REPLACE_WITH_D1_DATABASE_ID`.

Apply the schema to the remote database:

```bash
npm run db:remote
```

## 2. Set the secrets

```bash
npx wrangler secret put APP_PASSWORD        # the shared login password for dad
npx wrangler secret put SESSION_SECRET      # paste: openssl rand -base64 48
npx wrangler secret put RESEND_API_KEY      # optional — skip if not using e-mail yet
```

`PUBLIC_BASE_URL` and `EMAIL_FROM` are already set as plain vars in
`wrangler.jsonc` — edit them there if the domain/e-mail changes.

## 3. Build & deploy

```bash
npm run deploy      # runs: vite build && wrangler deploy
```

## 4. Custom domain

Cloudflare dashboard → **Workers & Pages** → `orcamentos` → **Settings** →
**Domains & Routes** → **Add** → Custom domain → `orcamento.lsampaio.dev`.
DNS is created automatically because the zone is on Cloudflare.

## 5. Abuse protection (dashboard, free)

- **Bot Fight Mode:** zone `lsampaio.dev` → **Security → Bots** → enable
  *Bot Fight Mode*.
- **Rate Limiting rule (1 free):** **Security → WAF → Rate limiting rules** →
  create a rule matching `URI Path contains "/api/"`, e.g. 60 requests / 1 min
  per IP → *Block* with a short timeout. (The Worker also rate-limits `/api/login`
  and `/api/send-email` internally as a second layer.)

## 6. E-mail (Resend) — optional, can be added later

1. Create a Resend account, verify the `lsampaio.dev` domain.
2. Create an API key → `npx wrangler secret put RESEND_API_KEY`.
3. Make sure `EMAIL_FROM` in `wrangler.jsonc` uses a verified address
   (e.g. `orcamentos@lsampaio.dev`), then `npm run deploy` again.

If `RESEND_API_KEY`/`EMAIL_FROM` are absent, the app still works — the e-mail
button returns a friendly "envio por e-mail não está configurado" message; PDF
and WhatsApp are unaffected.

## 7. Smoke test (matches BUILD_SPEC §10)

Log in → create → PDF downloads → WhatsApp link opens → (e-mail arrives) →
public link renders → revoke kills it (the old `/o/:shareId` returns the generic
404). Try it on a real phone.

---

### Notes on the Free-plan / security guarantees

- **No stored PDFs, no R2** — the PDF is regenerated client-side from D1 data, so
  there is no file endpoint to hammer for cost.
- **Public page is edge-cached** (`s-maxage=600`); a flood of one link is absorbed
  by the CDN and never hits the Worker or D1.
- **Share IDs** are 22-char CSPRNG values (~131 bits) — not guessable, decoupled
  from the human `numero`. Revoking rotates the id, instantly 404-ing the old URL.
- **Login** is constant-time compared, rate-limited, and locks an IP for 15 min
  after 5 failures. All `/api/*` (except login/logout/session) require the signed
  `HttpOnly` session cookie.
