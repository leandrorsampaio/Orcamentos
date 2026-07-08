// Tiny DOM helpers + confirm dialog. No framework — plain, predictable UI.

import { MESES } from "../shared/date";

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "class") {
      el.className = String(v);
    } else if (k === "html") {
      el.innerHTML = String(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function mount(node: Node): void {
  const app = document.getElementById("app")!;
  app.replaceChildren(node);
  window.scrollTo(0, 0);
}

export interface ConfirmOpts {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Modal confirm dialog. Resolves true on confirm, false on cancel/backdrop. */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (result: boolean) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    const confirmBtn = h(
      "button",
      { class: `btn ${opts.danger ? "btn-danger" : "btn-primary"}`, onclick: () => close(true) },
      opts.confirmLabel,
    );
    const dialog = h(
      "div",
      { class: "dialog", role: "dialog", "aria-modal": "true" },
      h("h2", {}, opts.title),
      h(
        "div",
        { class: "dialog-actions" },
        h("button", { class: "btn btn-tertiary", onclick: () => close(false) }, opts.cancelLabel ?? "Cancelar"),
        confirmBtn,
      ),
    );
    const overlay: HTMLDivElement = h(
      "div",
      { class: "overlay", onclick: (e: Event) => e.target === overlay && close(false) },
      dialog,
    );
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey);
    (confirmBtn as HTMLElement).focus();
  });
}

/** Format an ISO timestamp as a short PT-BR "DD/MM/AAAA". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Format an ISO timestamp as PT-BR por extenso: "28 de julho de 2026". */
export function longDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
