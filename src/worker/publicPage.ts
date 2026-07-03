// Server-rendered read-only public page for /o/:shareId (BUILD_SPEC §3, §7, §8).
// Self-contained HTML, edge-cacheable. The "Baixar PDF" button is wired by the
// standalone /share.js bundle, which regenerates the exact PDF client-side.

import type { Orcamento } from "../shared/types";
import { formatBRL } from "../shared/money";
import { formatDataExtenso } from "../shared/date";
import { itemNumero, shouldShowTotal, totalCentavos } from "../shared/orcamento";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON safe to embed inside a <script> tag. */
function safeJson(o: unknown): string {
  return JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderPublicPage(o: Orcamento): string {
  const datestr = formatDataExtenso(o.data_iso);
  const cliente = (o.cliente ?? "").trim();
  const endereco = (o.endereco ?? "").trim();
  const prazo = (o.prazo ?? "").trim();
  const condPag = (o.cond_pag ?? "").trim();

  const itensHtml = o.itens
    .map(
      (item, idx) => `
      <div class="item">
        <div class="item-desc">${esc(itemNumero(idx))} / ${esc((item.descricao ?? "").trim())}</div>
        <div class="item-valor"><span>valor</span><b>${esc(formatBRL(item.valor_centavos))}</b></div>
      </div>`,
    )
    .join("");

  const totalHtml = shouldShowTotal(o.itens)
    ? `<div class="total"><span>TOTAL</span><b>${esc(formatBRL(totalCentavos(o.itens)))}</b></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Orçamento — Stilus Decora</title>
<style>
  :root{
    --bg:#E7EBF1;--surface:#FFFFFF;--border:#CBD3DD;--text:#1F2933;
    --muted:#5B6672;--primary:#2F5B8C;--primary-contrast:#FFFFFF;--accent:#7A2E2E;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:400 18px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    -webkit-text-size-adjust:100%;padding:16px}
  .sheet{max-width:720px;margin:0 auto;background:var(--surface);
    border:1px solid var(--border);border-radius:12px;padding:28px 24px}
  header.head{display:flex;gap:16px;align-items:flex-start;
    border-bottom:2px solid var(--border);padding-bottom:16px;margin-bottom:20px}
  header.head img{width:96px;height:auto;flex:0 0 auto}
  .co h1{font-size:18px;margin:0 0 4px}
  .co p{margin:0;font-size:13px;color:var(--muted);line-height:1.45}
  .date{text-align:center;font-weight:700;margin:8px 0 18px}
  .who{margin-bottom:14px}
  .who div{font-weight:700}
  .item{margin:14px 0}
  .item-desc{font-weight:700}
  .item-valor{display:flex;justify-content:space-between;gap:8px;
    border-bottom:1px dotted var(--muted);margin-top:2px}
  .item-valor span{font-weight:700}
  .total{display:flex;justify-content:space-between;gap:8px;font-weight:700;
    border-top:1px solid var(--border);margin-top:18px;padding-top:10px}
  .foot{margin-top:22px;font-weight:700}
  .foot p{margin:4px 0}
  .actions{max-width:720px;margin:16px auto 0}
  button#baixar{width:100%;min-height:56px;font-size:20px;font-weight:700;
    background:var(--primary);color:var(--primary-contrast);border:none;
    border-radius:10px;cursor:pointer;padding:0 20px}
  button#baixar:disabled{opacity:.6;cursor:default}
  .hint{text-align:center;color:var(--muted);font-size:14px;margin-top:10px}
</style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <img src="/logo_final.png" alt="Stilus Decora">
      <div class="co">
        <h1>Stilus Decorações</h1>
        <p>Rua Chico Pontes, 812, Vila Guilherme - CEP 02067-002</p>
        <p>Fone: (11) 2365-1649 / Cel: (WhatsApp) 9-1096-1541</p>
        <p>E-mail: stilusdecora@gmail.com &nbsp; Instagram: stilus_decora</p>
      </div>
    </header>
    ${datestr ? `<div class="date">${esc(datestr)}</div>` : ""}
    <div class="who">
      ${cliente ? `<div>Cliente: ${esc(cliente)}</div>` : ""}
      ${endereco ? `<div>Endereço: ${esc(endereco)}</div>` : ""}
    </div>
    ${itensHtml}
    ${totalHtml}
    <div class="foot">
      ${prazo ? `<p>prazo de entrega: ${esc(prazo)}</p>` : ""}
      ${condPag ? `<p>cond. de pag.: ${esc(condPag)}</p>` : ""}
      <p>material entregue e instalado no local</p>
    </div>
  </div>
  <div class="actions">
    <button id="baixar" type="button">Baixar PDF</button>
    <p class="hint">Orçamento da Stilus Decora</p>
  </div>
  <script>window.__ORCAMENTO__ = ${safeJson(o)};</script>
  <script type="module" src="/share.js"></script>
</body>
</html>`;
}

/** Generic "not found" page — identical for missing / revoked / archived. */
export function renderNotFoundPage(): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Orçamento não encontrado</title>
<style>body{margin:0;background:#F7F8FA;color:#1F2933;
  font:400 18px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}</style>
</head><body><p>Orçamento não encontrado.</p></body></html>`;
}
