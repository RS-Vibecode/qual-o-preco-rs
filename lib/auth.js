// Sistema de login (admin + clientes).
//
// Mesma filosofia de lib/ml.js: nada de SDK de terceiro rodando no
// navegador. O GoTrue (API de autenticação do Supabase) só é chamado UMA
// VEZ, pelo servidor, pra validar e-mail/senha — depois disso a
// ferramenta emite sua PRÓPRIA sessão (um UUID aleatório guardado no
// Redis, igual ao token do ML), num cookie HttpOnly/Secure/SameSite. O
// token do Supabase nunca é guardado nem reutilizado: não há
// autocadastro nem "esqueci minha senha" nesta v1, então não existe
// nenhum outro motivo pra voltar a falar com o GoTrue depois do login.
//
// Só o admin cria contas de cliente, usando a Admin API do Supabase
// (service_role key) — não existe cadastro público em nenhuma rota.

const crypto = require("crypto");
const { redis } = require("./redis");
const { requireEnv } = require("./env");

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const SESSION_COOKIE_NAME = "sid";
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60; // 15 min

function supabaseAdminHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Valida e-mail/senha contra o Supabase (GoTrue). Devolve o usuário do
 * Supabase (id, email) em caso de sucesso, ou null se a senha/e-mail
 * estiverem errados.
 */
async function signInWithPassword(email, password) {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.user || null;
}

async function fetchProfileById(id) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(
    `${url}/rest/v1/profiles?id=eq.${id}&select=id,email,full_name,role,phone,position,photo_url`,
    { headers: supabaseAdminHeaders() }
  );
  const rows = await resp.json();
  return rows[0] || null;
}

/** Atualiza campos do próprio perfil (nome, cargo, telefone, foto). */
async function updateProfileRow(userId, fields) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...supabaseAdminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(fields),
  });
  const rows = await resp.json();
  if (!resp.ok) {
    const err = new Error(rows.message || "Falha ao atualizar perfil.");
    err.status = resp.status;
    throw err;
  }
  return rows[0];
}

/** Troca o e-mail de login do próprio usuário (Admin API — sem fluxo de verificação). */
async function updateSupabaseUserEmail(userId, email) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: supabaseAdminHeaders(),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.msg || data.error_description || "Falha ao atualizar e-mail.");
    err.status = resp.status;
    throw err;
  }
  return data;
}

/** Remove a conta do Supabase Auth — o gatilho de FK (ON DELETE CASCADE) apaga a linha em "profiles" junto. */
async function deleteSupabaseUser(userId) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: supabaseAdminHeaders(),
  });
  if (!resp.ok && resp.status !== 404) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(data.msg || data.error_description || "Falha ao remover usuário.");
    err.status = resp.status;
    throw err;
  }
}

/** Define uma nova senha pra um usuário (Admin API — sem exigir a senha antiga, o admin está vouching). */
async function updateSupabaseUserPassword(userId, newPassword) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: supabaseAdminHeaders(),
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.msg || data.error_description || "Falha ao redefinir senha.");
    err.status = resp.status;
    throw err;
  }
  return data;
}

/** Envia a foto de perfil pro bucket "avatars" (Supabase Storage) e devolve a URL pública. */
async function uploadAvatar(userId, base64Data, contentType) {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;

  const resp = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: Buffer.from(base64Data, "base64"),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(data.message || "Falha ao enviar a foto.");
    err.status = resp.status;
    throw err;
  }
  return `${url}/storage/v1/object/public/avatars/${path}`;
}

/** Atualiza a sessão em cache no Redis depois de uma edição de perfil. */
async function refreshSession(sid, patch) {
  if (!sid) return null;
  const current = await redis.get(`session:${sid}`);
  if (!current) return null;
  const updated = { ...current, ...patch };
  await redis.set(`session:${sid}`, updated, { ex: SESSION_TTL_SECONDS });
  return updated;
}

