"use strict";

/* ---------------------------------------------------------
   Conexão do usuário com o Mercado Livre — movida de index.html pra cá
   pra liberar espaço na tela da calculadora (o que muda dinamicamente com
   o preço/taxa continua lá; o que é "configuração", fica aqui). Mesma
   lógica de antes, só que sem competir por espaço com o formulário de
   precificação. Ver /api/auth/start, /api/ml-connection (GET = status,
   POST = desconectar).
   --------------------------------------------------------- */

async function initMlConnectBanner() {
  const banner = document.getElementById("mlConnect");
  const badgeEl = document.getElementById("mlConnectBadge");
  const titleEl = document.getElementById("mlConnectTitle");
  const subtitleEl = document.getElementById("mlConnectSubtitle");
  const connectBtn = document.getElementById("mlConnectBtn");
  const disconnectBtn = document.getElementById("mlDisconnectBtn");
  if (!banner) return;

  try {
    const resp = await fetch("/api/ml-connection", { credentials: "same-origin" });
    if (!resp.ok) return;
    const { connected } = await resp.json();

    banner.classList.toggle("ml-connect--connected", connected);
    badgeEl.hidden = !connected;
    if (connected) {
      titleEl.textContent = "Mercado Livre conectado";
      subtitleEl.textContent = "A calculadora usa a taxa e o frete reais da sua conta quando disponíveis.";
      connectBtn.hidden = true;
      disconnectBtn.hidden = false;
    } else {
      titleEl.textContent = "Conecte sua conta do Mercado Livre";
      subtitleEl.textContent = "Sem conectar, a calculadora usa taxas de referência em vez dos valores reais da sua conta.";
      connectBtn.hidden = false;
      disconnectBtn.hidden = true;
    }
    banner.hidden = false;

    if (new URLSearchParams(window.location.search).get("ml_connected") === "1") {
      subtitleEl.textContent = "Conectado agora! " + subtitleEl.textContent;
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch {
    // se a checagem falhar, o banner simplesmente não aparece
  }
}

document.getElementById("mlDisconnectBtn")?.addEventListener("click", async () => {
  const disconnectBtn = document.getElementById("mlDisconnectBtn");
  disconnectBtn.disabled = true;
  try {
    await fetch("/api/ml-connection", { method: "POST", credentials: "same-origin" });
  } finally {
    disconnectBtn.disabled = false;
    initMlConnectBanner();
  }
});

initMlConnectBanner();
