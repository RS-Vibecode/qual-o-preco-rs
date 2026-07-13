// Taxas de referência por marketplace/categoria (Amazon, e outros que
// vierem depois). GET é liberado pra qualquer usuário logado (a
// calculadora precisa disso pra montar o seletor de categoria); criar,
// editar e remover exige admin.
const {
  listMarketplaceRates,
  createMarketplaceRate,
  updateMarketplaceRate,
  deleteMarketplaceRate,
} = require("../lib/marketplaceRates");
const { getSessionFromRequest, requireAdmin } = require("../lib/auth");

const REQUIRED_FIELDS = ["marketplace", "category_label", "pct"];

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }
    const url = new URL(req.url, `https://${req.headers.host}`);
    const marketplace = url.searchParams.get("marketplace") || undefined;
    try {
      const rates = await listMarketplaceRates(marketplace);
      res.status(200).json({ rates });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  let session;
  try {
    session = await requireAdmin(req);
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
    if (missing.length) {
      res.status(400).json({ error: `Campos obrigatórios ausentes: ${missing.join(", ")}.` });
      return;
    }
    try {
      const rate = await createMarketplaceRate({
        marketplace: body.marketplace,
        category_label: body.category_label,
        pct: Number(body.pct),
        tier_threshold: body.tier_threshold != null && body.tier_threshold !== "" ? Number(body.tier_threshold) : null,
        pct_above_threshold: body.pct_above_threshold != null && body.pct_above_threshold !== "" ? Number(body.pct_above_threshold) : null,
        fixed_fee: body.fixed_fee != null && body.fixed_fee !== "" ? Number(body.fixed_fee) : 0,
        min_fee: body.min_fee != null && body.min_fee !== "" ? Number(body.min_fee) : 0,
        note: body.note || null,
        updated_by: session.userId,
      });
      res.status(201).json({ rate });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "PATCH") {
    const { id, ...fields } = req.body || {};
    if (!id) {
      res.status(400).json({ error: "Parâmetro 'id' é obrigatório." });
      return;
    }
    const update = { updated_by: session.userId };
    for (const key of ["marketplace", "category_label", "note"]) {
      if (fields[key] !== undefined) update[key] = fields[key] || null;
    }
    for (const key of ["pct", "tier_threshold", "pct_above_threshold", "fixed_fee", "min_fee"]) {
      if (fields[key] !== undefined) update[key] = fields[key] === "" || fields[key] === null ? null : Number(fields[key]);
    }
    try {
      const rate = await updateMarketplaceRate(id, update);
      res.status(200).json({ rate });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) {
      res.status(400).json({ error: "Parâmetro 'id' é obrigatório." });
      return;
    }
    try {
      await deleteMarketplaceRate(id);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Método não permitido." });
};
