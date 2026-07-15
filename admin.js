"use strict";

/* Ícones dos botões de ação compactos da tabela de taxas (ver loadRates)
   — construídos via DOM (createElementNS), não innerHTML, mesmo padrão
   de segurança já usado no resto do arquivo (nada de HTML vindo de
   string interpolada). */
const ICON_PATH_EDIT = "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Zm11.5-13.5 3 3";
const ICON_PATH_DELETE = "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

function createIcon(pathD) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

const createForm = document.getElementById("create-user-form");
const createSubmitBtn = document.getElementById("create-user-submit");
const createSubmitDefaultText = createSubmitBtn.textContent;
const createdResult = document.getElementById("createdResult");
const createdEmailEl = document.getElementById("createdEmail");
const createdPasswordEl = document.getElementById("createdPassword");
const copyPasswordBtn = document.getElementById("copyPasswordBtn");
const newUserPasswordInput = document.getElementById("newUserPassword");
const toggleNewUserPasswordBtn = document.getElementById("toggleNewUserPasswordBtn");
const newUserPasswordSlash = document.getElementById("newUserPasswordSlash");
const generatePasswordBtn = document.getElementById("generatePasswordBtn");
const usersTable = document.getElementById("usersTable");
const usersTableBody = document.getElementById("usersTableBody");
const usersEmpty = document.getElementById("usersEmpty");
const resetResult = document.getElementById("resetResult");
const resetEmailEl = document.getElementById("resetEmail");
const resetPasswordEl = document.getElementById("resetPassword");
const copyResetPasswordBtn = document.getElementById("copyResetPasswordBtn");
const usersActionError = document.getElementById("usersActionError");

// /api/auth/me não devolve o id (só dados de perfil) — usamos o e-mail
// pra reconhecer "esta é a minha própria linha" e esconder o botão de
// remover (a proteção de verdade é no servidor, isso é só UX). loadUsers()
// só roda depois dessa promise resolver (ver final do arquivo) — sem
// esperar, a primeira renderização da tabela sempre achava
// currentUserEmail === null e mostrava "Remover" na própria linha do admin.
let currentUserEmail = null;
const currentUserReady = fetch("/api/auth/me", { credentials: "same-origin" })
  .then((r) => (r.ok ? r.json() : null))
  .then((session) => {
    if (session) currentUserEmail = session.email || null;
  })
  .catch(() => {});

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.closest(".field").classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(id) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.closest(".field").classList.remove("has-error");
  input.removeAttribute("aria-invalid");
  error.textContent = "";
  error.hidden = true;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function clearActionMessages() {
  usersActionError.hidden = true;
  usersActionError.textContent = "";
  resetResult.hidden = true;
}

let allUsers = [];
const usersSearchInput = document.getElementById("usersSearch");
const statsClientCount = document.getElementById("statsClientCount");
const statsAdminCount = document.getElementById("statsAdminCount");

function updateUserStats() {
  if (!statsClientCount || !statsAdminCount) return;
  statsClientCount.textContent = String(allUsers.filter((u) => u.role !== "admin").length);
  statsAdminCount.textContent = String(allUsers.filter((u) => u.role === "admin").length);
}

