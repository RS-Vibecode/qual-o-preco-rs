// Login (admin ou cliente). Ver lib/auth.js para o fluxo completo.
const {
  signInWithPassword,
  fetchProfileById,
  createSession,
  sessionCookieHeader,
  registerLoginAttempt,
  clearLoginAttempts,
  LOGIN_ATTEMPT_LIMIT,
} = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  // Exige JSON — bloqueia um POST vindo de um <form> comum em outro site
  // (login CSRF): navegadores só conseguem mandar
  // application/x-www-form-urlencoded, multipart/form-data ou text/plain
  // sem JavaScript, nunca application/json.
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    res.status(415).json({ error: "Content-Type inválido." });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }

  const rateLimitKey = String(email).trim().toLowerCase();

  try {
    // Conta a tentativa ANTES de validar a senha (INCR é atômico — evita a
    // corrida de checar e só depois incrementar, que deixaria passar mais
    // tentativas em paralelo do que o limite permitido).
    const attempts = await registerLoginAttempt(rateLimitKey);
    if (attempts > LOGIN_ATTEMPT_LIMIT) {
      res.status(429).json({ error: "Muitas tentativas de login. Tente novamente em alguns minutos." });
      return;
    }

    const user = await signInWithPassword(email, password);
    if (!user) {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }

    const profile = await fetchProfileById(user.id);
    if (!profile) {
      res.status(500).json({ error: "Conta autenticada, mas sem perfil associado. Fale com o administrador." });
      return;
    }

    await clearLoginAttempts(rateLimitKey);
    const sid = await createSession(profile);
    res.setHeader("Set-Cookie", sessionCookieHeader(sid));
    res.status(200).json({ email: profile.email, fullName: profile.full_name, role: profile.role });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: "Erro interno. Tente novamente em instantes." });
  }
};
