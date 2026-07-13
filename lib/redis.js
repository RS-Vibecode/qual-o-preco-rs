// Cliente Redis (Upstash) compartilhado por lib/ml.js (token do Mercado
// Livre) e lib/auth.js (sessão de login). Redis.fromEnv() lê
// KV_REST_API_URL/KV_REST_API_TOKEN (variáveis da integração Upstash da
// Vercel) automaticamente.
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

module.exports = { redis };
