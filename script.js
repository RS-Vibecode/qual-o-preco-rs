"use strict";

/* ---------------------------------------------------------
   Parsing e formatação (padrão brasileiro)
   --------------------------------------------------------- */

function parseLocaleNumber(input) {
  if (input == null) return NaN;
  let s = String(input).trim();
  if (s === "") return NaN;

  s = s.replace(/[^0-9,.\-]/g, "");
  if (s === "" || s === "-") return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  if ((s.match(/\./g) || []).length > 1) return NaN;
  if ((s.match(/-/g) || []).length > 1) return NaN;

  return Number(s);
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatBRL(value) {
  if (!Number.isFinite(value)) return "R$ 0,00";
  return brlFormatter.format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 100) / 100;
  const str = rounded.toString().replace(".", ",");
  return `${str}%`;
}

/* ---------------------------------------------------------
   Regras de cálculo

   O "lucro desejado" é um percentual de markup sobre o CUSTO (não sobre
   o preço de venda) — por isso não tem teto de 100%: um markup de 100%
   apenas dobra o custo, por exemplo. O frete pago pelo vendedor e a taxa
   fixa entram como custo repassado, fora do markup — não são
   multiplicados por ele, senão o lojista estaria "lucrando" em cima do
   próprio frete/taxa fixa.

   Preço de venda = (custo + lucro desejado + frete + taxa fixa + outros
   custos) / (1 − comissão% − impostos%)

   PV = ((CP + CA) × (1 + MK) + TF + FR) / (1 - TP)
   Preço mínimo (markup zero) = (CP + CA + TF + FR) / (1 - TP)

   Como a taxa fixa real (API do ML) e o frete real (API do ML) podem
   depender do PREÇO final — e o preço final depende deles —, o preço não
   sai de uma conta só: script.js resolve isso de forma iterativa (ver
   resolveEntryPricing e o handler de submit), recalculando até o preço
   estabilizar (ou um limite de tentativas), e só então aplica esta
   fórmula pela última vez com os valores finais.
   --------------------------------------------------------- */

function calculatePricing({ productCost, extraCosts, marketplacePct, fixedFee, markupPct, shippingCost = 0 }) {
  const tp = marketplacePct / 100;
  const mk = markupPct / 100;

  const costBase = productCost + extraCosts;
  const suggestedPrice = (costBase * (1 + mk) + fixedFee + shippingCost) / (1 - tp);
  const minPrice = (costBase + fixedFee + shippingCost) / (1 - tp);

  const commissionValue = suggestedPrice * tp; // comissão percentual, em reais
  const totalMlFees = commissionValue + fixedFee; // só as taxas do ML (sem frete)
  const totalCosts = costBase + shippingCost + totalMlFees; // custo + frete + taxas do ML
  const netProfit = suggestedPrice - totalCosts;
  const profitOverCostPct = costBase > 0 ? (netProfit / costBase) * 100 : 0; // lucro sobre o custo
  const netMarginPct = suggestedPrice > 0 ? (netProfit / suggestedPrice) * 100 : 0; // margem líquida

  return {
    totalCost: costBase,
    minPrice,
    suggestedPrice,
    commissionPct: marketplacePct,
    commissionValue,
    fixedFeeValue: fixedFee,
    shippingCostValue: shippingCost,
    totalMlFees,
    totalCosts,
    netProfit,
    profitOverCostPct,
    netMarginPct,
  };
}

