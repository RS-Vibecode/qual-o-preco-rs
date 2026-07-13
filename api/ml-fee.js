// Consulta a taxa de comissão REAL do Mercado Livre para uma categoria e
// preço específicos, usando a conexão OAuth do usuário logado (cada
// cliente conecta a própria conta — ver /api/auth/start).
// Uso: GET /api/ml-fee?price=100&category_id=MLB1051&listing_type_id=gold_special
const { getValidAccessToken } = require("../lib/ml");
const { getSessionFromRequest } = require("../lib/auth");

module.exports = async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const price = url.searchParams.get("price");
  const categoryId = url.searchParams.get("category_id");
  const listingTypeId = url.searchParams.get("listing_type_id"); // opcional

  const priceNumber = Number(price);
  if (!price || !Number.isFinite(priceNumber) || priceNumber <= 0) {
    res.status(400).json({ error: "Parâmetro 'price' inválido ou ausente." });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ error: "Parâmetro 'category_id' ausente." });
    return;
  }

  try {
    const accessToken = await getValidAccessToken(session.userId);

    const mlUrl = new URL("https://api.mercadolibre.com/sites/MLB/listing_prices");
    mlUrl.searchParams.set("price", String(priceNumber));
    mlUrl.searchParams.set("category_id", categoryId);
    if (listingTypeId) mlUrl.searchParams.set("listing_type_id", listingTypeId);

    const mlResp = await fetch(mlUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await mlResp.json();

    if (!mlResp.ok) {
      res.status(mlResp.status).json({ error: "Mercado Livre recusou a consulta.", details: data });
      return;
    }

    res.status(200).json({ source: "mercado_livre_api", query: { price: priceNumber, category_id: categoryId, listing_type_id: listingTypeId || null }, result: data });
  } catch (err) {
    if (err.code === "ML_NOT_CONNECTED") {
      res.status(409).json({ error: err.message, code: "ML_NOT_CONNECTED" });
      return;
    }
    res.status(500).json({ error: String(err.message || err) });
  }
};
