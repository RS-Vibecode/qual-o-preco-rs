// Recebe o retorno do Mercado Livre depois de /api/auth/start, resolve o
// "state" pro id do usuário que iniciou a conexão, troca o código pelo
// access_token/refresh_token e guarda os dois no Redis (ml:tokens:{id do
// usuário} — ver lib/ml.js). Depois, volta pra calculadora.
const { connectWithAuthorizationCode, resolveOAuthState } = require("../../lib/ml");

// O parâmetro "error" desta rota vem direto do Mercado Livre (ou de
// qualquer um forjando a URL, já que é uma rota pública) e ia direto pro
// HTML sem escapar — dava pra injetar <meta http-equiv="refresh"> e
// redirecionar a vítima pra um site de phishing (o CSP bloqueia <script>
// mas não bloqueia essa tag). Escapamos qualquer valor antes de montar a
// página de erro.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0B0532; color: #F4F3F3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 24px; }
  .box { max-width: 480px; }
  h1 { color: #F87171; }
  .btn-back { display: inline-block; margin-top: 20px; padding: 0.85rem 1.6rem; background: #E8A020; color: #1B1B4F; font-weight: 700; text-decoration: none; border-radius: 10px; }
  .btn-back:hover { background: #F3C263; }
</style></head>
<body><div class="box"><h1>${safeTitle}</h1><p>${safeMessage}</p><a class="btn-back" href="/index.html">Voltar pra calculadora</a></div></body></html>`;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      res.status(400).send(errorPage("Autorização cancelada", "O Mercado Livre informou: " + errorParam));
      return;
    }

    if (!code) {
      res.status(400).send(errorPage("Código ausente", 'Não recebemos o parâmetro "code" do Mercado Livre.'));
      return;
    }

    const userId = await resolveOAuthState(state);
    if (!userId) {
      res.status(400).send(
        errorPage("Link expirado", "Esse link de autorização já foi usado ou expirou. Volte em Configurações e clique em \"Conectar Mercado Livre\" de novo.")
      );
      return;
    }

    await connectWithAuthorizationCode(code, userId);
    res.writeHead(302, { Location: "/settings.html?ml_connected=1" });
    res.end();
  } catch (err) {
    console.error("Erro ao conectar Mercado Livre:", err);
    res.status(500).send(errorPage("Falha ao conectar", "Não foi possível concluir a conexão com o Mercado Livre. Tente novamente."));
  }
};
