// Pure orçamento computations shared by the editor preview, the PDF, and the
// public page. Keeps the "one source of truth" rule from BUILD_SPEC §4.

import type { Orcamento, OrcamentoItem } from "./types";

/** Item index → "01", "02", ... two-digit output number. */
export function itemNumero(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Items that actually carry a value (used for total + "at least one" rule). */
export function itensComValor(itens: OrcamentoItem[]): OrcamentoItem[] {
  return itens.filter((i) => Number.isFinite(i.valor_centavos) && i.valor_centavos > 0);
}

/** Sum of all item values, in centavos. */
export function totalCentavos(itens: OrcamentoItem[]): number {
  return itens.reduce(
    (sum, i) => sum + (Number.isFinite(i.valor_centavos) ? i.valor_centavos : 0),
    0,
  );
}

/**
 * Whether a separate TOTAL line should be printed.
 * Default rule (BUILD_SPEC §4): only when there are >= 2 items.
 */
export function shouldShowTotal(itens: OrcamentoItem[]): boolean {
  return itens.length >= 2;
}

/** The minimal requirement to produce a usable quote: >= 1 item with a value. */
export function isSendable(o: Pick<Orcamento, "itens">): boolean {
  return itensComValor(o.itens).length >= 1;
}
