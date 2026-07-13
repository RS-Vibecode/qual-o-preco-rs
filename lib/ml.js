// Integração OAuth2 com o Mercado Livre — uma conexão POR USUÁRIO logado
// (cada cliente conecta a própria conta de vendedor; a RS também é só
// "mais um usuário" desse mesmo mecanismo).
//
// Fluxo:
// 1. Usuário logado clica em "Conectar Mercado Livre" (/api/auth/start).
//    Como o Mercado Livre exige EXATAMENTE a mesma redirect_uri cadastrada
//    no app, não dá pra levar o id do usuário na URL de redirecionamento —
//    em vez disso, geramos um "state" aleatório de uso único, guardado no
//    Redis apontando pro id do usuário, e mandamos esse state pro ML. Ele
//    devolve o mesmo state no callback, sem alterar — é assim que
//    recuperamos "de quem" é essa conexão (o cookie de sessão da própria
//    ferramenta não pode ser usado aqui: ele é SameSite=Strict, e o
//    redirecionamento de volta do ML é uma navegação de origem cruzada,
//    então o navegador não o envia nessa requisição).
// 2. /api/auth/callback troca o "code" por um access_token (dura 6h) + um
//    refresh_token (dura 6 meses, uso único — cada renovação invalida o
//    anterior e devolve um novo). Ficam no Redis, na chave ml:tokens:{id
//    do usuário} — não existe mais UMA conexão global.
// 3. Qualquer chamada à API do ML (taxa, frete) usa
//    getValidAccessToken(userId), que reaproveita o access_token em cache
//    se ainda for válido, ou renova via refresh_token automaticamente.

const { redis } = require("./redis");
const { requireEnv } = require("./env");

const ACCESS_TOKEN_TTL_SECONDS = 6 * 60 * 60 - 300; // 6h menos 5min de margem
const OAUTH_STATE_TTL_SECONDS = 10 * 60; // 10 min pra completar o login no ML

function tokenKey(userId) {
  return `ml:tokens:${userId}`;
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requireEnv("ML_CLIENT_ID"),
    client_secret: requireEnv("ML_CLIENT_SECRET"),
    code,
    redirect_uri: requireEnv("ML_REDIRECT_URI"),
  });
  return postToken(body);
}

async function refreshTokens(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireEnv("ML_CLIENT_ID"),
    client_secret: requireEnv("ML_CLIENT_SECRET"),
    refresh_token: refreshToken,
  });
  return postToken(body);
}

async function postToken(body) {
  const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Falha ao obter token do Mercado Livre: ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function saveTokens(userId, tokenData) {
  await redis.set(tokenKey(userId), {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    obtained_at: Date.now(),
  });
}

/** Gera e guarda o "state" único que liga o retorno do ML ao usuário que iniciou a conexão. */
async function createOAuthState(userId) {
  const state = require("crypto").randomUUID();
  await redis.set(`ml_oauth_state:${state}`, userId, { ex: OAUTH_STATE_TTL_SECONDS });
  return state;
}

/** Resolve o "state" recebido de volta do ML pro id do usuário — uso único. */
async function resolveOAuthState(state) {
  if (!state) return null;
  const userId = await redis.get(`ml_oauth_state:${state}`);
  if (userId) await redis.del(`ml_oauth_state:${state}`);
  return userId;
}

/** Chamado pelo /api/auth/callback logo após o usuário autorizar o app no ML. */
async function connectWithAuthorizationCode(code, userId) {
  const tokenData = await exchangeCodeForTokens(code);
  await saveTokens(userId, tokenData);
  return tokenData;
}

async function isConnected(userId) {
  const stored = await redis.get(tokenKey(userId));
  return !!(stored && stored.refresh_token);
}

async function disconnect(userId) {
  await redis.del(tokenKey(userId));
}

/**
 * Devolve um access_token válido para ESTE usuário, renovando via
 * refresh_token quando necessário. Uso: `await getValidAccessToken(userId)`.
 */
async function getValidAccessToken(userId) {
  const stored = await redis.get(tokenKey(userId));
  if (!stored || !stored.refresh_token) {
    const err = new Error("Você ainda não conectou sua conta do Mercado Livre.");
    err.code = "ML_NOT_CONNECTED";
    throw err;
  }

  const ageSeconds = (Date.now() - (stored.obtained_at || 0)) / 1000;
  if (stored.access_token && ageSeconds < ACCESS_TOKEN_TTL_SECONDS) {
    return stored.access_token;
  }

  // Access token expirado (ou perto disso) — renova usando o refresh_token
  // atual. A resposta traz um refresh_token NOVO, que precisa substituir
  // o antigo imediatamente (uso único).
  const tokenData = await refreshTokens(stored.refresh_token);
  await saveTokens(userId, tokenData);
  return tokenData.access_token;
}

module.exports = {
  connectWithAuthorizationCode,
  createOAuthState,
  resolveOAuthState,
  getValidAccessToken,
  isConnected,
  disconnect,
  requireEnv,
};
