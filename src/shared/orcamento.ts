// Pure orçamento computations shared by the editor preview, the PDF, and the
// public page. Keeps the "one source of truth" rule from BUILD_SPEC §4.

import type { Orcamento, OrcamentoItem, OrcamentoPdf } from "./types";

/** Default "Observações" for a new orçamento. */
export const OBSERVACOES_PADRAO = "Material entregue e instalado no local\nValidade da proposta 10 dias";

/** The fields the PDF needs, and nothing else (internal ids stay private). */
export function pdfData(o: Orcamento): OrcamentoPdf {
  const { numero, cliente, endereco, data_iso, itens, prazo, cond_pag, observacoes, header_key } = o;
  return { numero, cliente, endereco, data_iso, itens, prazo, cond_pag, observacoes, header_key };
}

/** Item index → "01", "02", ... two-digit output number. */
export function itemNumero(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Items that actually carry a value (used for total + "at least one" rule). */
export function itensComValor(itens: OrcamentoItem[]): OrcamentoItem[] {
  return itens.filter((i) => !i.a_combinar && Number.isFinite(i.valor_centavos) && i.valor_centavos > 0);
}

/** Printed instead of a price for items whose value is still to be agreed. */
export const A_COMBINAR = "A combinar";

/** Sum of all priced item values ("a combinar" items excluded), in centavos. */
export function totalCentavos(itens: OrcamentoItem[]): number {
  return itens.reduce(
    (sum, i) => sum + (!i.a_combinar && Number.isFinite(i.valor_centavos) ? i.valor_centavos : 0),
    0,
  );
}

/**
 * The TOTAL line. With some items "a combinar" the label says they are left
 * out; with every item "a combinar" there is no amount (`centavos` is null).
 */
export function totalLinha(itens: OrcamentoItem[]): { label: string; centavos: number | null } {
  const pendentes = itens.filter((i) => i.a_combinar).length;
  if (pendentes === itens.length) return { label: "TOTAL", centavos: null };
  return {
    label: pendentes ? "TOTAL (exceto itens a combinar)" : "TOTAL",
    centavos: totalCentavos(itens),
  };
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