/**
 * Taxa fixa de referência (só usada quando NÃO há taxa real da API — sem
 * categoria selecionada, ou consulta indisponível).
 *
 * Confirmado ao vivo contra a própria API do Mercado Livre
 * (GET /sites/MLB/listing_prices), autenticado, em 10/07/2026, testado em
 * 6 categorias bem diferentes (celulares, batom, tênis, furadeira,
 * camiseta, fone) nos dois tipos de anúncio: a taxa fixa é ~50% do preço
 * para vendas de até R$12,50, e ZERO acima disso — não R$6,00 fixo, e não
 * há degrau em R$79 (esse número aparece em vários blogs de terceiros,
 * mas não bateu com a API real em nenhuma categoria testada; pode ser
 * confusão com o limiar de frete grátis obrigatório, que é uma regra
 * diferente). Limitação: testado numa amostra de categorias, não em
 * todas — com categoria selecionada, a ferramenta sempre usa o valor real
 * da API em vez desta estimativa.
 */
function estimateReferenceFixedFee(price) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= 12.5) return Math.round(price * 0.5 * 100) / 100;
  return 0;
}

/* ---------------------------------------------------------
   DOM / validação
   --------------------------------------------------------- */

const form = document.getElementById("pricing-form");
const clearBtn = document.getElementById("clear-btn");
const resultsSection = document.getElementById("results");
const resultsEmptyEl = document.getElementById("resultsEmpty");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fieldConfig = [
  { id: "productCost", required: true, allowEmptyAsZero: false, label: "Custo do produto" },
  { id: "extraCosts", required: false, allowEmptyAsZero: true, label: "Custos adicionais" },
  { id: "markupPct", required: true, allowEmptyAsZero: false, label: "Markup desejado" },
];

function getFieldEls(id) {
  return {
    field: document.getElementById(id).closest(".field"),
    input: document.getElementById(id),
    error: document.getElementById(`${id}-error`),
  };
}

