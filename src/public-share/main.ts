// Standalone bundle for the public share page (/o/:shareId). Emitted as
// /share.js (see vite.config.ts). Reads the inlined orçamento and wires the
// "Baixar PDF" button to regenerate the exact PDF client-side.

import type { Orcamento } from "../shared/types";
import { buildOrcamentoPdf, pdfFilename } from "../render/pdf";

declare global {
  interface Window {
    __ORCAMENTO__?: Orcamento;
  }
}

const assetCache = new Map<string, Uint8Array | null>();

async function loadAsset(path: string): Promise<Uint8Array | null> {
  if (assetCache.has(path)) return assetCache.get(path) ?? null;
  let bytes: Uint8Array | null;
  try {
    const r = await fetch(path);
    bytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    bytes = null;
  }
  assetCache.set(path, bytes);
  return bytes;
}

const btn = document.getElementById("baixar") as HTMLButtonElement | null;
const o = window.__ORCAMENTO__;

if (btn && o) {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Gerando…";
    try {
      const [logo, assinatura] = await Promise.all([
        loadAsset("/logo_final.png"),
        loadAsset("/assinatura.png"),
      ]);
      const bytes = await buildOrcamentoPdf(o, logo, assinatura);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename(o);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = label ?? "Baixar PDF";
    }
  });
}
