// Popula scripts/supabase-marketplace-rates.sql (rode esse SQL antes) com
// a tabela oficial de tarifas da Amazon Brasil por categoria — conferida
// em duas rodadas com prints de tela do painel oficial do vendedor
// (sellercentral.amazon.com.br), 13/07/2026.
//
// Uso: node scripts/seed-amazon-rates.js
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local
// (rode `vercel env pull .env.local` antes, se ainda não tiver).
// Idempotente: apaga as linhas "amazon" existentes antes de inserir, pra
// poder rodar de novo sem duplicar caso a tabela precise ser recriada.

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

// Nota de rodapé 1 do painel oficial (Acessórios Eletrônicos) e nota 2
// (Móveis/Colchões) resumidas no campo "note" de cada linha aplicável.
const AMAZON_RATES = [
  { category_label: "Roupas e Acessórios", pct: 14 },
  { category_label: "Calçados", pct: 14 },
  { category_label: "Óculos", pct: 14 },
  { category_label: "Mochilas, Bolsas, Bagagem e Acessórios de Viagem", pct: 14 },
  { category_label: "Relógios", pct: 13 },
  { category_label: "Joias", pct: 14 },
  {
    category_label: "Mídia: Livros, DVD, Música, Software, Vídeo",
    pct: 15,
    fixed_fee: 2,
    note: "Tarifa fixa adicional de R$2,00 por produto (Plano Individual). No Plano Profissional a tarifa é variável em vez de R$2,00 fixo — ajuste este valor se a conta for Profissional.",
  },
  { category_label: "TV, áudio e cinema em casa", pct: 10 },
  { category_label: "Eletrônicos portáteis", pct: 13 },
  { category_label: "Celulares", pct: 11 },
  { category_label: "Câmeras e Fotografia", pct: 11 },
  {
    category_label: "Acessórios Eletrônicos",
    pct: 15,
    tier_threshold: 100,
    pct_above_threshold: 10,
    note: "15% sobre os primeiros R$100; 10% sobre o que exceder. Abaixo de R$100, 15% sobre o valor total.",
  },
  { category_label: "Consoles de Videogame", pct: 11 },
  { category_label: "Videogames e Acessórios para Jogos", pct: 11 },
  { category_label: "Casa e Cozinha", pct: 12 },
  { category_label: "DIY e ferramentas", pct: 11 },
  { category_label: "Ferramentas Elétricas Essenciais", pct: 11 },
  { category_label: "Computadores", pct: 12 },
  { category_label: "Papelaria e Escritório", pct: 13 },
  { category_label: "Esportes, Aventura e Lazer", pct: 12 },
  { category_label: "Eletrodomésticos Grandes", pct: 11, note: "Inclui aparelhos de ar-condicionado." },
  {
    category_label: "Móveis",
    pct: 15,
    tier_threshold: 200,
    pct_above_threshold: 10,
    note: "15% sobre os primeiros R$200; 10% sobre o que exceder. Abaixo de R$200, 15% sobre o valor total.",
  },
  { category_label: "Brinquedos e Jogos", pct: 12 },
  { category_label: "Produtos para bebês", pct: 12 },
  { category_label: "Saúde e Cuidado Pessoal", pct: 12 },
  { category_label: "Beleza", pct: 13 },
  { category_label: "Produtos de beleza de luxo", pct: 14 },
  { category_label: "Produtos para cuidados pessoais", pct: 12 },
  { category_label: "Gramado e Jardim", pct: 12 },
  { category_label: "Instrumentos Musicais e Produção Audiovisual", pct: 12 },
  { category_label: "Automotivos e Esportes a Motor", pct: 12 },
  { category_label: "Pneus", pct: 10 },
  { category_label: "Produtos para Animais de Estimação", pct: 12 },
  { category_label: "Comidas e Bebidas", pct: 10 },
  { category_label: "Cerveja e Vinho", pct: 11 },
  { category_label: "Suprimentos Comerciais, Industriais e Científicos", pct: 12 },
  { category_label: "Outros", pct: 15 },
  {
    category_label: "Colchões",
    pct: 15,
    tier_threshold: 200,
    pct_above_threshold: 10,
    note: "15% sobre os primeiros R$200; 10% sobre o que exceder. Abaixo de R$200, 15% sobre o valor total.",
  },
].map((row) => ({
  marketplace: "amazon",
  tier_threshold: null,
  pct_above_threshold: null,
  fixed_fee: 0,
  min_fee: 1, // comissão mínima aplicável por produto — igual em todas as categorias
  note: null,
  ...row,
}));

async function main() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const delResp = await fetch(`${url}/rest/v1/marketplace_rates?marketplace=eq.amazon`, {
    method: "DELETE",
    headers,
  });
  if (!delResp.ok) {
    throw new Error(`Falha ao limpar linhas existentes: ${await delResp.text()}`);
  }
  console.log("Linhas antigas da Amazon removidas (se existiam).");

  const insResp = await fetch(`${url}/rest/v1/marketplace_rates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(AMAZON_RATES),
  });
  const inserted = await insResp.json();
  if (!insResp.ok) {
    throw new Error(`Falha ao inserir: ${JSON.stringify(inserted)}`);
  }
  console.log(`${inserted.length} categorias da Amazon inseridas com sucesso.`);
}

main().catch((err) => {
  console.error("Erro ao popular taxas da Amazon:", err.message);
  process.exit(1);
});
