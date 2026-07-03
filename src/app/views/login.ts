// Login screen — one shared password (BUILD_SPEC §12).

import { api } from "../api";
import { h, mount } from "../ui";

export function renderLogin(onSuccess: () => void): void {
  const error = h("p", { class: "error-text", role: "alert" });
  error.style.visibility = "hidden";

  const input = h("input", {
    type: "password",
    id: "senha",
    autocomplete: "current-password",
    "aria-label": "Senha",
  }) as HTMLInputElement;

  const btn = h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Entrar");

  const form = h(
    "form",
    {
      onsubmit: async (e: Event) => {
        e.preventDefault();
        error.style.visibility = "hidden";
        btn.setAttribute("disabled", "true");
        btn.textContent = "Entrando…";
        try {
          await api.login(input.value);
          onSuccess();
        } catch (err) {
          const message = (err as Error).message || "Senha incorreta. Tente novamente.";
          error.textContent = message;
          error.style.visibility = "visible";
          btn.removeAttribute("disabled");
          btn.textContent = "Entrar";
          input.focus();
          input.select();
        }
      },
    },
    h(
      "div",
      { class: "field" },
      h("label", { for: "senha" }, "Senha"),
      input,
    ),
    error,
    btn,
  );

  const box = h(
    "div",
    { class: "login-box" },
    h("img", { src: "/logo_final.png", alt: "Stilus Decora" }),
    h("h1", { class: "title" }, "Entrar"),
    form,
  );

  mount(h("div", { class: "wrap" }, box));
  input.focus();
}