function filterUsers(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allUsers;
  return allUsers.filter(
    (u) => (u.fullName || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
}

function renderUsersTable(users) {
  usersTableBody.replaceChildren();

  if (!users.length) {
    usersTable.hidden = true;
    usersEmpty.hidden = false;
    usersEmpty.textContent = allUsers.length
      ? "Nenhum usuário encontrado pra essa busca."
      : "Nenhum usuário cadastrado ainda.";
    return;
  }

  usersTable.hidden = false;
  usersEmpty.hidden = true;

  const fragment = document.createDocumentFragment();
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.dataset.userId = u.id;
    tr.dataset.userEmail = u.email;
    tr.dataset.userName = u.fullName || u.email;

    const nameTd = document.createElement("td");
    nameTd.textContent = u.fullName || "—";

    const emailTd = document.createElement("td");
    emailTd.textContent = u.email;

    const roleTd = document.createElement("td");
    roleTd.textContent = u.role === "admin" ? "Administrador" : "Cliente";

    const dateTd = document.createElement("td");
    dateTd.textContent = formatDate(u.createdAt);

    // O flex fica num <div> dentro do <td>, não no <td> em si — um <td>
    // com display:flex direto confunde o algoritmo de largura de colunas
    // da tabela em alguns navegadores (a coluna fica mais estreita do
    // que o conteúdo dos botões precisa, cortando o texto no meio).
    const actionsTd = document.createElement("td");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "admin-table__actions";
    actionsTd.appendChild(actionsWrap);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn--secondary btn--sm";
    resetBtn.dataset.action = "reset-password";
    resetBtn.textContent = "Redefinir senha";
    actionsWrap.appendChild(resetBtn);

    if (u.email !== currentUserEmail) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn--secondary btn--sm btn--danger";
      deleteBtn.dataset.action = "delete";
      deleteBtn.textContent = "Remover";
      actionsWrap.appendChild(deleteBtn);
    }

    tr.append(nameTd, emailTd, roleTd, dateTd, actionsTd);
    fragment.appendChild(tr);
  });
  usersTableBody.appendChild(fragment);
}

async function loadUsers() {
  const resp = await fetch("/api/admin/users", { credentials: "same-origin" });
  if (!resp.ok) return;
  const { users } = await resp.json();
  allUsers = users;
  updateUserStats();
  renderUsersTable(filterUsers(usersSearchInput ? usersSearchInput.value : ""));
}

usersSearchInput?.addEventListener("input", () => {
  renderUsersTable(filterUsers(usersSearchInput.value));
});

usersTableBody.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const tr = btn.closest("tr");
  const id = tr.dataset.userId;
  const email = tr.dataset.userEmail;
  const name = tr.dataset.userName;
  clearActionMessages();

  if (btn.dataset.action === "delete") {
    if (!window.confirm(`Remover ${name} (${email})? Essa ação não pode ser desfeita — a pessoa perde o acesso imediatamente.`)) {
      return;
    }
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Removendo...";
    try {
      const resp = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        usersActionError.textContent = data.error || "Não foi possível remover o usuário.";
        usersActionError.hidden = false;
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      loadUsers();
    } catch {
      usersActionError.textContent = "Erro de conexão. Tente novamente.";
      usersActionError.hidden = false;
      btn.disabled = false;
      btn.textContent = originalText;
    }
    return;
  }

  if (btn.dataset.action === "reset-password") {
    if (!window.confirm(`Gerar uma nova senha para ${name} (${email})? A senha atual deixa de funcionar.`)) {
      return;
    }
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Redefinindo...";
    try {
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        usersActionError.textContent = data.error || "Não foi possível redefinir a senha.";
        usersActionError.hidden = false;
        return;
      }
      resetEmailEl.textContent = email;
      resetPasswordEl.textContent = data.password;
      resetResult.hidden = false;
      resetResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      usersActionError.textContent = "Erro de conexão. Tente novamente.";
      usersActionError.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
});

copyResetPasswordBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resetPasswordEl.textContent);
    const original = copyResetPasswordBtn.textContent;
    copyResetPasswordBtn.textContent = "Copiado!";
    setTimeout(() => {
      copyResetPasswordBtn.textContent = original;
    }, 1500);
  } catch {
    // clipboard indisponível — sem quebrar o fluxo
  }
});

toggleNewUserPasswordBtn.addEventListener("click", () => {
  const isHidden = newUserPasswordInput.type === "password";
  newUserPasswordInput.type = isHidden ? "text" : "password";
  newUserPasswordSlash.hidden = isHidden;
  toggleNewUserPasswordBtn.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
});

