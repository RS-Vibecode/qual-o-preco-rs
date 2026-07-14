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
 * - "price-banded": % e tarifa fixa vêm de uma tabela de faixas de preço
 *   (entry.bands, ordenada por threshold crescente — ex. Shopee: até
 *   R$79,99: 20%+R$4; de R$80 a R$99,99: 14%+R$16; ...; TikTok Shop: até
 *   R$49,99: 10%+R$4; a partir de R$50: 6%+R$6) — diferente da Amazon,
 *   aqui a FAIXA INTEIRA muda (não é um blend acima de um único limiar).
 *   Usado por qualquer marketplace com esse formato (Shopee, TikTok Shop,
 *   e o que mais vier depois com a mesma estrutura — ver buildShopeeEntry
 *   e buildTikTokEntry). Regra adicional específica da Shopee, marcada em
 *   entry.halveFeeBelow: abaixo de R$8, a tarifa fixa da faixa inicial
 *   vira metade do preço do produto (não o valor fixo da tabela) — outros
 *   marketplaces que usem este kind simplesmente não setam essa opção.
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

  if (entry.kind === "price-banded") {
    const p = Number.isFinite(price) && price > 0 ? price : 0;
    let band = entry.bands[0];
    for (const b of entry.bands) {
      if (p >= b.threshold) band = b;
      else break;
    }
    let fixedFee = band.fixedFee;
    if (band.threshold === 0 && entry.halveFeeBelow && p > 0 && p < entry.halveFeeBelow) {
      fixedFee = Math.round((p / 2) * 100) / 100;
    }
    return { pct: band.pct, fixedFee };
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
 * bug de cálculo. Quando isso acontece, a sequência de preços fica
 * alternando de direção a cada passo (sobe, desce, sobe...) — é isso que é
 * detectado como oscilação de verdade (não apenas "o passo ficou
 * pequeno", que também acontece em convergência normal só que mais lenta —
 * ver nota na regra da Shopee abaixo de R$8, que converge suavemente e não
 * pode disparar esse alarme por engano). Quando a oscilação de verdade é
 * detectada, a ferramenta fica com o MAIOR preço dos dois — mais
 * conservador, protege a margem do vendedor em vez de arriscar
 * subprecificar.
 */
function resolveEntryPricing(entry, values, shippingCost) {
  const MAX_ITERATIONS = 25;
  let { pct, fixedFee } = resolveFeesForEntry(entry, null);
  let r = calculatePricing({ ...values, marketplacePct: pct, fixedFee, shippingCost });

  if (!isDynamicEntry(entry)) return r; // taxa já é real e fixa, não itera

  let previousDelta = null; // sinal do passo anterior (subiu ou desceu)
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = resolveFeesForEntry(entry, r.suggestedPrice);
    if (Math.abs(next.fixedFee - fixedFee) < 0.01 && Math.abs(next.pct - pct) < 0.01) break;

    const candidate = calculatePricing({ ...values, marketplacePct: next.pct, fixedFee: next.fixedFee, shippingCost });
    const delta = candidate.suggestedPrice - r.suggestedPrice;

    if (previousDelta !== null && Math.sign(delta) !== Math.sign(previousDelta) && Math.abs(delta) > 0.01) {
      // O preço mudou de direção em relação ao passo anterior — ping-pong
      // de verdade entre dois valores, não vai convergir. Fica com o
      // maior preço dos dois candidatos.
      r = candidate.suggestedPrice >= r.suggestedPrice ? candidate : r;
      break;
    }

    previousDelta = delta;
    pct = next.pct;
    fixedFee = next.fixedFee;
    r = candidate;
  }
  return r;
}

