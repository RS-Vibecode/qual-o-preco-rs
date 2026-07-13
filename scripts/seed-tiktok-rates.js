// Popula a tabela marketplace_rates (marketplace="tiktok") com a tarifa
// oficial do TikTok Shop Brasil por FAIXA DE PREÇO — mesmo formato da
// Shopee (sem variação por categoria, ver resolveFeesForEntry em
// script.js, kind "price-banded"). Fonte: comunicado oficial do TikTok
// Shop pro vendedor, conferido em 13/07/2026.
//
// ATENÇÃO — mudança de tarifa agendada: o comunicado avisa que a partir
// de 15/07/2026 00:00 (horário do Brasil) a tarifa muda de um valor fixo
// (6% + R$4,00 pra qualquer preço) para a tabela por faixa abaixo. Este
// script já cadastra a tabela NOVA (decisão confirmada com o cliente em
// 13/07/2026, já que a antiga fica obsoleta em apenas 2 dias).
//
// Uso: node scripts/seed-tiktok-rates.js
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local
// (rode `vercel env pull .env.local` antes, se ainda não tiver).
// Idempotente: apaga as linhas "tiktok" existentes antes de inserir.
//
// Escopo desta tabela: só comissão + "taxa por item vendido" (nomes do
// próprio TikTok Shop) — o material recebido não mencionou nenhuma taxa
// de processamento de pagamento separada, nem distinção CPF/CNPJ. Base de
// cálculo confirmada com os exemplos do comunicado: preço do item MENOS
// desconto do próprio vendedor (não o preço de tabela) — no nosso caso,
// isso é simplesmente o preço de venda sugerido pela calculadora.

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
  "Tarifa vigente a partir de 15/07/2026 00:00 (horário do Brasil). Base de cálculo: preço do item após desconto do próprio vendedor (na calculadora, o preço de venda sugerido). Não inclui eventual taxa de processamento de pagamento separada — não mencionada no material oficial recebido.";

const TIKTOK_RATES = [
  { category_label: "Até R$49,99", pct: 10, tier_threshold: 0, fixed_fee: 4, note: BASE_NOTE },
  { category_label: "A partir de R$50,00", pct: 6, tier_threshold: 50, fixed_fee: 6, note: BASE_NOTE },
].map((row) => ({
  marketplace: "tiktok",
  pct_above_threshold: null,
  min_fee: 0,
  ...row,
}));

async function main() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const delResp = await fetch(`${url}/rest/v1/marketplace_rates?marketplace=eq.tiktok`, {
    method: "DELETE",
    headers,
  });
  if (!delResp.ok) {
    throw new Error(`Falha ao limpar linhas existentes: ${await delResp.text()}`);
  }
  console.log("Linhas antigas do TikTok Shop removidas (se existiam).");

  const insResp = await fetch(`${url}/rest/v1/marketplace_rates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(TIKTOK_RATES),
  });
  const inserted = await insResp.json();
  if (!insResp.ok) {
    throw new Error(`Falha ao inserir: ${JSON.stringify(inserted)}`);
  }
  console.log(`${inserted.length} faixas de preço do TikTok Shop inseridas com sucesso.`);
}

main().catch((err) => {
  console.error("Erro ao popular taxas do TikTok Shop:", err.message);
  process.exit(1);
});
