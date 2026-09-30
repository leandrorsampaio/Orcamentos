// Shared domain types used by the Worker API, the SPA, and the render code.

export type HeaderKey = "lvi" | "stilus";
export type Status = "ativo" | "arquivado";

export interface OrcamentoItem {
  descricao: string;
  /** Value in integer centavos to avoid float errors. */
  valor_centavos: number;
  /** Price still to be agreed: prints "A combinar" and stays out of the total. */
  a_combinar?: boolean;
}

/** Full orçamento as used by the editor and the render code. */
export interface Orcamento {
  id: string;
  numero: number | null;
  share_id: string | null;
  nome: string;
  cliente: string | null;
  endereco: string | null;
  data_iso: string | null;
  itens: OrcamentoItem[];
  prazo: string | null;
  cond_pag: string | null;
  observacoes: string | null;
  header_key: HeaderKey;
  status: Status;
  created_at: string;
  updated_at: string;
}

/** Only what the printed PDF needs (all the public share page may expose). */
export type OrcamentoPdf = Pick<
  Orcamento,
  "numero" | "cliente" | "endereco" | "data_iso" | "itens" | "prazo" | "cond_pag" | "observacoes" | "header_key"
>;

/** Lightweight row for the Lista screen (no item bodies). */
export interface OrcamentoListItem {
  id: string;
  numero: number | null;
  nome: string;
  cliente: string | null;
  data_iso: string | null;
  updated_at: string;
  status: Status;
}

/** Editable payload accepted by POST/PUT (everything optional but `itens`). */
export interface OrcamentoInput {
  nome?: string;
  cliente?: string | null;
  endereco?: string | null;
  data_iso?: string | null;
  itens?: OrcamentoItem[];
  prazo?: string | null;
  cond_pag?: string | null;
  observacoes?: string | null;
  header_key?: HeaderKey;
}