/**
 * Topo do cartão (selo de posição, selo de "menor preço", nome e preço) —
 * compartilhado entre o cartão compacto (grade) e o cartão completo
 * (popup), pra não duplicar essa parte em dois lugares.
 * `animateDelay` null = mostra o preço já pronto, sem a animação de
 * contagem (usado no popup, aberto sob demanda); um número = anima com
 * esse atraso em ms (usado na grade, no primeiro carregamento).
 * `includeRealBadge` true só no cartão completo — o texto "Taxa real
 * consultada agora" não cabe no cartão compacto (ficava cortado no meio
 * da palavra); no compacto, o essencial já é nome + preço + selo de
 * menor preço, o resto (inclusive esse selo) fica só no popup.
 * `compact` true no cartão da grade: o círculo de posição e o selo de
 * "menor preço" competiam pelo mesmo canto num cartão estreito e ficavam
 * um em cima do outro — no compacto, quando o cartão é o mais barato, o
 * selo substitui o número (ele já deixa claro que é o primeiro colocado)
 * em vez de competir com ele; nos outros cartões, só o número aparece,
 * sem selo. O texto do selo também fica mais curto no compacto.
 */
function buildCardTop({ entry, r, rank, isBest, tiedCount, animateDelay, includeRealBadge, compact }) {
  const frag = document.createDocumentFragment();

  if (!(compact && isBest)) {
    const rankBadge = document.createElement("span");
    rankBadge.className = "compare-card__rank";
    rankBadge.textContent = String(rank);
    frag.appendChild(rankBadge);
  }

  if (isBest) {
    const tied = tiedCount > 1;
    const badge = document.createElement("p");
    badge.className = "compare-card__badge";
    badge.textContent = compact
      ? (tied ? "Empate" : "Menor preço")
      : (tied ? "Valores empatados" : "Menor preço ao cliente");
    frag.appendChild(badge);
  }

  if (includeRealBadge && entry.isRealFee) {
    const realBadge = document.createElement("p");
    realBadge.className = "compare-card__real-badge";
    realBadge.textContent = "Taxa real consultada agora";
    frag.appendChild(realBadge);
  }

  const name = document.createElement("p");
  name.className = "compare-card__name";
  name.textContent = entry.label;
  frag.appendChild(name);

  const price = document.createElement("p");
  price.className = "compare-card__price";
  if (animateDelay != null) {
    animateCountUp(price, r.suggestedPrice, formatBRL, 700, animateDelay);
  } else {
    price.textContent = formatBRL(r.suggestedPrice);
  }
  frag.appendChild(price);

  return frag;
}

/** Cartão completo (barra proporcional, legenda, grade de detalhes e
 * observação) — usado dentro do popup, construído sob demanda no clique
 * (ver openCardModal) em vez de ficar sempre no DOM da grade. */
function buildFullCard(entry, r, meta) {
  const card = document.createElement("div");
  card.className = `compare-card brand--${entry.theme}`;
  if (meta.isBest) card.classList.add("compare-card--best");
  card.appendChild(buildCardTop({ entry, r, ...meta, animateDelay: null, includeRealBadge: true, compact: false }));

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
  card.append(bar, legend, details);

  if (entry.captionNote) {
    const caption = document.createElement("p");
    caption.className = "compare-card__caption";
    caption.textContent = entry.captionNote;
    card.appendChild(caption);
  }

  return card;
}

const cardModal = document.getElementById("cardModal");
const cardModalContent = document.getElementById("cardModalContent");

function openCardModal(entry, r, meta) {
  if (!cardModal) return;
  cardModalContent.replaceChildren(buildFullCard(entry, r, meta));
  cardModal.setAttribute("aria-label", `${entry.label}: ${formatBRL(r.suggestedPrice)}, detalhes`);
  cardModal.showModal();
}

document.getElementById("cardModalClose")?.addEventListener("click", () => cardModal.close());
cardModal?.addEventListener("click", (event) => {
  // Clicou fora do cartão (na área vazia do próprio <dialog>, que cobre a
  // tela toda) — fecha, igual clicar no fundo escurecido.
  if (event.target === cardModal) cardModal.close();
});

