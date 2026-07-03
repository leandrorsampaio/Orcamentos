// SPA bootstrap + minimal history router. Two screens: Lista and Editor.

import "./styles.css";
import { api } from "./api";
import { renderLogin } from "./views/login";
import { renderLista } from "./views/lista";
import { renderEditor } from "./views/editor";
import { mount, h } from "./ui";

export type Route = { name: "lista" } | { name: "editor"; id: string };

function parse(path: string): Route {
  const m = /^\/e\/([^/]+)$/.exec(path);
  if (m) return { name: "editor", id: m[1] };
  return { name: "lista" };
}

export function navigate(path: string): void {
  history.pushState({}, "", path);
  render();
}

export function goLista(): void {
  navigate("/");
}

export function goEditor(id: string): void {
  navigate(`/e/${id}`);
}

let authed = false;

async function render(): Promise<void> {
  if (!authed) {
    renderLogin(() => {
      authed = true;
      render();
    });
    return;
  }
  const route = parse(location.pathname);
  if (route.name === "editor") {
    await renderEditor(route.id);
  } else {
    await renderLista();
  }
}

export async function logout(): Promise<void> {
  await api.logout().catch(() => {});
  authed = false;
  history.pushState({}, "", "/");
  render();
}

window.addEventListener("popstate", () => {
  render();
});

async function boot(): Promise<void> {
  mount(h("div", { class: "wrap" }, h("p", { class: "empty" }, "Carregando…")));
  try {
    const s = await api.session();
    authed = s.authed;
  } catch {
    authed = false;
  }
  render();
}

boot();
