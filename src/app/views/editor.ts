// Editor screen — a structured form (NOT a rich-text editor) that renders into
// the fixed layout. Autosaves, shows a live PDF preview, and exposes the
// share/send actions (BUILD_SPEC §4, §7, §12).

import { api } from "../api";
import type { Orcamento, OrcamentoInput, OrcamentoItem } from "../../shared/types";
import { formatCentavos, parseCentavos } from "../../shared/money";
import { todayIso } from "../../shared/date";
import { OBSERVACOES_PADRAO } from "../../shared/orcamento";
import { confirmDialog, h, mount, onUnmount, toast, whileBusy } from "../ui";
import { goEditor, goLista } from "../main";
import { downloadPdf, printPdf, pdfBlobUrl, pdfBytes, pdfFilename } from "../pdf-client";

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

  // Defaults that always print unless the user changes them: today's date, and
  // the standard observações for a record that has none (the field shows it,
  // so the saved record and the PDF must have it too).
  let dirty = false;
  if (!model.data_iso) {
    model.data_iso = todayIso();
    dirty = true;
  }
  if (model.observacoes === null) {
    model.observacoes = OBSERVACOES_PADRAO;
    dirty = true;
  }

  // ---- save + preview scheduling ----
  let saveTimer = 0;
  let previewTimer = 0;
  let inFlight: Promise<boolean> | null = null;

  const savedEl = h("span", { class: "saved hidden" }, "Salvo ✓");
  function setSaved(state: "idle" | "saving" | "saved" | "error"): void {
    savedEl.classList.remove("hidden", "saving", "error");
    if (state === "saving") {
      savedEl.classList.add("saving");
      savedEl.textContent = "Salvando…";
    } else if (state === "saved") {
      savedEl.textContent = "Salvo ✓";
    } else if (state === "error") {
      savedEl.classList.add("error");
      savedEl.textContent = "⚠️ Não salvo — tentando de novo";
    } else {
      savedEl.classList.add("hidden");
    }
  }

  function toInput(): OrcamentoInput {
    return {
      cliente: model.cliente,
      endereco: model.endereco,
      data_iso: model.data_iso,
      itens: model.itens,
      prazo: model.prazo,
      cond_pag: model.cond_pag,
      observacoes: model.observacoes,
      header_key: model.header_key,
    };
  }

  // Save pending changes; resolves false when the save failed. A failure is
  // shown ("Não salvo") and retried by itself every few seconds. An expired
  // session is handled in api.ts (password dialog, then the save is retried).
  async function doSave(opts: { keepalive?: boolean } = {}): Promise<boolean> {
    while (inFlight) await inFlight; // one save on the wire at a time
    if (!dirty) return true;
    dirty = false;
    setSaved("saving");
    inFlight = api.update(model.id, toInput(), opts).then(
      (res) => {
        model.numero = res.orcamento.numero;
        model.share_id = res.orcamento.share_id;
        if (!dirty) setSaved("saved");
        return true;
      },
      () => {
        dirty = true;
        setSaved("error");
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(doSave, 5000);
        return false;
      },
    );
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function scheduleSave(): void {
    dirty = true;
    setSaved("saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(doSave, 1200);
  }

  async function flushSave(opts: { keepalive?: boolean } = {}): Promise<boolean> {
    window.clearTimeout(saveTimer);
    return doSave(opts);
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
    opts: { help?: string; type?: string; multiline?: boolean; rows?: number } = {},
  ): HTMLElement {
    const id2 = "f_" + Math.random().toString(36).slice(2, 8);
    const control = opts.multiline
      ? (h("textarea", {
          id: id2,
          rows: opts.rows,
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
      rows: 3,
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

    // "A combinar": the price is still to be agreed, so the value is cleared
    // and locked; the PDF prints "A combinar" and leaves it out of the total.
    function setACombinar(on: boolean): void {
      valor.disabled = on;
      valor.placeholder = on ? "" : "0,00";
      if (on) valor.value = "";
    }
    const aCombinar = h("input", {
      type: "checkbox",
      checked: !!item.a_combinar,
      onchange: (e: Event) => {
        const on = (e.target as HTMLInputElement).checked;
        item.a_combinar = on;
        if (on) item.valor_centavos = 0;
        setACombinar(on);
        if (!on) valor.focus();
        changed();
      },
    }) as HTMLInputElement;
    setACombinar(!!item.a_combinar);

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
          h("label", { class: "check" }, aCombinar, "A combinar"),
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
    if (!(await flushSave())) {
      const sair = await confirmDialog({
        title: "As últimas alterações não foram salvas (sem internet?). Sair mesmo assim?",
        confirmLabel: "Sair sem salvar",
        cancelLabel: "Ficar",
        danger: true,
      });
      if (!sair) return;
    }
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

  // Share the PDF file directly via the phone's native share sheet (Web Share
  // API). On desktop / unsupported browsers, download the PDF so it can be
  // attached manually. flushSave runs in the background so the PDF (built from
  // the in-memory model) can be shared within the click gesture (iOS Safari).
  async function onWhatsApp(): Promise<void> {
    void flushSave();
    const bytes = await pdfBytes(model);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const file = new File([blob], pdfFilename(model), { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: `Orçamento nº ${model.numero ?? ""}`.trim(),
          text: "Orçamento da Stilus Decora",
        });
      } catch {
        /* user cancelled the share sheet */
      }
    } else {
      await downloadPdf(model);
    }
  }

  // --- Older "share by link" version (kept for reference / easy re-enable) ---
  // function shareWhatsAppLink(): void {
  //   const link = `${location.origin}/o/${model.share_id}`;
  //   const msg = `Olá! Segue o orçamento da Stilus Decora: ${link}`;
  //   window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  // }

  async function onCopy(): Promise<void> {
    // the copy is made from the saved record, so the latest edits must be in
    if (!(await flushSave())) {
      toast("As alterações não foram salvas (sem internet?), então a cópia não foi feita.");
      return;
    }
    try {
      const res = await api.copy(model.id);
      goEditor(res.orcamento.id);
    } catch {
      toast("Não foi possível fazer a cópia. Verifique a internet e tente de novo.");
    }
  }

  // Opens the mail compose screen synchronously, inside the tap: a window
  // opened after an await (or after a timer) is blocked as a pop-up, mainly on
  // iPhone. The save runs in the background, like WhatsApp.
  function onEmail(): void {
    void flushSave();
    const link = `${location.origin}/o/${model.share_id}`;
    const subject = [`Orçamento nº ${model.numero ?? ""}`.trim(), (model.cliente ?? "").trim()]
      .filter(Boolean)
      .join(" — ");
    const body = `Olá! Segue o orçamento da Stilus Decora: ${link}`;
    const su = encodeURIComponent(subject);
    const bo = encodeURIComponent(body);

    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // the phone's mail app (Gmail when it is the default). A googlegmail://
      // link shows an error when the Gmail app isn't installed.
      window.location.href = `mailto:?subject=${su}&body=${bo}`;
    } else {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${su}&body=${bo}`, "_blank");
    }
  }

  // ---- assemble ----
  const shareActions = h(
    "div",
    { class: "toolbar-actions" },
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onImprimir() }, "🖨️ Imprimir"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onPdf() }, "⬇️ PDF"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onWhatsApp() }, "💬 WhatsApp"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => onEmail() }, "✉️ E-mail"),
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
      h("button", { class: "btn btn-tertiary", type: "button", onclick: (e: Event) => whileBusy(e, onCopy) }, "📄 Fazer uma cópia"),
    ),

    h(
      "div",
      { class: "editor-grid" },
      h(
        "div",
        { class: "editor-col-form" },
        // big page title: the orçamento number (there is no title field anymore)
        h("h1", { class: "editor-numero" }, model.numero !== null ? `Orçamento Nº ${model.numero}` : "Orçamento"),
        // Section 1 — dados do orçamento (até a data)
        h(
      "section",
      { class: "section" },
      h("h2", { class: "section-title" }, "Dados do orçamento"),
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
      textField("Condição de pagamento", model.cond_pag ?? "", (v) => (model.cond_pag = v)),
      (() => {
        const f = textField("Observações", model.observacoes ?? "", (v) => (model.observacoes = v), { multiline: true, rows: 3 });
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

  // Unsaved changes must survive leaving: switching apps or closing the tab
  // saves with keepalive (the request outlives the page), and closing the tab
  // also asks first. Coming back to the tab, or back online, retries a failed
  // save at once (a hidden tab's retry timer can be slowed to once a minute).
  // Registered after mount(): its unmount hooks run when the next screen is
  // shown, so a normal navigation (e.g. the back button) saves too.
  const onVisibility = () => {
    if (dirty) void flushSave(document.visibilityState === "hidden" ? { keepalive: true } : {});
  };
  const onOnline = () => {
    if (dirty) void flushSave();
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!dirty && !inFlight) return;
    void flushSave({ keepalive: true });
    e.preventDefault();
    e.returnValue = "";
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("beforeunload", onBeforeUnload);
  onUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (dirty) void flushSave();
  });
}
