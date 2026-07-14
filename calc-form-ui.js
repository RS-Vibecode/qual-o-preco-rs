"use strict";

/* ---------------------------------------------------------
   Interação visual do formulário da calculadora (repaginação: chips de
   marketplace, accordion de frete, tooltips de ajuda e prévia de preço ao
   vivo). Roda depois de script.js — reaproveita formatBRL/parseLocaleNumber,
   já globais nesse script clássico (sem type="module") — e não mexe em
   nenhuma lógica de cálculo/validação, só abre/fecha coisas e mostra uma
   estimativa simples. Os ids dos campos continuam exatamente os mesmos que
   script.js já lê (#shopeeInclude, #amazonCategory, #categoryQuery...).
   --------------------------------------------------------- */

/* ---- Chips de marketplace ---- */
function setupMarketplaceChip({ toggleId, bodyId, statusEl, controlEl, isActiveFn }) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!toggle || !body) return;
  const chip = toggle.closest(".marketplace-chip");

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
  });

  if (controlEl && statusEl) {
    const refresh = () => {
      const active = isActiveFn(controlEl);
      chip.classList.toggle("is-active", active);
      statusEl.textContent = active ? "Incluído" : "Não incluído";
    };
    controlEl.addEventListener("change", refresh);
    refresh();
  }
}

setupMarketplaceChip({ toggleId: "meliChipToggle", bodyId: "meliChipBody" });

setupMarketplaceChip({
  toggleId: "amazonChipToggle",
  bodyId: "amazonChipBody",
  statusEl: document.getElementById("amazonChipStatus"),
  controlEl: document.getElementById("amazonCategory"),
  isActiveFn: (el) => !!el.value,
});

setupMarketplaceChip({
  toggleId: "shopeeChipToggle",
  bodyId: "shopeeChipBody",
  statusEl: document.getElementById("shopeeChipStatus"),
  controlEl: document.getElementById("shopeeInclude"),
  isActiveFn: (el) => el.checked,
});

setupMarketplaceChip({
  toggleId: "tiktokChipToggle",
  bodyId: "tiktokChipBody",
  statusEl: document.getElementById("tiktokChipStatus"),
  controlEl: document.getElementById("tiktokInclude"),
  isActiveFn: (el) => el.checked,
});

/* ---- Accordion de frete ---- */
const freightToggle = document.getElementById("freightToggle");
const freightBody = document.getElementById("freightBody");
freightToggle?.addEventListener("click", () => {
  const expanded = freightToggle.getAttribute("aria-expanded") === "true";
  freightToggle.setAttribute("aria-expanded", String(!expanded));
  freightBody.hidden = expanded;
});

/* ---- Tooltips de campo ----
   O conteúdo do balão já está sempre no DOM (associado via
   aria-describedby, ver index.html) — aqui só controla a visibilidade
   *visual* (classe is-open), nunca [hidden], pra não sumir da árvore de
   acessibilidade. */
const tooltipButtons = Array.from(document.querySelectorAll(".field-tooltip__btn"));

function closeAllTooltips(except) {
  tooltipButtons.forEach((btn) => {
    if (btn === except) return;
    btn.setAttribute("aria-expanded", "false");
    document.getElementById(btn.getAttribute("aria-controls"))?.classList.remove("is-open", "align-right");
  });
}

tooltipButtons.forEach((btn) => {
  const bubble = document.getElementById(btn.getAttribute("aria-controls"));
  if (!bubble) return;
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    closeAllTooltips(btn);
    btn.setAttribute("aria-expanded", String(!isOpen));
    bubble.classList.toggle("is-open", !isOpen);

    if (!isOpen) {
      // Alinhado à esquerda por padrão — só troca pra direita se isso
      // vazaria pra fora da tela (o balão tem largura própria e sempre
      // está no layout, mesmo fechado/opacity:0, então dá pra medir
      // antes de decidir).
      bubble.classList.remove("align-right");
      const rect = bubble.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        bubble.classList.add("align-right");
      }
    }
  });
});

document.addEventListener("click", () => closeAllTooltips());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllTooltips();
});

/* ---- Prévia de preço ao vivo ----
   Estimativa simples (custo × markup, sem taxa nenhuma) enquanto o
   usuário digita — só um ponto de partida "vivo"; o resultado final (com
   taxas reais) continua saindo só depois de "Calcular preço". */
const livePreview = document.getElementById("livePreview");
const livePreviewValue = document.getElementById("livePreviewValue");
const productCostInput = document.getElementById("productCost");
const markupPctInput = document.getElementById("markupPct");

function updateLivePreview() {
  if (!livePreview || !productCostInput || !markupPctInput) return;
  const cost = parseLocaleNumber(productCostInput.value);
  const markup = parseLocaleNumber(markupPctInput.value);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(markup) || markup < 0) {
    livePreview.hidden = true;
    return;
  }
  livePreviewValue.textContent = formatBRL(cost * (1 + markup / 100));
  livePreview.hidden = false;
}

productCostInput?.addEventListener("input", updateLivePreview);
markupPctInput?.addEventListener("input", updateLivePreview);

/* ---- "Nova simulação" também deve voltar os chips/accordion/prévia pro
   estado inicial — form.reset() (chamado em script.js) restaura os
   valores dos campos mas não dispara "change", então sem isso os chips
   opcionais ficariam mostrando "Incluído" de forma incorreta. */
document.getElementById("clear-btn")?.addEventListener("click", () => {
  if (livePreview) livePreview.hidden = true;

  ["amazonCategory", "shopeeInclude", "tiktokInclude"].forEach((id) => {
    document.getElementById(id)?.dispatchEvent(new Event("change"));
  });

  [
    ["amazonChipToggle", "amazonChipBody"],
    ["shopeeChipToggle", "shopeeChipBody"],
    ["tiktokChipToggle", "tiktokChipBody"],
  ].forEach(([toggleId, bodyId]) => {
    const toggle = document.getElementById(toggleId);
    const body = document.getElementById(bodyId);
    if (toggle && body) {
      toggle.setAttribute("aria-expanded", "false");
      body.hidden = true;
    }
  });

  if (freightToggle && freightBody) {
    freightToggle.setAttribute("aria-expanded", "false");
    freightBody.hidden = true;
  }

  closeAllTooltips();
});
