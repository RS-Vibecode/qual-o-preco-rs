// Devolve quem está logado (usado por auth-guard.js em toda página
// protegida, e por profile.js pra pré-preencher o formulário). Busca o
// perfil fresco no Supabase a cada chamada — mais confiável que confiar
// só no cache da sessão depois de uma edição de perfil.
const { getSessionFromRequest, fetchProfileById } = require("../../lib/auth");

module.exports = async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const profile = await fetchProfileById(session.userId);
  if (!profile) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  res.status(200).json({
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    position: profile.position,
    photoUrl: profile.photo_url,
    role: profile.role,
  });
};
