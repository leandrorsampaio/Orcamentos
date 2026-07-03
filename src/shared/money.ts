// Currency helpers. Money lives as integer *centavos* everywhere; it is only
// formatted to "R$ x.xxx,xx" at render time (BUILD_SPEC §2, §5).

/**
 * Parse a forgiving money string into integer centavos.
 * Accepts: "6400", "6.400", "6400,00", "6.400,00", "R$ 6.400,00".
 * Rules (PT-BR): comma is the decimal separator; dots are thousands separators.
 * Returns null for empty / unparseable input.
 */
export function parseCentavos(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Math.round(raw * 100);

  let s = raw.trim();
  if (!s) return null;
  // keep only digits, comma, dot
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;

  if (s.includes(",")) {
    // comma = decimals, dots = thousands
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // no comma → dots are thousands separators ("6.400" == 6400)
    s = s.replace(/\./g, "");
  }

  const n = Number.parseFloat(s);
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
