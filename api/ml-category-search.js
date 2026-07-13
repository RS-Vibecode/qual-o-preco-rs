// Sugere categorias do Mercado Livre a partir do nome/palavra-chave do
// produto, usando o endpoint público de "domain discovery" do ML — ao
// contrário de /api/ml-fee, este não exige autenticação OAuth. Por não
// exigir login, tem limite de taxa por IP (é a única rota pública que
// faz proxy pra fora, sem isso vira alvo fácil de flood).
// Uso: GET /api/ml-category-search?q=tenis+esportivo
const { checkIpRateLimit } = require("../lib/rateLimit");

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

module.exports = async (req, res) => {
  const allowed = await checkIpRateLimit(req, "ml-category-search", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!allowed) {
    res.status(429).json({ error: "Muitas buscas em pouco tempo. Aguarde um instante." });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();

  if (q.length < 3) {
    res.status(400).json({ error: "Parâmetro 'q' precisa ter ao menos 3 caracteres." });
    return;
  }

  try {
    const mlUrl = new URL("https://api.mercadolibre.com/sites/MLB/domain_discovery/search");
    mlUrl.searchParams.set("q", q);
    // Pede mais do que o necessário porque o ML costuma repetir o mesmo
    // category_name várias vezes (variando só por atributo interno, ex.:
    // gênero) — deduplicamos por nome abaixo antes de aplicar o limite
    // real, senão o usuário veria "Tênis" repetido 5x na lista.
    mlUrl.searchParams.set("limit", "8"); // 8 é o máximo aceito por este endpoint do ML

    const mlResp = await fetch(mlUrl.toString());
    const data = await mlResp.json();

    if (!mlResp.ok) {
      res.status(mlResp.status).json({ error: "Mercado Livre recusou a busca de categoria.", details: data });
      return;
    }

    const seenNames = new Set();
    const results = [];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (seenNames.has(item.category_name)) continue;
        seenNames.add(item.category_name);
        results.push({ category_id: item.category_id, category_name: item.category_name });
        if (results.length >= 6) break;
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
