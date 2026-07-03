// Editor screen — a structured form (NOT a rich-text editor) that renders into
// the fixed layout. Autosaves, shows a live PDF preview, and exposes the
// share/send actions (BUILD_SPEC §4, §7, §12).

import { api } from "../api";
import type { Orcamento, OrcamentoInput, OrcamentoItem } from "../../shared/types";
import { formatCentavos, parseCentavos } from "../../shared/money";
import { todayIso } from "../../shared/date";
import { confirmDialog, h, mount } from "../ui";
import { goEditor, goLista } from "../main";
import { downloadPdf, pdfBase64, pdfFilename, printPdf, pdfBlobUrl } from "../pdf-client";

export async function renderEditor(id: string): Promise<void> {
  mount(h("div", { class: "wrap" }, h("p", { class: "empty" }, "Carregando…")));
  let model: Orcamento;
  try {
    const res = await api.get(id);
    model = res.orcamento;
  } catch {
    mount(
      h(
        "div",
        { class: "wrap" },
        h("p", { class: "error-text" }, "Orçamento não encontrado."),
        h("button", { class: "btn btn-secondary", onclick: () => goLista() }, "Voltar"),
      ),
    );
    return;
  }
  if (model.itens.length === 0) model.itens.push({ descricao: "", valor_centavos: 0 });

  // Default the date to today so it always prints unless the user changes it.
  let dirty = false;
  if (!model.data_iso) {
    model.data_iso = todayIso();
    dirty = true;
  }

  // ---- save + preview scheduling ----
  let saveTimer = 0;
  let previewTimer = 0;

  const savedEl = h("span", { class: "saved hidden" }, "Salvo ✓");
  function setSaved(state: "idle" | "saving" | "saved"): void {
    savedEl.classList.remove("hidden", "saving");
    if (state === "saving") {
      savedEl.classList.add("saving");
      savedEl.textContent = "Salvando…";
    } else if (state === "saved") {
      savedEl.textContent = "Salvo ✓";
    } else {
      savedEl.classList.add("hidden");
    }
  }

  function toInput(): OrcamentoInput {
    return {
      nome: model.nome,
      cliente: model.cliente,
      endereco: model.endereco,
      data_iso: model.data_iso,
      itens: model.itens,
      prazo: model.prazo,
      cond_pag: model.cond_pag,
      header_key: model.header_key,
    };
  }

  async function doSave(): Promise<void> {
    if (!dirty) return;
    dirty = false;
    setSaved("saving");
    try {
      const res = await api.update(model.id, toInput());
      model.numero = res.orcamento.numero;
      model.share_id = res.orcamento.share_id;
      setSaved("saved");
    } catch {
      dirty = true;
      setSaved("idle");
    }
  }

  function scheduleSave(): void {
    dirty = true;
    setSaved("saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(doSave, 1200);
  }

  async function flushSave(): Promise<void> {
    window.clearTimeout(saveTimer);
    await doSave();
  }

  // ---- live preview ----
  const previewFrame = h("iframe", {
    class: "preview-frame",
    title: "Prévia do orçamento",
  }) as HTMLIFrameElement;
  let lastPreviewUrl = "";
  let previewBusy = false;

  async function refreshPreview(): Promise<void> {
    if (previewBusy) return;
    previewBusy = true;
    try {
      const url = await pdfBlobUrl(model);
      // open with the thumbnail sidebar collapsed (Chrome: navpanes, Firefox: pagemode)
      previewFrame.src = url + "#navpanes=0&pagemode=none";
      if (lastPreviewUrl) URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = url;
    } catch {
      /* ignore preview errors */
    } finally {
      previewBusy = false;
    }
  }
  function schedulePreview(): void {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(refreshPreview, 700);
  }

  function changed(): void {
    scheduleSave();
    schedulePreview();
  }

  // ---- field factories ----
  function textField(
    label: string,
    value: string,
    onInput: (v: string) => void,
    opts: { help?: string; type?: string; multiline?: boolean } = {},
  ): HTMLElement {
    const id2 = "f_" + Math.random().toString(36).slice(2, 8);
    const control = opts.multiline
      ? (h("textarea", {
          id: id2,
          oninput: (e: Event) => {
            onInput((e.target as HTMLTextAreaElement).value);
            changed();
          },
        }) as HTMLTextAreaElement)
      : (h("input", {
          id: id2,
          type: opts.type ?? "text",
          value,
          oninput: (e: Event) => {
            onInput((e.target as HTMLInputElement).value);
            changed();
          },
          onblur: () => flushSave(),
        }) as HTMLInputElement);
    if (opts.multiline) (control as HTMLTextAreaElement).value = value;
    return h(
      "div",
      { class: "field" },
      h("label", { for: id2 }, label),
      opts.help ? h("p", { class: "help" }, opts.help) : null,
      control,
    );
  }

  // ---- items ----
  const itemsHost = h("div", {});

  function renderItems(): void {
    itemsHost.replaceChildren(
      ...model.itens.map((item, idx) => itemCard(item, idx)),
    );
  }

  function itemCard(item: OrcamentoItem, idx: number): HTMLElement {
    const numero = String(idx + 1).padStart(2, "0");
    const desc = h("textarea", {
      "aria-label": `Descrição do item ${numero}`,
      oninput: (e: Event) => {
        item.descricao = (e.target as HTMLTextAreaElement).value;
        changed();
      },
    }) as HTMLTextAreaElement;
    desc.value = item.descricao;

    const valor = h("input", {
      type: "text",
      inputmode: "decimal",
      "aria-label": `Valor do item ${numero}`,
      placeholder: "0,00",
      value: item.valor_centavos ? formatCentavos(item.valor_centavos) : "",
      oninput: (e: Event) => {
        item.valor_centavos = parseCentavos((e.target as HTMLInputElement).value) ?? 0;
        changed();
      },
      onblur: (e: Event) => {
        const el = e.target as HTMLInputElement;
        el.value = item.valor_centavos ? formatCentavos(item.valor_centavos) : "";
        flushSave();
      },
    }) as HTMLInputElement;

    return h(
      "div",
      { class: "item-card" },
      h(
        "div",
        { class: "item-head" },
        h("span", { class: "item-num" }, `Item ${numero}`),
        h(
          "div",
          { class: "item-ctrls" },
          h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": "Mover para cima",
              ...(idx === 0 ? { disabled: "true" } : {}),
              onclick: () => moveItem(idx, -1),
            },
            "↑",
          ),
          h(
            "button",
            {
              class: "icon-btn",
              type: "button",
              "aria-label": "Mover para baixo",
              ...(idx === model.itens.length - 1 ? { disabled: "true" } : {}),
              onclick: () => moveItem(idx, 1),
            },
            "↓",
          ),
          h(
            "button",
            {
              class: "icon-btn danger",
              type: "button",
              "aria-label": "Remover item",
              onclick: () => removeItem(idx),
            },
            "✕",
          ),
        ),
      ),
      h(
        "div",
        { class: "field", style: "margin-bottom:10px" },
        h("label", {}, "Descrição"),
        desc,
      ),
      h(
        "div",
        { class: "field", style: "margin-bottom:0" },
        h("label", {}, "Valor"),
        h(
          "div",
          { class: "valor-row" },
          h("span", { class: "prefix" }, "R$"),
          valor,
        ),
      ),
    );
  }

  function moveItem(idx: number, dir: number): void {
    const j = idx + dir;
    if (j < 0 || j >= model.itens.length) return;
    [model.itens[idx], model.itens[j]] = [model.itens[j], model.itens[idx]];
    renderItems();
    changed();
  }

  async function removeItem(idx: number): Promise<void> {
    const ok = await confirmDialog({ title: "Remover este item?", confirmLabel: "Remover", danger: true });
    if (!ok) return;
    model.itens.splice(idx, 1);
    if (model.itens.length === 0) model.itens.push({ descricao: "", valor_centavos: 0 });
    renderItems();
    changed();
  }

  function addItem(): void {
    model.itens.push({ descricao: "", valor_centavos: 0 });
    renderItems();
    changed();
    itemsHost.lastElementChild?.querySelector("textarea")?.focus();
  }

  // ---- toolbar actions ----
  async function onVoltar(): Promise<void> {
    await flushSave();
    goLista();
  }

  async function onPdf(): Promise<void> {
    await flushSave();
    await downloadPdf(model);
  }

  async function onImprimir(): Promise<void> {
    await flushSave();
    await printPdf(model);
  }

  async function onWhatsApp(): Promise<void> {
    await flushSave();
    const link = `${location.origin}/o/${model.share_id}`;
    const msg = `Olá! Segue o orçamento da Stilus Decora: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function onCopy(): Promise<void> {
    await flushSave();
    try {
      const res = await api.copy(model.id);
      goEditor(res.orcamento.id);
    } catch {
      /* ignore */
    }
  }

  async function onEmail(): Promise<void> {
    await flushSave();
    openEmailDialog(model);
  }

  async function onRevoke(): Promise<void> {
    const ok = await confirmDialog({
      title: "Desativar o link de compartilhamento? Quem tiver o link antigo não conseguirá mais abrir.",
      confirmLabel: "Desativar",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.revokeLink(model.id);
      model.share_id = res.orcamento.share_id;
    } catch {
      /* ignore */
    }
  }

  // ---- assemble ----
  const nomeInput = h("input", {
    type: "text",
    "aria-label": "Nome do orçamento",
    placeholder: "Nome do orçamento",
    value: model.nome,
    oninput: (e: Event) => {
      model.nome = (e.target as HTMLInputElement).value;
      changed();
    },
    onblur: () => flushSave(),
    style: "min-width:0",
  }) as HTMLInputElement;

  const shareActions = h(
    "div",
    { class: "toolbar-actions" },
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onImprimir() }, "🖨️ Imprimir"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onPdf() }, "⬇️ PDF"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onWhatsApp() }, "💬 WhatsApp"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onEmail() }, "✉️ E-mail"),
    h("button", { class: "btn btn-tertiary", type: "button", onclick: () => onRevoke() }, "🔗 Desativar link"),
  );

  const adicionarItemBtn = h(
    "button",
    { class: "btn btn-primary btn-block", type: "button", onclick: () => addItem(), style: "margin-top:4px" },
    h("span", { class: "ico" }, "＋"),
    "Adicionar item",
  );

  // always-on preview panel (right column on desktop, below on phone)
  const previewPanel = h(
    "section",
    { class: "section preview-panel" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { class: "section-title" }, "Como vai ficar"),
      h("button", { class: "btn btn-secondary", type: "button", onclick: () => refreshPreview() }, "🔄 Atualizar"),
    ),
    previewFrame,
  );

  renderItems();

  const container = h(
    "div",
    { class: "wrap editor-page" },
    // sticky top toolbar: Voltar + Salvar + saved + Fazer uma cópia
    h(
      "div",
      { class: "topbar" },
      h("button", { class: "btn btn-tertiary", type: "button", onclick: () => onVoltar() }, "← Voltar"),
      h("button", { class: "btn btn-secondary", type: "button", onclick: () => flushSave() }, "Salvar"),
      savedEl,
      h("span", { class: "grow" }),
      h("button", { class: "btn btn-tertiary", type: "button", onclick: () => onCopy() }, "📄 Fazer uma cópia"),
    ),

    h(
      "div",
      { class: "editor-grid" },
      h(
        "div",
        { class: "editor-col-form" },
        // Section 1 — dados do orçamento (até a data)
        h(
      "section",
      { class: "section" },
      h(
        "div",
        { class: "section-head" },
        h("h2", { class: "section-title" }, "Dados do orçamento"),
        model.numero !== null ? h("span", { class: "badge" }, `nº ${model.numero}`) : null,
      ),
      h(
        "div",
        { class: "field" },
        h("label", { for: "nome" }, "Nome do orçamento"),
        h("p", { class: "help" }, 'Só para você encontrar depois. Ex.: "Cliente Edson - armários"'),
        nomeInput,
      ),
      textField("Cliente", model.cliente ?? "", (v) => (model.cliente = v)),
      textField("Endereço", model.endereco ?? "", (v) => (model.endereco = v)),
      h(
        "div",
        { class: "field", style: "margin-bottom:0" },
        h("label", { for: "data" }, "Data"),
        h("input", {
          id: "data",
          type: "date",
          value: model.data_iso ?? todayIso(),
          oninput: (e: Event) => {
            model.data_iso = (e.target as HTMLInputElement).value || null;
            changed();
          },
          onblur: () => flushSave(),
        }),
      ),
    ),

    // Section 2 — itens
    h(
      "section",
      { class: "section" },
      h("h2", { class: "section-title" }, "Itens do orçamento"),
      itemsHost,
      adicionarItemBtn,
    ),

    // Section 3 — prazo e pagamento
    h(
      "section",
      { class: "section" },
      h("h2", { class: "section-title" }, "Prazo e pagamento"),
      textField("Prazo de entrega", model.prazo ?? "", (v) => (model.prazo = v), { help: 'Ex.: "10 dias"' }),
      (() => {
        const f = textField("Condição de pagamento", model.cond_pag ?? "", (v) => (model.cond_pag = v));
        f.style.marginBottom = "0";
        return f;
      })(),
    ),

        // Section 4 — enviar
        h(
          "section",
          { class: "section" },
          h("h2", { class: "section-title" }, "Enviar orçamento:"),
          shareActions,
        ),
      ),

      // right column (desktop) / below (phone): live preview
      h("div", { class: "editor-col-preview" }, previewPanel),
    ),
  );

  mount(container);
  if (dirty) void doSave();
  void refreshPreview();
}

// ---- E-mail dialog ----
function openEmailDialog(model: Orcamento): void {
  const to = h("input", { type: "email", id: "to", inputmode: "email", "aria-label": "Para (e-mail)" }) as HTMLInputElement;
  const subject = h("input", { type: "text", id: "subject", "aria-label": "Assunto" }) as HTMLInputElement;
  subject.value = `Orçamento — ${model.nome}`;
  const bodyEl = h("textarea", { id: "body", "aria-label": "Mensagem" }) as HTMLTextAreaElement;
  bodyEl.value = "Segue em anexo o orçamento da Stilus Decora.";
  const status = h("p", { class: "help", role: "status" }, "");
  const sendBtn = h("button", { class: "btn btn-primary" }, "Enviar");

  const close = () => overlay.remove();

  async function doSend(): Promise<void> {
    if (!to.value.trim()) {
      status.textContent = "Informe um e-mail.";
      to.focus();
      return;
    }
    sendBtn.setAttribute("disabled", "true");
    status.textContent = "Enviando…";
    try {
      const b64 = await pdfBase64(model);
      await api.sendEmail({
        to: to.value.trim(),
        subject: subject.value.trim(),
        body: bodyEl.value.trim(),
        pdfBase64: b64,
        nome: pdfFilename(model).replace(/\.pdf$/, ""),
      });
      status.textContent = "Enviado ✓";
      setTimeout(close, 900);
    } catch (err) {
      status.textContent = (err as Error).message || "Não foi possível enviar. Tente de novo.";
      sendBtn.removeAttribute("disabled");
    }
  }
  sendBtn.addEventListener("click", doSend);

  const dialog = h(
    "div",
    { class: "dialog", role: "dialog", "aria-modal": "true" },
    h("h2", {}, "Enviar por e-mail"),
    h("div", { class: "field" }, h("label", { for: "to" }, "Para (e-mail)"), to),
    h("div", { class: "field" }, h("label", { for: "subject" }, "Assunto"), subject),
    h("div", { class: "field" }, h("label", { for: "body" }, "Mensagem"), bodyEl),
    status,
    h(
      "div",
      { class: "dialog-actions" },
      h("button", { class: "btn btn-tertiary", onclick: close }, "Cancelar"),
      sendBtn,
    ),
  );
  const overlay: HTMLDivElement = h("div", { class: "overlay", onclick: (e: Event) => e.target === overlay && close() }, dialog);
  document.body.appendChild(overlay);
  to.focus();
}
