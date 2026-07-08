// Browser-side PDF helpers built on the shared render code. The preview iframe
// shows this exact PDF, so preview == printed output (BUILD_SPEC §4).

import type { Orcamento } from "../shared/types";
import { buildOrcamentoPdf, pdfFilename } from "../render/pdf";

const assetCache = new Map<string, Promise<Uint8Array | null>>();

function loadAsset(path: string): Promise<Uint8Array | null> {
  let p = assetCache.get(path);
  if (!p) {
    p = fetch(path)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new Uint8Array(b) : null))
      .catch(() => null);
    assetCache.set(path, p);
  }
  return p;
}

export async function pdfBytes(o: Orcamento): Promise<Uint8Array> {
  const [logo, assinatura] = await Promise.all([loadAsset("/logo_final.png"), loadAsset("/assinatura.png")]);
  return buildOrcamentoPdf(o, logo, assinatura);
}

export async function pdfBlobUrl(o: Orcamento): Promise<string> {
  const bytes = await pdfBytes(o);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export async function downloadPdf(o: Orcamento): Promise<void> {
  const url = await pdfBlobUrl(o);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFilename(o);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function printPdf(o: Orcamento): Promise<void> {
  const url = await pdfBlobUrl(o);
  // Print via a hidden iframe; fall back to opening the PDF in a new tab.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(iframe);
}

export async function pdfBase64(o: Orcamento): Promise<string> {
  const bytes = await pdfBytes(o);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export { pdfFilename };