function setFieldError(id, message) {
  const { field, input, error } = getFieldEls(id);
  field.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(id) {
  const { field, input, error } = getFieldEls(id);
  field.classList.remove("has-error");
  input.removeAttribute("aria-invalid");
  error.textContent = "";
  error.hidden = true;
}

function clearAllErrors() {
  fieldConfig.forEach((cfg) => clearFieldError(cfg.id));
}

function readAndValidateField(cfg) {
  const { input } = getFieldEls(cfg.id);
  const raw = input.value.trim();

  if (raw === "") {
    if (cfg.allowEmptyAsZero) return { value: 0, error: null };
    return { value: null, error: `Informe o campo "${cfg.label}".` };
  }

  const parsed = parseLocaleNumber(raw);
  if (Number.isNaN(parsed)) {
    return { value: null, error: "Use apenas números. Vírgula ou ponto separam os decimais." };
  }
  if (parsed < 0) {
    return { value: null, error: "Valores negativos não são permitidos." };
  }
  return { value: parsed, error: null };
}

function validateAndCollect() {
  clearAllErrors();
  const values = {};
  let hasFieldError = false;

  fieldConfig.forEach((cfg) => {
    const { value, error } = readAndValidateField(cfg);
    if (error) {
      setFieldError(cfg.id, error);
      hasFieldError = true;
    } else {
      values[cfg.id] = value;
    }
  });

  if (hasFieldError) return null;

  return values;
}

function animateCountUp(el, toValue, formatFn, duration = 700, delay = 0) {
  if (prefersReducedMotion) {
    el.textContent = formatFn(toValue);
    return;
  }
  el.textContent = formatFn(0);
  setTimeout(() => {
    const start = performance.now();
    function tick(now) {
      const elapsed = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      el.textContent = formatFn(toValue * eased);
      if (elapsed < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, delay);
}

function detailRow(labelText, valueText, { highlight = false } = {}) {
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = labelText;
  const dd = document.createElement("dd");
  dd.textContent = valueText;
  if (highlight) dd.classList.add("compare-card__dd--highlight");
  row.append(dt, dd);
  return row;
}

/**
 * Barra proporcional mostrando de onde vem cada real do preço final —
 * custo, taxas do ML, frete e lucro somam exatamente r.suggestedPrice.
 * É só um resumo visual; os números exatos ficam na grade abaixo.
 */
function buildBreakdownBar(r) {
  const total = r.suggestedPrice > 0 ? r.suggestedPrice : 1;
  const segments = [
    { className: "cost", label: "Custo", value: r.totalCost },
    { className: "fees", label: "Taxas ML", value: r.totalMlFees },
    { className: "shipping", label: "Frete", value: r.shippingCostValue },
    { className: "profit", label: "Lucro", value: r.netProfit },
  ];

  const bar = document.createElement("div");
  bar.className = "compare-card__breakdown";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    segments.map((s) => `${s.label}: ${formatBRL(s.value)}`).join(", ")
  );

  const legend = document.createElement("div");
  legend.className = "compare-card__legend";

  segments.forEach((s) => {
    const pct = Math.max((s.value / total) * 100, 0);

    const seg = document.createElement("span");
    seg.className = `compare-card__breakdown-segment compare-card__breakdown-segment--${s.className}`;
    seg.style.flexBasis = `${pct}%`;
    bar.appendChild(seg);

    const legendItem = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = s.className;
    legendItem.appendChild(dot);
    legendItem.append(`${s.label} ${formatPercent(pct)}`);
    legend.appendChild(legendItem);
  });

  return { bar, legend };
}

/**
 * Devolve {pct, fixedFee} pra uma entrada num preço candidato — o "preço
 * candidato" pode ser null na primeira chamada (ainda não há estimativa).
 * Cada tipo de entrada (entry.kind) resolve isso de um jeito:
 *
 * - "ml-real": taxa e taxa fixa vieram prontas da API do ML — devolve
 *   direto, sempre a mesma coisa (ver isDynamicEntry abaixo).
 * - "amazon-tiered": percentual pode mudar acima de um valor de preço
 *   (entry.tierThreshold/pctAboveThreshold — ex.: Amazon "Acessórios
 *   Eletrônicos": 15% até R$100, 10% acima) — resolvido como um
 *   percentual "efetivo" que dá a mesma comissão em reais que a regra
 *   por faixa. Comissão mínima (entry.minFee) também é resolvida aqui:
 *   se o percentual normal renderia menos que o mínimo, o percentual
 *   efetivo passa a ser exatamente o necessário pra bater o mínimo.
 *   Tarifa fixa adicional (entry.fixedFee, ex.: R$2 de "Mídia" na Amazon)
 *   sempre soma, independente da faixa.
 * - default ("ml-reference"): taxa fixa de referência por faixa de preço
 *   do próprio Mercado Livre (ver estimateReferenceFixedFee).
 */
function resolveFeesForEntry(entry, price) {
  if (entry.kind === "ml-real") {
    return { pct: entry.pct, fixedFee: entry.fixedFee };
  }

  if (entry.kind === "amazon-tiered") {
    const p = Number.isFinite(price) && price > 0 ? price : 0;
    let pct = entry.pct;
    if (entry.tierThreshold != null && entry.pctAboveThreshold != null && p > entry.tierThreshold) {
      const commission = entry.tierThreshold * (entry.pct / 100) + (p - entry.tierThreshold) * (entry.pctAboveThreshold / 100);
      pct = p > 0 ? (commission / p) * 100 : entry.pct;
    }
    if (entry.minFee && p > 0) {
      const commissionFromPct = p * (pct / 100);
      if (commissionFromPct < entry.minFee) {
        pct = (entry.minFee / p) * 100;
      }
    }
    return { pct, fixedFee: entry.fixedFee || 0 };
  }

  // "ml-reference" (padrão): taxa fixa depende só da faixa de preço do ML.
  return { pct: entry.pct, fixedFee: estimateReferenceFixedFee(Number.isFinite(price) ? price : 0) };
}

function isDynamicEntry(entry) {
  return entry.kind !== "ml-real";
}

/**
 * Resolve o preço de um cartão de forma iterativa: quando taxa e/ou taxa
 * fixa não vêm prontas de uma consulta real da API (ver isDynamicEntry),
 * elas podem depender do preço final — e o preço final depende delas.
 * Recalcula em cima do próprio resultado até estabilizar (ou um limite de
 * tentativas), sem precisar de rede (a versão com taxa/frete real da API
 * já resolve isso no servidor antes de chegar aqui — ver o handler de
 * submit).
 *
 * Bem perto do limiar de R$12,50 da taxa fixa do ML, ela dá um salto
 * grande (de ~50% do preço pra R$0) — pra alguns valores de custo/markup
 * isso não tem um "preço de equilíbrio" matemático de verdade: nenhum dos
 * dois lados da regra se sustenta sozinho (assumir que a taxa se aplica
 * leva a um preço onde ela não se aplicaria mais, e vice-versa). Isso é
 * uma característica real da regra do ML pra itens muito baratos, não um
 * bug de cálculo. Quando isso acontece (detectado como oscilação entre
 * dois valores), a ferramenta fica com o MAIOR dos dois — mais
 * conservador, protege a margem do vendedor em vez de arriscar
 * subprecificar.
 */
function resolveEntryPricing(entry, values, shippingCost) {
  const MAX_ITERATIONS = 12;
  let { pct, fixedFee } = resolveFeesForEntry(entry, null);
  let r = calculatePricing({ ...values, marketplacePct: pct, fixedFee, shippingCost });

  if (!isDynamicEntry(entry)) return r; // taxa já é real e fixa, não itera

  let previousPrice = null;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = resolveFeesForEntry(entry, r.suggestedPrice);
    if (Math.abs(next.fixedFee - fixedFee) < 0.01 && Math.abs(next.pct - pct) < 0.01) break;

    const candidate = calculatePricing({ ...values, marketplacePct: next.pct, fixedFee: next.fixedFee, shippingCost });

    if (previousPrice !== null && Math.abs(candidate.suggestedPrice - previousPrice) < 0.5) {
      // Oscilando entre dois valores (ping-pong) — não vai convergir.
      // Fica com o maior preço dos dois candidatos.
      r = candidate.suggestedPrice >= r.suggestedPrice ? candidate : r;
      break;
    }

    previousPrice = r.suggestedPrice;
    pct = next.pct;
    fixedFee = next.fixedFee;
    r = candidate;
  }
  return r;
}

function renderAllMarketplaces(values, feesList, shippingCost = 0) {
  if (typeof MARKETPLACE_FEES === "undefined") return;
  const fees = feesList || MARKETPLACE_FEES;

  const computed = fees.map((entry) => ({
    entry,
    r: resolveEntryPricing(entry, values, shippingCost),
  })).sort((a, b) => a.r.suggestedPrice - b.r.suggestedPrice);

  const cheapestPrice = computed[0].r.suggestedPrice;

  const grid = document.getElementById("compareGrid");
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();

  computed.forEach(({ entry, r }, index) => {
    const rank = index + 1;
    const isBest = r.suggestedPrice === cheapestPrice;
    const stagger = index * 70;

    const card = document.createElement("article");
    card.className = `compare-card brand--${entry.theme}`;
    if (isBest) card.classList.add("compare-card--best");
    if (!prefersReducedMotion) {
      card.style.setProperty("--stagger", `${stagger}ms`);
    }

    const rankBadge = document.createElement("span");
    rankBadge.className = "compare-card__rank";
    rankBadge.textContent = String(rank);
    card.appendChild(rankBadge);

    if (isBest) {
      const badge = document.createElement("p");
      badge.className = "compare-card__badge";
      badge.textContent = "Menor preço ao cliente";
      card.appendChild(badge);
    }

    if (entry.isRealFee) {
      const realBadge = document.createElement("p");
      realBadge.className = "compare-card__real-badge";
      realBadge.textContent = "Taxa real consultada agora";
      card.appendChild(realBadge);
    }

    const name = document.createElement("p");
    name.className = "compare-card__name";
    name.textContent = entry.label;

    const price = document.createElement("p");
    price.className = "compare-card__price";
    animateCountUp(price, r.suggestedPrice, formatBRL, 700, stagger);

    const { bar, legend } = buildBreakdownBar(r);

    const details = document.createElement("dl");
    details.className = "compare-card__details";
    details.append(
      detailRow("Comissão", `${formatPercent(r.commissionPct)} · ${formatBRL(r.commissionValue)}`),
      detailRow("Taxa fixa", formatBRL(r.fixedFeeValue)),
      detailRow("Frete (vendedor)", formatBRL(r.shippingCostValue)),
      detailRow("Total de taxas", formatBRL(r.totalMlFees)),
      detailRow("Total de custos", formatBRL(r.totalCosts)),
      detailRow("Lucro líquido", formatBRL(r.netProfit), { highlight: true }),
      detailRow("Lucro sobre custo", formatPercent(r.profitOverCostPct)),
      detailRow("Margem líquida", formatPercent(r.netMarginPct))
    );

    card.append(name, price, bar, legend, details);

    if (entry.captionNote) {
      const caption = document.createElement("p");
      caption.className = "compare-card__caption";
      caption.textContent = entry.captionNote;
      card.appendChild(caption);
    }

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);

  resultsEmptyEl.hidden = true;
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  document.getElementById("compare-title").focus();
}

/* ---------------------------------------------------------
   Categoria do Mercado Livre (opcional) — busca por nome do
   produto (via /api/ml-category-search, endpoint público do ML) para
   trazer a taxa REAL da categoria (via /api/ml-fee, que usa a conexão
   OAuth da RS). Sem categoria selecionada, os cartões do ML continuam
   usando a tabela de referência estática de marketplace-fees.js.
   --------------------------------------------------------- */

const categoryInput = document.getElementById("categoryQuery");
const categorySuggestions = document.getElementById("categorySuggestions");
const categorySelectedEl = document.getElementById("categorySelected");

let selectedCategory = null; // { id, name }
let categorySearchTimer = null;

function clearCategorySuggestions() {
  categorySuggestions.replaceChildren();
  categorySuggestions.hidden = true;
  categoryInput.setAttribute("aria-expanded", "false");
}

function selectCategory(id, name) {
  selectedCategory = { id, name };
  categoryInput.value = name;
  categorySelectedEl.textContent = `Categoria selecionada: ${name}`;
  categorySelectedEl.hidden = false;
  clearCategorySuggestions();
}

function renderCategorySuggestions(results) {
  clearCategorySuggestions();
  if (!results.length) return;

  const fragment = document.createDocumentFragment();
  results.forEach((r) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-suggestions__item";
    btn.textContent = r.category_name;
    btn.addEventListener("click", () => selectCategory(r.category_id, r.category_name));
    li.appendChild(btn);
    fragment.appendChild(li);
  });
  categorySuggestions.appendChild(fragment);
  categorySuggestions.hidden = false;
  categoryInput.setAttribute("aria-expanded", "true");
}

categoryInput.addEventListener("input", () => {
  selectedCategory = null;
  categorySelectedEl.hidden = true;
  const query = categoryInput.value.trim();

  clearTimeout(categorySearchTimer);
  if (query.length < 3) {
    clearCategorySuggestions();
    return;
  }

  categorySearchTimer = setTimeout(async () => {
    try {
      const resp = await fetch(`/api/ml-category-search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) {
        clearCategorySuggestions();
        return;
      }
      const data = await resp.json();
      renderCategorySuggestions(data.results || []);
    } catch {
      clearCategorySuggestions();
    }
  }, 300);
});

document.addEventListener("click", (event) => {
  if (event.target !== categoryInput && !categorySuggestions.contains(event.target)) {
    clearCategorySuggestions();
  }
});

async function fetchRealMlFees(price) {
  if (!selectedCategory) return null;
  try {
    const url = `/api/ml-fee?price=${encodeURIComponent(price)}&category_id=${encodeURIComponent(selectedCategory.id)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data.result) ? data.result : null;
  } catch {
    return null;
  }
}

function buildFeesWithRealMlData(listingPrices) {
  if (!listingPrices || !selectedCategory) return MARKETPLACE_FEES;

  const byType = Object.fromEntries(listingPrices.map((entry) => [entry.listing_type_id, entry]));
  const overrides = { meli_classico: byType.gold_special, meli_premium: byType.gold_pro };

  return MARKETPLACE_FEES.map((entry) => {
    const real = overrides[entry.id];
    if (!real) return entry;
    return {
      ...entry,
      // sale_fee_amount é o valor em R$ da taxa NO PREÇO CONSULTADO (não a
      // porcentagem) — só coincide numericamente com a % quando o preço
      // consultado é R$100 (foi assim que esse bug passou despercebido no
      // teste inicial). A porcentagem real está em sale_fee_details.
      pct: real.sale_fee_details?.percentage_fee ?? real.sale_fee_amount,
      fixedFee: real.sale_fee_details?.fixed_fee ?? 0,
      note: `Taxa real consultada agora na categoria "${selectedCategory.name}".`,
      isRealFee: true,
      kind: "ml-real",
    };
  });
}

/* ---------------------------------------------------------
   Amazon (opcional) — sem API pública de taxa por venda (ver pesquisa no
   README), então a taxa é uma tabela de referência por categoria,
   cadastrada e editável pelo admin (ver /api/marketplace-rates,
   admin.html). O usuário escolhe a categoria num seletor simples (não
   busca — a lista vem de quem o admin cadastrou), diferente do campo de
   categoria do Mercado Livre acima, que busca a taxonomia real do ML.
   --------------------------------------------------------- */

const amazonCategorySelect = document.getElementById("amazonCategory");
let amazonRates = [];

async function loadAmazonRates() {
  if (!amazonCategorySelect) return;
  try {
    const resp = await fetch("/api/marketplace-rates?marketplace=amazon", { credentials: "same-origin" });
    if (!resp.ok) return;
    const data = await resp.json();
    amazonRates = Array.isArray(data.rates) ? data.rates : [];

    const fragment = document.createDocumentFragment();
    amazonRates.forEach((rate) => {
      const option = document.createElement("option");
      option.value = rate.id;
      option.textContent = rate.category_label;
      fragment.appendChild(option);
    });
    amazonCategorySelect.appendChild(fragment);
  } catch {
    // sem categorias cadastradas ainda, ou falha de rede — a Amazon
    // simplesmente não aparece na comparação, o resto funciona normal
  }
}

loadAmazonRates();

/** Constrói uma entrada de cartão compatível com resolveEntryPricing a
 * partir de uma linha de marketplace_rates (ver resolveFeesForEntry). */
function buildAmazonEntry(rate) {
  return {
    id: `amazon_${rate.id}`,
    label: "Amazon",
    theme: "amazon",
    kind: "amazon-tiered",
    pct: Number(rate.pct),
    tierThreshold: rate.tier_threshold != null ? Number(rate.tier_threshold) : null,
    pctAboveThreshold: rate.pct_above_threshold != null ? Number(rate.pct_above_threshold) : null,
    fixedFee: Number(rate.fixed_fee) || 0,
    minFee: Number(rate.min_fee) || 0,
    captionNote: `Categoria: ${rate.category_label} · taxa de referência, não é consulta em tempo real.`,
  };
}

/* ---------------------------------------------------------
   Frete pago pelo vendedor — campo manual tem prioridade sobre a
   consulta automática por peso/dimensões (ver mais abaixo). Importante:
   isto é o custo que sai do bolso do VENDEDOR quando ele oferece frete
   grátis ao comprador — não é o valor que o comprador vê/paga (esses são
   coisas diferentes; a API do ML também distingue os dois, ver
   /api/ml-shipping.js: "buyer_cost" vs "seller_cost").
   --------------------------------------------------------- */

function getManualShippingCost() {
  const raw = document.getElementById("sellerShippingCost").value.trim();
  if (raw === "") return null;
  const parsed = parseLocaleNumber(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/* ---------------------------------------------------------
   Frete real do Mercado Livre (opcional) — exige peso + dimensões da
   embalagem (a API de frete do ML não calcula sem isso) e conta com
   Mercado Envios aceito (sem isso, o ML devolve o valor cheio, sem
   nenhum subsídio de vendedor — ver /api/ml-shipping.js). Só é
   consultada quando o campo manual acima está vazio.
   --------------------------------------------------------- */

function getPackageDimensions() {
  const weightKg = parseLocaleNumber(document.getElementById("packageWeight").value);
  const length = parseLocaleNumber(document.getElementById("packageLength").value);
  const width = parseLocaleNumber(document.getElementById("packageWidth").value);
  const height = parseLocaleNumber(document.getElementById("packageHeight").value);

  const values = [weightKg, length, width, height];
  if (values.some((n) => Number.isNaN(n) || n <= 0)) return null;
  return { weightKg, length, width, height };
}

async function fetchRealMlShipping({ price, weightG, length, width, height }) {
  try {
    const params = new URLSearchParams({
      price: String(price),
      weight_g: String(weightG),
      length: String(length),
      width: String(width),
      height: String(height),
    });
    const resp = await fetch(`/api/ml-shipping?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.available ? data : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------
   Conexão do usuário com o Mercado Livre (opcional) — cada
   cliente conecta a própria conta pra ter taxa/frete reais da conta
   dele, em vez da taxa de referência. Ver /api/auth/start,
   /api/ml-connection (GET = status, POST = desconectar).
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

const submitBtn = form.querySelector('button[type="submit"]');
const submitBtnDefaultText = submitBtn.textContent;

/**
 * Estimativa local (sem rede) do preço, usada só como ponto de partida
 * pra primeira consulta às APIs reais — usa a taxa fixa de referência por
 * faixa de preço (estimateReferenceFixedFee), não um valor fixo.
 *
 * Usa média amortecida (em vez de pular direto pro novo valor) porque,
 * bem perto do limiar de R$12,50, a taxa fixa muda bruscamente (de ~50%
 * do preço pra R$0) — sem amortecimento, o preço "oscila" pra sempre
 * entre um lado e outro do limiar em vez de estabilizar. É uma
 * característica real da regra de taxas do ML pra itens muito baratos
 * (ver nota em estimateReferenceFixedFee), não um bug: perto do limiar,
 * o preço de equilíbrio é genuinamente sensível a esse degrau.
 */
function roughPriceEstimate(values, shippingCost) {
  const entry = { pct: MARKETPLACE_FEES[0].pct };
  return resolveEntryPricing(entry, values, shippingCost).suggestedPrice;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = validateAndCollect();
  if (!values) {
    const firstInvalid = form.querySelector('[aria-invalid="true"]');
    firstInvalid?.focus();
    return;
  }

  let feesToUse = MARKETPLACE_FEES;

  const manualShipping = getManualShippingCost();
  const pkg = manualShipping === null ? getPackageDimensions() : null; // manual tem prioridade
  let shippingCost = manualShipping ?? 0;

  const needsCategory = !!selectedCategory;
  const needsShipping = manualShipping === null && !!pkg;

  if (needsCategory || needsShipping) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Consultando dados reais do ML...";

    // Cálculo iterativo: taxa fixa e frete reais podem depender do preço
    // final, que depende deles — repete a consulta em cima do próprio
    // resultado até estabilizar (ou um limite de tentativas), em vez de
    // uma única aproximação.
    //
    // Bem perto do limiar de R$12,50 (ver estimateReferenceFixedFee), a
    // taxa fixa dá um salto grande e pode não existir um preço de
    // equilíbrio matemático — a consulta fica "pingue-pongue" entre dois
    // valores. Quando isso é detectado, fica com o candidato de MAIOR
    // preço: ele corresponde a assumir que a taxa fixa se aplica, o que é
    // mais seguro pro vendedor (se o preço real acabar sem taxa fixa, o
    // vendedor ganha uma margem melhor que a mostrada — nunca pior).
    const MAX_ITERATIONS = 5;
    let priceEstimate = roughPriceEstimate(values, shippingCost);
    let realListingPrices = null;
    let shippingResult = null;
    let previousCandidate = null; // { price, fees, shipping }

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const roundedPrice = Math.max(1, Math.round(priceEstimate));

      const [feeData, shipData] = await Promise.all([
        needsCategory ? fetchRealMlFees(roundedPrice) : Promise.resolve(null),
        needsShipping
          ? fetchRealMlShipping({ price: roundedPrice, weightG: Math.round(pkg.weightKg * 1000), length: pkg.length, width: pkg.width, height: pkg.height })
          : Promise.resolve(null),
      ]);
      realListingPrices = feeData || realListingPrices;
      shippingResult = shipData || shippingResult;

      const trialFees = needsCategory ? buildFeesWithRealMlData(realListingPrices) : MARKETPLACE_FEES;
      const trialShipping = shippingResult ? shippingResult.seller_cost || 0 : shippingCost;
      const trialPrice = resolveEntryPricing(trialFees[0], values, trialShipping).suggestedPrice;
      shippingCost = trialShipping;

      const stabilized = Math.abs(trialPrice - priceEstimate) < 0.5;
      if (stabilized) {
        priceEstimate = trialPrice;
        break;
      }

      if (previousCandidate && Math.abs(trialPrice - previousCandidate.price) < 0.5) {
        // Oscilando entre dois valores — não vai convergir. Fica com o
        // candidato de maior preço (mais seguro, ver comentário acima) e
        // NÃO consulta de novo (isso só voltaria a oscilar).
        const currentCandidate = { price: trialPrice, fees: realListingPrices, shipping: shippingResult };
        const safer = currentCandidate.price >= previousCandidate.price ? currentCandidate : previousCandidate;
        priceEstimate = safer.price;
        realListingPrices = safer.fees;
        shippingResult = safer.shipping;
        shippingCost = safer.shipping ? safer.shipping.seller_cost || 0 : shippingCost;
        break;
      }

      previousCandidate = { price: priceEstimate, fees: realListingPrices, shipping: shippingResult };
      priceEstimate = trialPrice;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultText;

    if (needsCategory) feesToUse = buildFeesWithRealMlData(realListingPrices);
  }

  const selectedAmazonRateId = amazonCategorySelect?.value;
  if (selectedAmazonRateId) {
    const rate = amazonRates.find((r) => r.id === selectedAmazonRateId);
    if (rate) feesToUse = [...feesToUse, buildAmazonEntry(rate)];
  }

  renderAllMarketplaces(values, feesToUse, shippingCost);
});

fieldConfig.forEach((cfg) => {
  const { input } = getFieldEls(cfg.id);
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") {
      clearFieldError(cfg.id);
    }
  });
});

clearBtn.addEventListener("click", () => {
  form.reset();
  clearAllErrors();
  selectedCategory = null;
  categorySelectedEl.hidden = true;
  clearCategorySuggestions();
  resultsSection.hidden = true;
  resultsEmptyEl.hidden = false;
  document.getElementById("productCost").focus();
  window.scrollTo({ top: 0, behavior: "auto" });
});

// Decoração de fundo (estrelas, cometas) e revelação ao rolar agora
// moram em background-fx.js, compartilhado com login.html/admin.html.
