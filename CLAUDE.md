# Project context for AI assistants

**Read [`README.md`](README.md) first — it holds the full project context**
(what this is, architecture, data model, security model, file-by-file guide, and
the UX decisions already made). Then [`plan/BUILD_SPEC_orcamentos.md`](plan/BUILD_SPEC_orcamentos.md)
for the original brief and [`DEPLOY.md`](DEPLOY.md) for deployment.

## Quick facts
- Single-user PT-BR web app to create/print/share woodworking quotes as a
  branded PDF. Cloudflare Free plan: Worker (Hono) + D1 + static SPA (Vanilla TS
  + Vite), `pdf-lib`, Resend. Deployed at `orcamento.lsampaio.dev`.
- The PDF is **never stored** — regenerated in the browser from D1 data via
  `src/render/pdf.ts` (a faithful port of `plan/reference/layout_reference.py`;
  acceptance = visual match vs `plan/reference/*.pdf`).
- Money is **integer centavos** everywhere. All UI text is **Brazilian
  Portuguese** — keep it that way.

## Working here
- The Worker serves the **built** `dist/`, so after any frontend change run
  `npm run build` and restart `npm run dev`. No HMR.
- Keep `npm run check` (strict tsc) green.
- Change PDF layout only in `src/render/pdf.ts` (used by the editor preview, the
  download, and the public `/share.js`).
- Don't commit secrets; `.dev.vars` is git-ignored.
