// Login screen — one shared password (BUILD_SPEC §12). The same form is also
// shown as a dialog when the session runs out while the app is open.

import { api } from "../api";
import { h, mount } from "../ui";

function loginForm(onSuccess: () => void): { form: HTMLFormElement; input: HTMLInputElement } {
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
  return { form, input };
}

export function renderLogin(onSuccess: () => void): void {
  const { form, input } = loginForm(onSuccess);
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

/** Ask for the password again over the current screen, so nothing is lost. */
export function loginDialog(): Promise<void> {
  return new Promise((resolve) => {
    const { form, input } = loginForm(() => {
      overlay.remove();
      resolve();
    });
    const overlay = h(
      "div",
      { class: "overlay" },
      h(
        "div",
        { class: "dialog", role: "dialog", "aria-modal": "true" },
        h("h2", {}, "Sua sessão expirou"),
        h("p", {}, "Digite a senha para continuar. O que você fez não foi perdido."),
        form,
      ),
    );
    document.body.appendChild(overlay);
    input.focus();
  });
}