function renderAllMarketplaces(values, feesList, shippingCost = 0) {
  if (typeof MARKETPLACE_FEES === "undefined") return;
  const fees = feesList || MARKETPLACE_FEES;

  const computed = fees.map((entry) => ({
    entry,
    r: resolveEntryPricing(entry, values, shippingCost),
  })).sort((a, b) => a.r.suggestedPrice - b.r.suggestedPrice);

  // Compara pelo valor arredondado em centavos (o que o usuário efetivamente
  // vê na tela) — dois marketplaces com a mesma taxa percentual costumam
  // convergir pro mesmíssimo preço, mas ruído de ponto flutuante entre
  // caminhos de cálculo diferentes (ex.: iteração da Amazon vs. do ML)
  // podia deixar de detectar isso por centésimos de centavo.
  const toCents = (value) => Math.round(value * 100);
  const cheapestCents = toCents(computed[0].r.suggestedPrice);
  const tiedCount = computed.filter(({ r }) => toCents(r.suggestedPrice) === cheapestCents).length;

  const grid = document.getElementById("compareGrid");
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();

  computed.forEach(({ entry, r }, index) => {
    const rank = index + 1;
    const isBest = toCents(r.suggestedPrice) === cheapestCents;
    const stagger = index * 70;
    const meta = { rank, isBest, tiedCount };

    // Cartão compacto: só o essencial (posição, selo, nome, preço) — o
    // resto (comissão, taxa fixa, lucro, barra proporcional) fica no
    // popup, aberto no clique (ver openCardModal/buildFullCard acima).
    const card = document.createElement("button");
    card.type = "button";
    card.className = `compare-card compare-card--compact brand--${entry.theme}`;
    if (isBest) card.classList.add("compare-card--best");
    card.setAttribute("aria-label", `${entry.label}: ${formatBRL(r.suggestedPrice)}. Ver detalhes.`);
    if (!prefersReducedMotion) {
      card.style.setProperty("--stagger", `${stagger}ms`);
    }

    card.appendChild(buildCardTop({ entry, r, ...meta, animateDelay: prefersReducedMotion ? null : stagger, compact: true }));

    const hint = document.createElement("span");
    hint.className = "compare-card__hint";
    hint.textContent = "Ver detalhes";
    card.appendChild(hint);

    card.addEventListener("click", () => openCardModal(entry, r, meta));

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

/* ---------------------------------------------------------
   Produto já cadastrado no Mercado Livre (opcional, só aparece com a
   conta conectada — ver initMlAwareFeatures) — busca nos ANÚNCIOS REAIS
   do próprio usuário em vez da taxonomia pública do ML (ver busca de
   categoria acima). Reaproveita a categoria real do anúncio (mais
   precisa que adivinhar pelo nome) e, quando o vendedor já declarou peso
   e dimensões da embalagem lá no anúncio, preenche o frete sozinho.
   --------------------------------------------------------- */

const productInput = document.getElementById("productQuery");
const productSuggestions = document.getElementById("productSuggestions");
const productSelectedEl = document.getElementById("productSelected");

let selectedProduct = null; // { id, title, package }
let productSearchTimer = null;

function clearProductSuggestions() {
  productSuggestions.replaceChildren();
  productSuggestions.hidden = true;
  productInput.setAttribute("aria-expanded", "false");
}

function selectProduct(product) {
  selectedProduct = product;
  productInput.value = product.title;
  clearProductSuggestions();

  // Mesma variável que a busca de categoria usa — o resto do cálculo
  // (fetchRealMlFees) não precisa saber se a categoria veio de uma busca
  // livre ou de um produto já cadastrado.
  selectedCategory = { id: product.category_id, name: product.title };
  categoryInput.value = "";
  categorySelectedEl.hidden = true;

  if (product.package) {
    const { weightG, length, width, height } = product.package;
    document.getElementById("packageWeight").value = String(weightG / 1000).replace(".", ",");
    document.getElementById("packageLength").value = String(length).replace(".", ",");
    document.getElementById("packageWidth").value = String(width).replace(".", ",");
    document.getElementById("packageHeight").value = String(height).replace(".", ",");
    productSelectedEl.textContent = `Produto selecionado: ${product.title} — categoria e frete (peso/dimensões) preenchidos automaticamente.`;
  } else {
    productSelectedEl.textContent = `Produto selecionado: ${product.title} — categoria preenchida automaticamente. Este anúncio não tem peso/dimensões de embalagem cadastrados no Mercado Livre; preencha o frete manualmente abaixo, se quiser.`;
  }
  productSelectedEl.hidden = false;
}

function renderProductSuggestions(results) {
  clearProductSuggestions();
  if (!results.length) return;

  const fragment = document.createDocumentFragment();
  results.forEach((p) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-suggestions__item";
    const priceText = Number.isFinite(p.price) ? ` · ${formatBRL(p.price)}` : "";
    const skuText = p.sku ? ` · SKU ${p.sku}` : "";
    btn.textContent = `${p.title}${priceText}${skuText}`;
    btn.addEventListener("click", () => selectProduct(p));
    li.appendChild(btn);
    fragment.appendChild(li);
  });
  productSuggestions.appendChild(fragment);
  productSuggestions.hidden = false;
  productInput.setAttribute("aria-expanded", "true");
}

productInput?.addEventListener("input", () => {
  selectedProduct = null;
  productSelectedEl.hidden = true;
  const query = productInput.value.trim();

  clearTimeout(productSearchTimer);
  if (query.length < 3) {
    clearProductSuggestions();
    return;
  }

  productSearchTimer = setTimeout(async () => {
    try {
      const resp = await fetch(`/api/ml-category-search?mode=product&q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      if (!resp.ok) {
        clearProductSuggestions();
        return;
      }
      const data = await resp.json();
      renderProductSuggestions(data.results || []);
    } catch {
      clearProductSuggestions();
    }
  }, 300);
});

document.addEventListener("click", (event) => {
  if (event.target !== productInput && !productSuggestions.contains(event.target)) {
    clearProductSuggestions();
  }
});

// Escolher um produto cadastrado e digitar na busca de categoria livre
// são jeitos alternativos de chegar na mesma coisa (qual categoria usar)
// — escolher um invalida o outro, pra não ficar ambíguo qual valeu.
categoryInput.addEventListener("input", () => {
  if (!selectedProduct) return;
  selectedProduct = null;
  productInput.value = "";
  productSelectedEl.hidden = true;
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
   Shopee (opcional) — sem categoria por produto (a comissão da Shopee não
   varia por categoria, só por faixa de preço do item), então não é um
   seletor de categoria como o da Amazon, é um checkbox simples. As faixas
   também são cadastradas e editáveis pelo admin (mesma tabela
   marketplace_rates, marketplace="shopee"), uma linha por faixa de preço.
   --------------------------------------------------------- */

const shopeeIncludeCheckbox = document.getElementById("shopeeInclude");
let shopeeRates = [];

async function loadShopeeRates() {
  if (!shopeeIncludeCheckbox) return;
  try {
    const resp = await fetch("/api/marketplace-rates?marketplace=shopee", { credentials: "same-origin" });
    if (!resp.ok) return;
    const data = await resp.json();
    shopeeRates = Array.isArray(data.rates) ? data.rates : [];
  } catch {
    // sem faixas cadastradas ainda, ou falha de rede — a Shopee
    // simplesmente não aparece na comparação, o resto funciona normal
  }
}

loadShopeeRates();

/** Constrói UMA entrada de cartão a partir de TODAS as linhas de
 * marketplace_rates da Shopee (cada linha é uma faixa de preço, não uma
 * categoria escolhida pelo usuário — ver resolveFeesForEntry, kind
 * "price-banded"). */
function buildShopeeEntry(rates) {
  const bands = rates
    .map((r) => ({
      threshold: r.tier_threshold != null ? Number(r.tier_threshold) : 0,
      pct: Number(r.pct),
      fixedFee: Number(r.fixed_fee) || 0,
    }))
    .sort((a, b) => a.threshold - b.threshold);
  if (!bands.length) return null;

  return {
    id: "shopee",
    label: "Shopee",
    theme: "shopee",
    kind: "price-banded",
    bands,
    halveFeeBelow: 8,
    captionNote: "Tabela padrão (CNPJ, ou CPF com até 450 pedidos/90 dias) · taxa de referência, não é consulta em tempo real.",
  };
}

/* ---------------------------------------------------------
   TikTok Shop (opcional) — mesmo formato da Shopee (faixa de preço, sem
   categoria), mas sem a regra do <R$8 (entry.halveFeeBelow fica de fora).
   Tarifa vigente a partir de 15/07/2026 (ver nota cadastrada em cada
   linha) — a anterior a essa data era fixa (6% + R$4) para qualquer
   preço, sem faixas.
   --------------------------------------------------------- */

const tiktokIncludeCheckbox = document.getElementById("tiktokInclude");
let tiktokRates = [];

async function loadTikTokRates() {
  if (!tiktokIncludeCheckbox) return;
  try {
    const resp = await fetch("/api/marketplace-rates?marketplace=tiktok", { credentials: "same-origin" });
    if (!resp.ok) return;
    const data = await resp.json();
    tiktokRates = Array.isArray(data.rates) ? data.rates : [];
  } catch {
    // sem faixas cadastradas ainda, ou falha de rede — o TikTok Shop
    // simplesmente não aparece na comparação, o resto funciona normal
  }
}

loadTikTokRates();

function buildTikTokEntry(rates) {
  const bands = rates
    .map((r) => ({
      threshold: r.tier_threshold != null ? Number(r.tier_threshold) : 0,
      pct: Number(r.pct),
      fixedFee: Number(r.fixed_fee) || 0,
    }))
    .sort((a, b) => a.threshold - b.threshold);
  if (!bands.length) return null;

  return {
    id: "tiktok",
    label: "TikTok Shop",
    theme: "tiktok",
    kind: "price-banded",
    bands,
    captionNote: "Tarifa vigente a partir de 15/07/2026 · taxa de referência, não é consulta em tempo real.",
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
   Estado da conexão com o Mercado Livre, checado uma vez ao carregar a
   página — alimenta duas coisas:
   1. O popup avisando pra conectar (conectar/desconectar de verdade mora
      em settings.html/settings.js agora, pra liberar espaço aqui na
      calculadora). Um "Agora não"/Esc/clique fora não incomoda de novo
      na mesma aba (sessionStorage) — só um lembrete pontual, não um
      bloqueio.
   2. A busca de "produto cadastrado" (ver mais abaixo) só faz sentido
      com a conta conectada — o campo fica escondido até confirmarmos
      que a busca de verdade vai funcionar, em vez de aparecer e falhar.
   --------------------------------------------------------- */

const mlPromptModal = document.getElementById("mlPromptModal");
let mlConnectedState = false;

async function initMlAwareFeatures() {
  const productField = document.getElementById("productQueryField");
  try {
    const resp = await fetch("/api/ml-connection", { credentials: "same-origin" });
    if (resp.ok) {
      ({ connected: mlConnectedState } = await resp.json());
    }
  } catch {
    // falha na checagem — trata como desconectado, sem travar a página
  }

  if (productField) productField.hidden = !mlConnectedState;

  if (!mlConnectedState && mlPromptModal && sessionStorage.getItem("mlPromptDismissed") !== "1") {
    mlPromptModal.showModal();
  }
}

mlPromptModal?.addEventListener("click", (event) => {
  if (event.target === mlPromptModal) mlPromptModal.close();
});
mlPromptModal?.addEventListener("close", () => {
  sessionStorage.setItem("mlPromptDismissed", "1");
});
document.getElementById("mlPromptCloseBtn")?.addEventListener("click", () => mlPromptModal.close());
document.getElementById("mlPromptDismissBtn")?.addEventListener("click", () => mlPromptModal.close());

initMlAwareFeatures();

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

  if (shopeeIncludeCheckbox?.checked) {
    const shopeeEntry = buildShopeeEntry(shopeeRates);
    if (shopeeEntry) feesToUse = [...feesToUse, shopeeEntry];
  }

  if (tiktokIncludeCheckbox?.checked) {
    const tiktokEntry = buildTikTokEntry(tiktokRates);
    if (tiktokEntry) feesToUse = [...feesToUse, tiktokEntry];
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
  selectedProduct = null;
  productSelectedEl.hidden = true;
  clearProductSuggestions();
  resultsSection.hidden = true;
  resultsEmptyEl.hidden = false;
  document.getElementById("productCost").focus();
  window.scrollTo({ top: 0, behavior: "auto" });
});

// Decoração de fundo (estrelas, cometas) e revelação ao rolar agora
// moram em background-fx.js, compartilhado com login.html/admin.html.
