"use strict";

// Aplica o tema salvo ANTES do CSS pintar a página (evita flash do tema
// errado). Precisa ser um arquivo externo — CSP script-src 'self' não
// permite <script> inline — carregado o mais cedo possível no <head>,
// antes até da folha de estilos.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (err) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
