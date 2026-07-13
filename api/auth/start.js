// Cada usuário logado (cliente ou admin) clica em "Conectar Mercado
// Livre" na própria calculadora, chega aqui, e é mandado pro login do ML.
// Depois de autorizar, o ML redireciona pra /api/auth/callback com um
// "code" — o "state" gerado aqui é o que liga esse code de volta a ESTE
// usuário (ver comentário completo em lib/ml.js).
const { requireEnv, createOAuthState } = require("../../lib/ml");
const { getSessionFromRequest } = require("../../lib/auth");

module.exports = async (req, res) => {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      res.writeHead(302, { Location: "/login.html" });
      res.end();
      return;
    }

    const clientId = requireEnv("ML_CLIENT_ID");
    const redirectUri = requireEnv("ML_REDIRECT_URI");
    const state = await createOAuthState(session.userId);

    const url = new URL("https://auth.mercadolivre.com.br/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    res.writeHead(302, { Location: url.toString() });
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
};
