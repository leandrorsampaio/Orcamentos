// PT-BR date helpers. Dates are stored as ISO "YYYY-MM-DD" and rendered as
// "São Paulo, DD de <mês por extenso> de AAAA" (BUILD_SPEC §6).

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Today as ISO "YYYY-MM-DD" in local time. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * "2026-06-30" → "São Paulo, 30 de junho de 2026".
 * Returns "" for empty/invalid input (line is then omitted from output).
 */
export function formatDataExtenso(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `São Paulo, ${day} de ${MESES[month - 1]} de ${year}`;
}
