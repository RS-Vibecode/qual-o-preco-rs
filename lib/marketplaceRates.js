// Taxas de referência por marketplace/categoria (Amazon, e outros que
// vierem depois) — guardadas no Supabase em vez de hardcoded num arquivo
// de código, pra o admin poder corrigir um valor sem precisar de deploy.
// Mesmo padrão de acesso de lib/auth.js (REST do Supabase com
// service_role, nunca chamado direto do navegador).

const { requireEnv } = require("./env");

function supabaseAdminHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

const SELECT_FIELDS = "id,marketplace,category_label,pct,tier_threshold,pct_above_threshold,fixed_fee,min_fee,note,updated_at";

async function listMarketplaceRates(marketplace) {
  const url = requireEnv("SUPABASE_URL");
  const filter = marketplace ? `&marketplace=eq.${encodeURIComponent(marketplace)}` : "";
  const resp = await fetch(`${url}/rest/v1/marketplace_rates?select=${SELECT_FIELDS}${filter}&order=category_label.asc`, {
    headers: supabaseAdminHeaders(),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(data.message || "Falha ao listar taxas de marketplace.");
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

async function createMarketplaceRate(fields) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/marketplace_rates`, {
    method: "POST",
    headers: { ...supabaseAdminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  const rows = await resp.json();
  if (!resp.ok) {
    const err = new Error(rows.message || "Falha ao criar taxa de marketplace.");
    err.status = resp.status;
    throw err;
  }
  return rows[0];
}

async function updateMarketplaceRate(id, fields) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/marketplace_rates?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...supabaseAdminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  const rows = await resp.json();
  if (!resp.ok) {
    const err = new Error(rows.message || "Falha ao atualizar taxa de marketplace.");
    err.status = resp.status;
    throw err;
  }
  return rows[0];
}

async function deleteMarketplaceRate(id) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/marketplace_rates?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: supabaseAdminHeaders(),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(data.message || "Falha ao remover taxa de marketplace.");
    err.status = resp.status;
    throw err;
  }
}

module.exports = {
  listMarketplaceRates,
  createMarketplaceRate,
  updateMarketplaceRate,
  deleteMarketplaceRate,
};
