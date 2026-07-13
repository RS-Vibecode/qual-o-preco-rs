// Limitador de taxa genérico por IP, pra rotas públicas (sem login) que
// fazem proxy pra APIs de terceiros — sem isso, qualquer visitante pode
// martelar a rota em volume alto, gerando custo/instabilidade pro nosso
// serviço e risco de bloqueio do nosso IP pela API de terceiro.
const { redis } = require("./redis");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/** Devolve true se AINDA está dentro do limite (ação permitida). */
async function checkIpRateLimit(req, bucket, limit, windowSeconds) {
  const ip = getClientIp(req);
  const key = `rate_limit:${bucket}:${ip}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) await redis.expire(key, windowSeconds);
  return attempts <= limit;
}

module.exports = { checkIpRateLimit };
