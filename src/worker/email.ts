// Resend e-mail with the PDF attached (BUILD_SPEC §7). The browser generates
// the PDF and sends it here as base64; this endpoint is auth-gated + rate
// limited by the caller so it can't be used to burn the Resend quota.

import type { Env } from "./env";

interface SendInput {
  to?: string;
  subject?: string;
  body?: string;
  pdfBase64?: string;
  nome?: string;
}

interface SendResult {
  ok: boolean;
  status: 200 | 400 | 500 | 503;
  error?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_B64 = 8 * 1024 * 1024; // ~6MB PDF, generous cap

export async function sendOrcamentoEmail(env: Env, input: SendInput): Promise<SendResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { ok: false, status: 503, error: "email_disabled", message: "Envio por e-mail não está configurado." };
  }
  const to = (input.to ?? "").trim();
  if (!EMAIL_RE.test(to)) {
    return { ok: false, status: 400, error: "invalid_to", message: "Endereço de e-mail inválido." };
  }
  const pdfBase64 = (input.pdfBase64 ?? "").trim();
  if (!pdfBase64 || pdfBase64.length > MAX_PDF_B64) {
    return { ok: false, status: 400, error: "invalid_pdf", message: "Não foi possível anexar o PDF." };
  }
  const nome = (input.nome ?? "orcamento").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "orcamento";
  const subject = (input.subject ?? "").trim() || "Orçamento — Stilus Decora";
  const text = (input.body ?? "").trim() || "Segue em anexo o orçamento da Stilus Decora.";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text,
      attachments: [{ filename: `${nome}.pdf`, content: pdfBase64 }],
    }),
  });

  if (!resp.ok) {
    return { ok: false, status: 500, error: "send_failed", message: "Não foi possível enviar. Tente de novo." };
  }
  return { ok: true, status: 200 };
}