/** Mesmo alfabeto/tamanho do gerador do servidor (lib/auth.js,
 * generateStrongPassword) — sem 0/O/1/l pra evitar confusão ao digitar,
 * com rejection sampling pra não enviesar os primeiros caracteres do
 * alfabeto (256 não é múltiplo do tamanho do alfabeto). Só usado como
 * ponto de partida opcional: o admin pode editar o resultado à vontade
 * antes de criar o usuário. */
function generateStrongPasswordClientSide() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  const maxUnbiased = 256 - (256 % chars.length);
  const result = [];
  while (result.length < 16) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= maxUnbiased) continue;
      result.push(chars[b % chars.length]);
      if (result.length === 16) break;
    }
  }
  return result.join("");
}

generatePasswordBtn.addEventListener("click", () => {
  newUserPasswordInput.value = generateStrongPasswordClientSide();
  newUserPasswordInput.type = "text";
  newUserPasswordSlash.hidden = true;
  toggleNewUserPasswordBtn.setAttribute("aria-label", "Ocultar senha");
  clearFieldError("newUserPassword");
  newUserPasswordInput.focus();
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldError("fullName");
  clearFieldError("newUserEmail");
  clearFieldError("newUserPassword");
  createdResult.hidden = true;

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("newUserEmail").value.trim();
  const role = document.getElementById("newUserRole").value;
  const password = newUserPasswordInput.value;

  let hasError = false;
  if (!fullName) {
    setFieldError("fullName", "Informe o nome completo.");
    hasError = true;
  }
  if (!email) {
    setFieldError("newUserEmail", "Informe o e-mail.");
    hasError = true;
  }
  if (!password) {
    setFieldError("newUserPassword", 'Informe uma senha, ou clique em "Gerar senha forte".');
    hasError = true;
  } else if (password.length < 8) {
    setFieldError("newUserPassword", "A senha precisa ter pelo menos 8 caracteres.");
    hasError = true;
  }
  if (hasError) return;

  createSubmitBtn.disabled = true;
  createSubmitBtn.textContent = "Criando...";

  try {
    const resp = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, fullName, role, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      setFieldError("newUserEmail", data.error || "Não foi possível criar o cliente.");
      return;
    }

    createdEmailEl.textContent = data.email;
    createdPasswordEl.textContent = data.password;
    createdResult.hidden = false;
    createForm.reset();
    newUserPasswordInput.type = "password";
    newUserPasswordSlash.hidden = false;
    loadUsers();
  } catch {
    setFieldError("newUserEmail", "Erro de conexão. Tente novamente.");
  } finally {
    createSubmitBtn.disabled = false;
    createSubmitBtn.textContent = createSubmitDefaultText;
  }
});

copyPasswordBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(createdPasswordEl.textContent);
    const original = copyPasswordBtn.textContent;
    copyPasswordBtn.textContent = "Copiado!";
    setTimeout(() => {
      copyPasswordBtn.textContent = original;
    }, 1500);
  } catch {
    // clipboard indisponível — sem quebrar o fluxo
  }
});

currentUserReady.then(loadUsers);

