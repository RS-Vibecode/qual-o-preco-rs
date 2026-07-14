// Duas buscas relacionadas ao Mercado Livre, no mesmo arquivo pra não
// estourar o limite de 12 Serverless Functions do plano Hobby (ver
// README, seção Arquitetura):
//
// 1. mode=category (padrão) — sugere categorias a partir do nome/palavra-
//    chave do produto, via endpoint público de "domain discovery" do ML.
//    Não exige login (é a única rota pública que faz proxy pra fora,
//    então tem limite de taxa por IP em vez de exigir sessão).
//    Uso: GET /api/ml-category-search?q=tenis+esportivo
//
// 2. mode=product — busca PRODUTOS JÁ CADASTRADOS na conta do próprio
//    usuário (exige sessão + Mercado Livre conectado), pra reaproveitar
//    a categoria REAL do item (mais precisa que adivinhar pelo nome) e,
//    quando disponível, o peso/dimensões da embalagem já declarados no
//    anúncio — resolve o problema de precisar digitar isso à mão toda
//    vez. Uso: GET /api/ml-category-search?mode=product&q=kit+gamer
const { checkIpRateLimit } = require("../lib/rateLimit");
const { getValidAccessToken } = require("../lib/ml");
const { getSessionFromRequest } = require("../lib/auth");

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

async function handleCategoryMode(req, res, q) {
  const allowed = await checkIpRateLimit(req, "ml-category-search", RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!allowed) {
    res.status(429).json({ error: "Muitas buscas em pouco tempo. Aguarde um instante." });
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
}

/** Extrai um número positivo de um value_name do tipo "18 cm"/"143 g"/
 * "0,5 kg" — devolve null pra placeholders do próprio ML ("-1") ou texto
 * sem número. Peso sempre convertido pra gramas (o resto dos campos do
 * formulário já é em cm, igual o ML usa). */
function parseMeasurement(valueName, { isWeight = false } = {}) {
  if (!valueName || typeof valueName !== "string") return null;
  const match = valueName.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  if (!Number.isFinite(num) || num <= 0) return null; // "-1" etc. = não preenchido no ML
  if (isWeight && /kg/i.test(valueName)) return num * 1000;
  return num;
}

/** Peso/dimensões da embalagem, só a partir dos atributos
 * SELLER_PACKAGE_* (a declaração explícita do vendedor sobre a EMBALAGEM
 * de envio) — de propósito não cai pra HEIGHT/WIDTH/LENGTH genéricos,
 * que no ML costumam descrever o PRODUTO em si, não a caixa em que ele é
 * despachado; usar esses por engano daria um frete calculado errado. Sem
 * SELLER_PACKAGE_*, a função devolve null e o formulário simplesmente
 * fica com os campos de frete vazios, iguais a antes desta função existir. */
function extractPackageDimensions(attributes) {
  if (!Array.isArray(attributes)) return null;
  const byId = Object.fromEntries(attributes.map((a) => [a.id, a.value_name]));
  const weightG = parseMeasurement(byId.SELLER_PACKAGE_WEIGHT, { isWeight: true });
  const height = parseMeasurement(byId.SELLER_PACKAGE_HEIGHT);
  const width = parseMeasurement(byId.SELLER_PACKAGE_WIDTH);
  const length = parseMeasurement(byId.SELLER_PACKAGE_LENGTH);
  if (!weightG || !height || !width || !length) return null; // parcial não ajuda — precisa dos 4
  return { weightG, height, width, length };
}

async function handleProductMode(req, res, q) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);

    const meResp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const me = await meResp.json();
    if (!meResp.ok) {
      res.status(meResp.status).json({ error: "Mercado Livre recusou identificar o vendedor.", details: me });
      return;
    }

    const searchUrl = new URL(`https://api.mercadolibre.com/users/${me.id}/items/search`);
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("limit", "8");
    const searchResp = await fetch(searchUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const searchData = await searchResp.json();
    if (!searchResp.ok) {
      res.status(searchResp.status).json({ error: "Mercado Livre recusou a busca de produtos.", details: searchData });
      return;
    }

    const ids = Array.isArray(searchData.results) ? searchData.results : [];
    if (!ids.length) {
      res.status(200).json({ results: [] });
      return;
    }

    const itemsUrl = new URL("https://api.mercadolibre.com/items");
    itemsUrl.searchParams.set("ids", ids.join(","));
    itemsUrl.searchParams.set("attributes", "id,title,price,category_id,seller_custom_field,attributes");
    const itemsResp = await fetch(itemsUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const itemsData = await itemsResp.json();
    if (!itemsResp.ok) {
      res.status(itemsResp.status).json({ error: "Mercado Livre recusou os detalhes dos produtos.", details: itemsData });
      return;
    }

    const results = itemsData
      .filter((entry) => entry.code === 200 && entry.body)
      .map((entry) => {
        const b = entry.body;
        return {
          id: b.id,
          title: b.title,
          sku: b.seller_custom_field || null,
          price: b.price,
          category_id: b.category_id,
          package: extractPackageDimensions(b.attributes),
        };
      });

    res.status(200).json({ results });
  } catch (err) {
    if (err.code === "ML_NOT_CONNECTED") {
      res.status(409).json({ error: err.message, code: "ML_NOT_CONNECTED" });
      return;
    }
    res.status(500).json({ error: String(err.message || err) });
  }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  const mode = url.searchParams.get("mode") === "product" ? "product" : "category";

  if (q.length < 3) {
    res.status(400).json({ error: "Parâmetro 'q' precisa ter ao menos 3 caracteres." });
    return;
  }

  if (mode === "product") {
    await handleProductMode(req, res, q);
  } else {
    await handleCategoryMode(req, res, q);
  }
};
