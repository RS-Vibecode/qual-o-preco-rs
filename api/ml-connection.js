// Status e desconexão da conta do Mercado Livre do usuário logado — juntas
// num arquivo só (GET consulta, POST desconecta) porque o plano Hobby da
// Vercel limita a 12 Serverless Functions por deployment.
const { isConnected, disconnect } = require("../lib/ml");
const { getSessionFromRequest } = require("../lib/auth");

module.exports = async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  if (req.method === "GET") {
    const connected = await isConnected(session.userId);
    res.status(200).json({ connected });
    return;
  }

  if (req.method === "POST") {
    await disconnect(session.userId);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não permitido." });
};
