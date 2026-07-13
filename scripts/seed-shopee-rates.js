// Popula a tabela marketplace_rates (marketplace="shopee") com a tabela
// oficial de comissão da Shopee Brasil por FAIXA DE PREÇO — não há
// variação por categoria de produto na Shopee, diferente da Amazon (ver
// resolveFeesForEntry em script.js, kind "shopee-banded"). Conferida
// contra a central do vendedor Shopee (seller.shopee.com.br), 13/07/2026.
//
// Uso: node scripts/seed-shopee-rates.js
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local
// (rode `vercel env pull .env.local` antes, se ainda não tiver).
// Idempotente: apaga as linhas "shopee" existentes antes de inserir.
//
// Escopo desta tabela: só a comissão padrão, válida para vendedores CNPJ e
// para CPF com até 450 pedidos em 90 dias. NÃO inclui o adicional de R$3
// por item para CPF acima de 450 pedidos/90 dias (métrica de histórico da
// loja, não calculável numa cotação avulsa) — decisão confirmada com o
// cliente em 13/07/2026. O Subsídio Pix também fica de fora de propósito:
// é um desconto que a própria Shopee banca pro comprador, não afeta o
// valor líquido que o vendedor recebe (confirmado por conta: comissão
// menor pelo Pix = exatamente o valor do subsídio, então o líquido bate
// com o do cartão/boleto nos dois casos).

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const { requireEnv } = require("../lib/env");

const BASE_NOTE =
  'Comissão padrão (CNPJ, ou CPF com até 450 pedidos/90 dias). Não inclui o adicional de R$3/item para CPF acima de 450 pedidos/90 dias — consulte o painel da Shopee nesse caso.';

const SHOPEE_RATES = [
  {
    category_label: "Até R$79,99",
    pct: 20,
    tier_threshold: 0,
    fixed_fee: 4,
    note: `${BASE_NOTE} Abaixo de R$8, a tarifa fixa vira metade do preço do produto (não R$4).`,
  },
  { category_label: "R$80,00 a R$99,99", pct: 14, tier_threshold: 80, fixed_fee: 16, note: BASE_NOTE },
  { category_label: "R$100,00 a R$199,99", pct: 14, tier_threshold: 100, fixed_fee: 20, note: BASE_NOTE },
  { category_label: "R$200,00 a R$499,99", pct: 14, tier_threshold: 200, fixed_fee: 26, note: BASE_NOTE },
  { category_label: "Acima de R$500,00", pct: 14, tier_threshold: 500, fixed_fee: 26, note: BASE_NOTE },
].map((row) => ({
  marketplace: "shopee",
  pct_above_threshold: null,
  min_fee: 0,
  ...row,
}));

async function main() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const delResp = await fetch(`${url}/rest/v1/marketplace_rates?marketplace=eq.shopee`, {
    method: "DELETE",
    headers,
  });
  if (!delResp.ok) {
    throw new Error(`Falha ao limpar linhas existentes: ${await delResp.text()}`);
  }
  console.log("Linhas antigas da Shopee removidas (se existiam).");

  const insResp = await fetch(`${url}/rest/v1/marketplace_rates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(SHOPEE_RATES),
  });
  const inserted = await insResp.json();
  if (!insResp.ok) {
    throw new Error(`Falha ao inserir: ${JSON.stringify(inserted)}`);
  }
  console.log(`${inserted.length} faixas de preço da Shopee inseridas com sucesso.`);
}

main().catch((err) => {
  console.error("Erro ao popular taxas da Shopee:", err.message);
  process.exit(1);
});