/* ---------------------------------------------------------
   Taxas de marketplace (Amazon, por enquanto) — tabela editável em vez de
   hardcoded num arquivo de código, pra corrigir um valor sem depender de
   deploy. Ver api/marketplace-rates.js / lib/marketplaceRates.js.
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
  return Number(s);
}

function formatPct(value) {
  const n = Number(value);
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toString().replace(".", ",")}%`;
}

function formatBRLSimple(value) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

const rateForm = document.getElementById("rate-form");
const rateFormToggle = document.getElementById("rateFormToggle");
const rateFormAccordion = document.getElementById("rateFormAccordion");
const rateMarketplaceSelect = document.getElementById("rateMarketplace");
const rateSubmitBtn = document.getElementById("rate-submit");
const rateCancelEditBtn = document.getElementById("rate-cancel-edit");
const rateActionError = document.getElementById("rateActionError");
const ratesTable = document.getElementById("ratesTable");
const ratesTableBody = document.getElementById("ratesTableBody");
const ratesEmpty = document.getElementById("ratesEmpty");

rateFormToggle.addEventListener("click", () => {
  const expanded = rateFormToggle.getAttribute("aria-expanded") === "true";
  rateFormToggle.setAttribute("aria-expanded", String(!expanded));
  rateFormAccordion.hidden = expanded;
});

const rateFieldIds = ["rateCategory", "ratePct", "rateMinFee", "rateTierThreshold", "ratePctAbove", "rateFixedFee", "rateNote"];

// A Amazon varia comissão por CATEGORIA de produto (às vezes com um
// segundo % acima de um limiar, dentro da mesma categoria); a Shopee varia
// comissão por FAIXA DE PREÇO do item (sem categoria) — cada linha
// cadastrada aqui já É uma faixa inteira, então os campos "muda de % acima
// de" / "% acima desse valor" (feitos pro caso da Amazon) não fazem
// sentido pra Shopee, e ficam escondidos. Ver resolveFeesForEntry em
// script.js (kind "amazon-tiered" vs. "shopee-banded").
const MARKETPLACE_COPY = {
  amazon: {
    categoryLabel: "Categoria",
    tierMain: "Muda de % acima de ",
    tierHint: "(opcional)",
    showPctAbove: true,
    showMinFee: true,
    fixedFeeHelp: 'Some à comissão — use pra tarifas como a de "Mídia" (R$2,00 fixo, plano Individual) na Amazon.',
  },
  shopee: {
    categoryLabel: "Faixa de preço (descrição)",
    tierMain: "A partir de que preço essa faixa vale ",
    tierHint: "(0 = faixa inicial)",
    showPctAbove: false,
    showMinFee: false,
    fixedFeeHelp: "Tarifa fixa da própria faixa (ex.: R$16 na faixa de R$80 a R$99,99) — não é opcional pra Shopee.",
  },
  tiktok: {
    categoryLabel: "Faixa de preço (descrição)",
    tierMain: "A partir de que preço essa faixa vale ",
    tierHint: "(0 = faixa inicial)",
    showPctAbove: false,
    showMinFee: false,
    fixedFeeHelp: 'Tarifa fixa da própria faixa (chamada de "taxa por item vendido" pelo TikTok Shop) — não é opcional.',
  },
  magalu: {
    categoryLabel: "Forma de repasse",
    tierMain: "Não se aplica ",
    tierHint: "(deixe em branco)",
    showPctAbove: false,
    showMinFee: false,
    fixedFeeHelp: "Tarifa fixa por item, variável por categoria (R$5 a R$10 segundo o Portal do Seller) — cadastre uma referência (ex.: a média R$7,50) e detalhe a variação na Observação.",
  },
};

function updateRateFormCopy() {
  const copy = MARKETPLACE_COPY[rateMarketplaceSelect.value] || MARKETPLACE_COPY.amazon;
  document.getElementById("rateCategory-label").textContent = copy.categoryLabel;

  const tierLabelEl = document.getElementById("rateTierThreshold-label");
  tierLabelEl.replaceChildren();
  tierLabelEl.append(document.createTextNode(copy.tierMain));
  const hint = document.createElement("span");
  hint.className = "field__optional";
  hint.textContent = copy.tierHint;
  tierLabelEl.appendChild(hint);

  document.getElementById("ratePctAbove-field").hidden = !copy.showPctAbove;
  document.getElementById("rateMinFee-field").hidden = !copy.showMinFee;
  document.getElementById("rateFixedFee-help").textContent = copy.fixedFeeHelp;
}

function clearRateForm() {
  document.getElementById("rateId").value = "";
  rateFieldIds.forEach((id) => {
    document.getElementById(id).value = "";
  });
  clearFieldError("rateCategory");
  clearFieldError("ratePct");
  rateSubmitBtn.textContent = "Adicionar";
  rateCancelEditBtn.hidden = true;
  updateRateFormCopy();
}

function fillRateForm(rate) {
  rateFormToggle.setAttribute("aria-expanded", "true");
  rateFormAccordion.hidden = false;
  document.getElementById("rateId").value = rate.id;
  rateMarketplaceSelect.value = rate.marketplace;
  document.getElementById("rateCategory").value = rate.category_label;
  document.getElementById("ratePct").value = String(rate.pct).replace(".", ",");
  document.getElementById("rateMinFee").value = rate.min_fee ? String(rate.min_fee).replace(".", ",") : "";
  document.getElementById("rateTierThreshold").value = rate.tier_threshold != null ? String(rate.tier_threshold).replace(".", ",") : "";
  document.getElementById("ratePctAbove").value = rate.pct_above_threshold != null ? String(rate.pct_above_threshold).replace(".", ",") : "";
  document.getElementById("rateFixedFee").value = rate.fixed_fee ? String(rate.fixed_fee).replace(".", ",") : "";
  document.getElementById("rateNote").value = rate.note || "";
  updateRateFormCopy();
  rateSubmitBtn.textContent = "Salvar alterações";
  rateCancelEditBtn.hidden = false;
  rateForm.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("rateCategory").focus();
}

function describeRateDetails(rate) {
  const parts = [];
  if (rate.tier_threshold != null && rate.pct_above_threshold != null) {
    parts.push(`${formatPct(rate.pct_above_threshold)} acima de ${formatBRLSimple(rate.tier_threshold)}`);
  } else if (rate.tier_threshold != null) {
    parts.push(`a partir de ${formatBRLSimple(rate.tier_threshold)}`);
  }
  if (rate.fixed_fee) {
    parts.push(`+ ${formatBRLSimple(rate.fixed_fee)} fixo`);
  }
  if (rate.min_fee) {
    parts.push(`mín. ${formatBRLSimple(rate.min_fee)}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

let allRates = [];
const ratesSearchInput = document.getElementById("ratesSearch");
const statsRateCount = document.getElementById("statsRateCount");
const statsRateLabel = document.getElementById("statsRateLabel");

function updateRateStats() {
  if (!statsRateCount) return;
  statsRateCount.textContent = String(allRates.length);
  if (statsRateLabel) {
    const mpName = rateMarketplaceSelect.selectedOptions[0]?.textContent || "";
    statsRateLabel.textContent = `Categorias cadastradas (${mpName})`;
  }
}

function filterRates(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allRates;
  return allRates.filter((r) => r.category_label.toLowerCase().includes(q));
}

function renderRatesTable(rates) {
  ratesTableBody.replaceChildren();

  if (!rates.length) {
    ratesTable.hidden = true;
    ratesEmpty.hidden = false;
    ratesEmpty.textContent = allRates.length
      ? "Nenhuma categoria encontrada pra essa busca."
      : "Nenhuma categoria cadastrada ainda.";
    return;
  }

  ratesTable.hidden = false;
  ratesEmpty.hidden = true;

  const fragment = document.createDocumentFragment();
  rates.forEach((rate) => {
    const tr = document.createElement("tr");

    const catTd = document.createElement("td");
    catTd.textContent = rate.category_label;
    if (rate.note) catTd.title = rate.note;

    const pctTd = document.createElement("td");
    pctTd.textContent = formatPct(rate.pct);

    const detailsTd = document.createElement("td");
    detailsTd.textContent = describeRateDetails(rate);

    const actionsTd = document.createElement("td");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "admin-table__actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "admin-table__icon-btn";
    editBtn.setAttribute("aria-label", `Editar ${rate.category_label}`);
    editBtn.title = "Editar";
    editBtn.appendChild(createIcon(ICON_PATH_EDIT));
    editBtn.addEventListener("click", () => fillRateForm(rate));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "admin-table__icon-btn admin-table__icon-btn--danger";
    deleteBtn.setAttribute("aria-label", `Remover ${rate.category_label}`);
    deleteBtn.title = "Remover";
    deleteBtn.appendChild(createIcon(ICON_PATH_DELETE));
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm(`Remover a categoria "${rate.category_label}"?`)) return;
      deleteBtn.disabled = true;
      try {
        const delResp = await fetch("/api/marketplace-rates", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: rate.id }),
        });
        if (!delResp.ok) {
          const data = await delResp.json();
          rateActionError.textContent = data.error || "Não foi possível remover a categoria.";
          rateActionError.hidden = false;
          deleteBtn.disabled = false;
          return;
        }
        loadRates();
      } catch {
        rateActionError.textContent = "Erro de conexão. Tente novamente.";
        rateActionError.hidden = false;
        deleteBtn.disabled = false;
      }
    });

    actionsWrap.append(editBtn, deleteBtn);
    actionsTd.appendChild(actionsWrap);
    tr.append(catTd, pctTd, detailsTd, actionsTd);
    fragment.appendChild(tr);
  });
  ratesTableBody.appendChild(fragment);
}

async function loadRates() {
  const resp = await fetch(`/api/marketplace-rates?marketplace=${encodeURIComponent(rateMarketplaceSelect.value)}`, { credentials: "same-origin" });
  if (!resp.ok) return;
  const { rates } = await resp.json();
  allRates = rates;
  updateRateStats();
  renderRatesTable(filterRates(ratesSearchInput ? ratesSearchInput.value : ""));
}

ratesSearchInput?.addEventListener("input", () => {
  renderRatesTable(filterRates(ratesSearchInput.value));
});

rateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldError("rateCategory");
  clearFieldError("ratePct");
  rateActionError.hidden = true;

  const id = document.getElementById("rateId").value.trim();
  const category = document.getElementById("rateCategory").value.trim();
  const pctRaw = document.getElementById("ratePct").value.trim();

  let hasError = false;
  if (!category) {
    setFieldError("rateCategory", "Informe a categoria.");
    hasError = true;
  }
  const pct = parseLocaleNumber(pctRaw);
  if (!Number.isFinite(pct) || pct < 0) {
    setFieldError("ratePct", "Informe a comissão em %.");
    hasError = true;
  }
  if (hasError) return;

  const minFeeRaw = document.getElementById("rateMinFee").value.trim();
  const tierRaw = document.getElementById("rateTierThreshold").value.trim();
  const pctAboveRaw = document.getElementById("ratePctAbove").value.trim();
  const fixedFeeRaw = document.getElementById("rateFixedFee").value.trim();
  const note = document.getElementById("rateNote").value.trim();

  const payload = {
    marketplace: rateMarketplaceSelect.value,
    category_label: category,
    pct,
    min_fee: minFeeRaw ? parseLocaleNumber(minFeeRaw) : 0,
    tier_threshold: tierRaw ? parseLocaleNumber(tierRaw) : null,
    pct_above_threshold: pctAboveRaw ? parseLocaleNumber(pctAboveRaw) : null,
    fixed_fee: fixedFeeRaw ? parseLocaleNumber(fixedFeeRaw) : 0,
    note: note || null,
  };

  rateSubmitBtn.disabled = true;
  try {
    const resp = await fetch("/api/marketplace-rates", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(id ? { id, ...payload } : payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      rateActionError.textContent = data.error || "Não foi possível salvar a categoria.";
      rateActionError.hidden = false;
      return;
    }
    clearRateForm();
    loadRates();
  } catch {
    rateActionError.textContent = "Erro de conexão. Tente novamente.";
    rateActionError.hidden = false;
  } finally {
    rateSubmitBtn.disabled = false;
  }
});

rateCancelEditBtn.addEventListener("click", () => clearRateForm());

rateMarketplaceSelect.addEventListener("change", () => {
  clearRateForm();
  loadRates();
});

updateRateFormCopy();
loadRates();
