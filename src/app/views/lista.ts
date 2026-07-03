// Lista screen — list of orçamentos + "Novo orçamento" (BUILD_SPEC §12).

import { api } from "../api";
import type { OrcamentoListItem } from "../../shared/types";
import { confirmDialog, h, mount, shortDate } from "../ui";
import { goEditor, logout } from "../main";

let showArchived = false;
let search = "";

export async function renderLista(): Promise<void> {
  mount(h("div", { class: "wrap" }, h("p", { class: "empty" }, "Carregando…")));
  let items: OrcamentoListItem[] = [];
  try {
    const res = await api.list(showArchived);
    items = res.orcamentos;
  } catch {
    mount(h("div", { class: "wrap" }, h("p", { class: "error-text" }, "Não foi possível carregar. Recarregue a página.")));
    return;
  }

  const searchInput = h("input", {
    type: "text",
    placeholder: "Procurar orçamento",
    "aria-label": "Procurar orçamento",
    value: search,
    oninput: (e: Event) => {
      search = (e.target as HTMLInputElement).value;
      renderRows();
    },
  }) as HTMLInputElement;

  const archivedToggle = h(
    "button",
    {
      class: `btn ${showArchived ? "btn-secondary" : "btn-tertiary"} btn-block`,
      type: "button",
      "aria-pressed": String(showArchived),
      onclick: () => {
        showArchived = !showArchived;
        renderLista();
      },
    },
    showArchived ? "🗂️ Ocultar arquivados" : "🗂️ Mostrar arquivados",
  );

  const activeHost = h("div", {});
  const archivedHost = h("div", {});

  const container = h(
    "div",
    { class: "wrap" },
    h(
      "div",
      { class: "topbar" },
      h("span", { class: "title grow" }, "Meus orçamentos"),
      h(
        "button",
        { class: "btn btn-primary", onclick: () => onNovo() },
        h("span", { class: "ico" }, "＋"),
        "Novo orçamento",
      ),
      h("button", { class: "btn btn-tertiary", onclick: () => logout() }, "Sair"),
    ),
    h("div", { class: "field", style: "margin-top:12px;margin-bottom:14px" }, searchInput),
    activeHost,
    h("div", { style: "margin-top:22px" }, archivedToggle),
    archivedHost,
  );

  function matches(o: OrcamentoListItem, term: string): boolean {
    if (!term) return true;
    return (
      o.nome.toLowerCase().includes(term) ||
      (o.cliente ?? "").toLowerCase().includes(term) ||
      String(o.numero ?? "").includes(term)
    );
  }

  function renderRows(): void {
    const term = search.trim().toLowerCase();
    const ativos = items.filter((o) => o.status === "ativo" && matches(o, term));
    const arquivados = items.filter((o) => o.status === "arquivado" && matches(o, term));

    // active orçamentos
    if (ativos.length === 0) {
      activeHost.replaceChildren(
        h(
          "div",
          { class: "empty" },
          items.filter((o) => o.status === "ativo").length === 0
            ? 'Você ainda não tem orçamentos. Toque em "＋ Novo orçamento" para começar.'
            : "Nenhum orçamento encontrado.",
        ),
      );
    } else {
      activeHost.replaceChildren(...ativos.map((o) => rowCard(o)));
    }

    // archived section — appears right below the toggle, clearly separated
    if (showArchived) {
      archivedHost.replaceChildren(
        h(
          "div",
          { class: "archived-section" },
          h("h2", { class: "archived-title" }, `🗂️ Arquivados${arquivados.length ? ` (${arquivados.length})` : ""}`),
          arquivados.length === 0
            ? h("p", { class: "empty", style: "padding:16px" }, "Nenhum orçamento arquivado.")
            : h("div", {}, ...arquivados.map((o) => rowCard(o))),
        ),
      );
    } else {
      archivedHost.replaceChildren();
    }
  }

  function rowCard(o: OrcamentoListItem): HTMLElement {
    const arquivado = o.status === "arquivado";
    return h(
      "div",
      { class: `card${arquivado ? " card-archived" : ""}` },
      h(
        "div",
        { class: "row-main" },
        o.numero !== null ? h("span", { class: "row-numero" }, `nº ${o.numero}`) : null,
        h("span", { class: "row-nome" }, o.nome),
      ),
      h(
        "div",
        { class: "row-sub" },
        [o.cliente, `atualizado ${shortDate(o.updated_at)}`].filter(Boolean).join(" · "),
      ),
      h(
        "div",
        { class: "row-actions" },
        h("button", { class: "btn btn-secondary", onclick: () => goEditor(o.id) }, "Abrir"),
        h("button", { class: "btn btn-tertiary", onclick: () => onCopy(o.id) }, "Fazer uma cópia"),
        h(
          "button",
          { class: "btn btn-tertiary", onclick: () => onArchive(o) },
          arquivado ? "Desarquivar" : "Arquivar",
        ),
        arquivado ? h("button", { class: "btn btn-danger", onclick: () => onDelete(o) }, "Apagar") : null,
      ),
    );
  }

  async function onNovo(): Promise<void> {
    try {
      const res = await api.create({ nome: "", itens: [{ descricao: "", valor_centavos: 0 }] });
      goEditor(res.orcamento.id);
    } catch {
      /* ignore */
    }
  }

  async function onCopy(id: string): Promise<void> {
    try {
      const res = await api.copy(id);
      goEditor(res.orcamento.id);
    } catch {
      /* ignore */
    }
  }

  async function onArchive(o: OrcamentoListItem): Promise<void> {
    if (o.status === "arquivado") {
      await api.archive(o.id, "ativo").catch(() => {});
      renderLista();
      return;
    }
    const ok = await confirmDialog({ title: "Arquivar este orçamento?", confirmLabel: "Arquivar" });
    if (!ok) return;
    await api.archive(o.id, "arquivado").catch(() => {});
    renderLista();
  }

  async function onDelete(o: OrcamentoListItem): Promise<void> {
    const ok = await confirmDialog({
      title: "Tem certeza que deseja apagar? Isso não pode ser desfeito.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    await api.remove(o.id).catch(() => {});
    renderLista();
  }

  renderRows();
  mount(container);
}
