# Handoff — Sistema de Orçamentos

Everything Claude Code needs to build the app.

## Contents
- **BUILD_SPEC_orcamentos.md** — the full build brief. Start here. Read §12 (build order) last, everything else first.
- **logo_final.png** — the Stilus Decora logo, background already cleaned to white. Bundle as a static asset (referenced in BUILD_SPEC §6).
- **reference/layout_reference.py** — the *exact* PDF geometry (fonts, positions, dot leaders, header). Written in reportlab as a spec; **do not ship Python** — port the geometry to the browser PDF lib (pdf-lib / jsPDF) per BUILD_SPEC §3.
- **reference/*.pdf** — real generated orçamentos (Sandra, Flávia, Pablo, Edson, Michel). These are the **visual acceptance target**: the app's output must be indistinguishable from these.

## Key reminders
- All user-facing text is **Brazilian Portuguese** — use the exact labels in BUILD_SPEC §12.
- **Mobile-first** — the primary user works on a phone (§11).
- **Almost every field is optional** — only "≥ 1 item with a value" is required (§4).
- **Default header = LVI Planejados** (§6); Stilus header kept as an alternate.
- **Security is priority** — no stored PDF files, stay on Cloudflare Free plan, unguessable share IDs, protected login + email endpoints (§8).
- Money is stored as **integer centavos**, formatted to `R$ x.xxx,xx` only at render.