async function listProfiles() {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(
    `${url}/rest/v1/profiles?select=id,email,full_name,role,created_at&order=created_at.desc`,
    { headers: supabaseAdminHeaders() }
  );
  return resp.json();
}

/**
 * Cria a conta no Supabase Auth (email_confirm:true — o admin está
 * vouching pelo cliente, não há fluxo de verificação por e-mail). O
 * gatilho on_auth_user_created (ver README) cria a linha em "profiles"
 * automaticamente, já com full_name/role vindos de user_metadata.
 */
async function createSupabaseUser({ email, password, fullName, role }) {
  const url = requireEnv("SUPABASE_URL");
  const resp = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: supabaseAdminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.msg || data.error_description || data.error || "Falha ao criar usuário no Supabase.");
    err.status = resp.status;
    throw err;
  }
  return data;
}

/**
 * Senha aleatória de 16 caracteres, sem 0/O/1/l pra evitar confusão ao
 * digitar. Descarta bytes fora do maior múltiplo do alfabeto (rejection
 * sampling) — sem isso, `byte % 61` favoreceria levemente os primeiros
 * caracteres do alfabeto (256 não é múltiplo de 61).
 */
function generateStrongPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  const maxUnbiased = 256 - (256 % chars.length);
  const result = [];
  while (result.length < 16) {
    const bytes = crypto.randomBytes(16);
    for (const b of bytes) {
      if (b >= maxUnbiased) continue;
      result.push(chars[b % chars.length]);
      if (result.length === 16) break;
    }
  }
  return result.join("");
}

async function createSession(profile) {
  const sid = crypto.randomUUID();
  await redis.set(
    `session:${sid}`,
    {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    },
    { ex: SESSION_TTL_SECONDS }
  );
  return sid;
}

async function destroySession(sid) {
  if (!sid) return;
  await redis.del(`session:${sid}`);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((pair) => {
    const trimmed = pair.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    cookies[decodeURIComponent(trimmed.slice(0, idx))] = decodeURIComponent(trimmed.slice(idx + 1));
  });
  return cookies;
}

/** Secure só em produção — sem isso o cookie não seta em `vercel dev` local (http). */
function sessionCookieHeader(sid, { clear = false } = {}) {
  const isProd = process.env.VERCEL_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${clear ? "" : sid}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    clear ? "Max-Age=0" : `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

async function getSessionFromRequest(req) {
  const { [SESSION_COOKIE_NAME]: sid } = parseCookies(req);
  if (!sid) return null;
  return redis.get(`session:${sid}`);
}

async function requireAdmin(req) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    const err = new Error("Sessão não encontrada. Faça login novamente.");
    err.status = 401;
    throw err;
  }
  if (session.role !== "admin") {
    const err = new Error("Só administradores podem fazer isso.");
    err.status = 403;
    throw err;
  }
  return session;
}

// Limite de tentativas de login — protege a única rota do site que aceita
// senha vinda de qualquer visitante contra força bruta. INCR é atômico no
// Redis: registra e já devolve a contagem nova em uma única operação, sem
// a janela de corrida de um GET seguido de um INCR separado (que deixaria
// passar mais tentativas em paralelo do que o limite).
async function registerLoginAttempt(key) {
  const attemptsKey = `login_attempts:${key}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, LOGIN_ATTEMPT_WINDOW_SECONDS);
  return attempts;
}

async function clearLoginAttempts(key) {
  await redis.del(`login_attempts:${key}`);
}

module.exports = {
  signInWithPassword,
  fetchProfileById,
  listProfiles,
  createSupabaseUser,
  updateProfileRow,
  updateSupabaseUserEmail,
  deleteSupabaseUser,
  updateSupabaseUserPassword,
  uploadAvatar,
  refreshSession,
  generateStrongPassword,
  createSession,
  destroySession,
  parseCookies,
  sessionCookieHeader,
  getSessionFromRequest,
  requireAdmin,
  registerLoginAttempt,
  clearLoginAttempts,
  LOGIN_ATTEMPT_LIMIT,
};
