// Currency helpers. Money lives as integer *centavos* everywhere; it is only
// formatted to "R$ x.xxx,xx" at render time (BUILD_SPEC §2, §5).

/**
 * Parse a forgiving money string into integer centavos.
 * Accepts: "6400", "6.400", "6400,00", "6.400,00", "R$ 6.400,00", and a dot
 * typed as the decimal separator ("6400.50", common on phone keypads).
 * Rules: with both separators the last one is the decimal; a lone comma is the
 * decimal (PT-BR); a lone dot is the decimal only when 1-2 digits follow it
 * ("6.400" stays 6400, "6400.5" is 6400,50). Returns null for empty /
 * unparseable input.
 */
export function parseCentavos(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Math.round(raw * 100);

  // keep only digits, comma, dot
  const s = raw.trim().replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let dec = -1; // index of the decimal separator, -1 = none
  if (lastDot >= 0 && lastComma >= 0) dec = Math.max(lastDot, lastComma);
  else if (lastComma >= 0) dec = s.indexOf(",") === lastComma ? lastComma : -1;
  else if (lastDot >= 0) dec = s.indexOf(".") === lastDot && /\.\d{1,2}$/.test(s) ? lastDot : -1;

  const inteiro = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, "");
  const fracao = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, "") : "";
  const n = Number(`${inteiro || "0"}.${fracao || "0"}`);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

/** Format centavos as "6.400,00" (no currency symbol). */
export function formatCentavos(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;
  const reaisStr = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + reaisStr + "," + String(cents).padStart(2, "0");
}

/** Format centavos as "R$ 6.400,00". */
export function formatBRL(centavos: number): string {
  return "R$ " + formatCentavos(centavos);
}
