"use strict";

// Liga o botão de alternar tema claro/escuro presente no cabeçalho de
// toda página (ver theme-init.js pra como o tema é aplicado antes da
// primeira pintura).
(function () {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const lightIcon = btn.querySelector(".theme-toggle__icon-light");
  const darkIcon = btn.querySelector(".theme-toggle__icon-dark");

  function isDarkActive() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function updateIcons() {
    const dark = isDarkActive();
    if (lightIcon) lightIcon.hidden = dark;
    if (darkIcon) darkIcon.hidden = !dark;
    btn.setAttribute("aria-label", dark ? "Mudar para tema claro" : "Mudar para tema escuro");
  }

  updateIcons();

  btn.addEventListener("click", () => {
    const next = isDarkActive() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // localStorage indisponível (ex.: modo privado restrito) — o tema
      // ainda muda pra essa visita, só não persiste pra próxima.
    }
    updateIcons();
  });
})();
