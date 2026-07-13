const { parseCookies, destroySession, sessionCookieHeader } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const { sid } = parseCookies(req);
  if (!sid) {
    res.status(200).json({ ok: true });
    return;
  }

  await destroySession(sid);
  res.setHeader("Set-Cookie", sessionCookieHeader(null, { clear: true }));
  res.status(200).json({ ok: true });
};
