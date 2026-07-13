// Consulta o custo REAL de frete do Mercado Livre (Mercado Envios) para um
// pacote específico, usando a conexão OAuth do usuário logado (cada
// cliente conecta a própria conta — ver /api/auth/start).
//
// Exige que a conta tenha o Mercado Envios aceito — sem isso, o ML devolve
// o valor cheio do frete (sem nenhum subsídio de vendedor), o que não
// representa o custo real de oferecer frete grátis.
//
// A API do ML pede um CEP de destino (não temos o do comprador de
// antemão — isso é uma simulação, não uma venda real). Usamos um CEP de
// referência (capital de SP), documentado abaixo — o valor real varia
// por distância até o comprador.
//
// Uso: GET /api/ml-shipping?price=100&weight_g=500&length=20&width=15&height=10
const { getValidAccessToken } = require("../lib/ml");
const { getSessionFromRequest } = require("../lib/auth");

const REFERENCE_ZIP_CODE = "01310100"; // Av. Paulista, São Paulo — só referência

module.exports = async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const price = Number(url.searchParams.get("price"));
  const weightG = Number(url.searchParams.get("weight_g"));
  const length = Number(url.searchParams.get("length"));
  const width = Number(url.searchParams.get("width"));
  const height = Number(url.searchParams.get("height"));

  const allValid = [price, weightG, length, width, height].every((n) => Number.isFinite(n) && n > 0);
  if (!allValid) {
    res.status(400).json({ error: "Parâmetros 'price', 'weight_g', 'length', 'width' e 'height' precisam ser números maiores que zero." });
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

    const shippingUrl = new URL(`https://api.mercadolibre.com/users/${me.id}/shipping_options`);
    shippingUrl.searchParams.set("zip_code", REFERENCE_ZIP_CODE);
    shippingUrl.searchParams.set("dimensions", `${length}x${width}x${height},${weightG}`);
    shippingUrl.searchParams.set("item_price", String(price));
    shippingUrl.searchParams.set("free_shipping", "true");

    const shipResp = await fetch(shippingUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const shipData = await shipResp.json();

    if (!shipResp.ok) {
      res.status(shipResp.status).json({ error: "Mercado Livre recusou a consulta de frete.", details: shipData });
      return;
    }

    const options = Array.isArray(shipData.options) ? shipData.options : [];
    if (!options.length) {
      res.status(200).json({ source: "mercado_livre_api", available: false, reason: "Nenhuma opção de frete retornada para este pacote/destino." });
      return;
    }

    const cheapest = [...options].sort((a, b) => a.list_cost - b.list_cost)[0];
    const sellerCost = Math.max(0, cheapest.list_cost - cheapest.cost);

    res.status(200).json({
      source: "mercado_livre_api",
      available: true,
      reference_zip_code: REFERENCE_ZIP_CODE,
      method_name: cheapest.name,
      list_cost: cheapest.list_cost,
      buyer_cost: cheapest.cost,
      seller_cost: sellerCost,
    });
  } catch (err) {
    if (err.code === "ML_NOT_CONNECTED") {
      res.status(409).json({ error: err.message, code: "ML_NOT_CONNECTED" });
      return;
    }
    res.status(500).json({ error: String(err.message || err) });
  }
};
