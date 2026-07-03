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

let logoBytes: Uint8Array | null | undefined;

async function loadLogo(): Promise<Uint8Array | null> {
  if (logoBytes !== undefined) return logoBytes;
  try {
    const r = await fetch("/logo_final.png");
    logoBytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    logoBytes = null;
  }
  return logoBytes;
}

const btn = document.getElementById("baixar") as HTMLButtonElement | null;
const o = window.__ORCAMENTO__;

if (btn && o) {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Gerando…";
    try {
      const bytes = await buildOrcamentoPdf(o, await loadLogo());
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
