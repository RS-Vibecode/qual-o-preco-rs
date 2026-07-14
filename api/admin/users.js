// Gestão de usuários (só admin): listar, criar, redefinir senha e remover.
// Um arquivo só, roteado por método HTTP, porque o plano Hobby da Vercel
// limita a 12 Serverless Functions por deployment.
const {
  requireAdmin,
  listProfiles,
  createSupabaseUser,
  updateProfileRow,
  generateStrongPassword,
  deleteSupabaseUser,
  updateSupabaseUserPassword,
} = require("../../lib/auth");
const { disconnect } = require("../../lib/ml");

module.exports = async (req, res) => {
  let session;
  try {
    session = await requireAdmin(req);
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
    return;
  }

  if (req.method === "GET") {
    const profiles = await listProfiles();
    res.status(200).json({
      users: profiles.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        role: p.role,
        createdAt: p.created_at,
      })),
    });
    return;
  }

  if (req.method === "POST") {
    const { email, fullName, role, password } = req.body || {};
    if (!email || !fullName) {
      res.status(400).json({ error: "E-mail e nome completo são obrigatórios." });
      return;
    }
    // Senha escolhida pelo admin no formulário (com um botão de "gerar" só
    // como assistência de UI) — o servidor não inventa uma sozinho, mas
    // ainda valida o tamanho mínimo em caso do formulário ser contornado.
    if (!password || password.length < 8) {
      res.status(400).json({ error: "Informe uma senha com pelo menos 8 caracteres." });
      return;
    }
    const finalRole = role === "admin" ? "admin" : "client";

    try {
      // O gatilho do banco SEMPRE cria a conta como 'client' (não confia em
      // metadata enviada no cadastro — ver scripts/supabase-fix-role-trigger.sql).
      // Promover a admin é uma segunda chamada, só possível com service_role.
      const user = await createSupabaseUser({ email, password, fullName, role: finalRole });
      if (finalRole === "admin") {
        await updateProfileRow(user.id, { role: "admin" });
      }
      res.status(201).json({ id: user.id, email, fullName, role: finalRole, password });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "PATCH") {
    const { id } = req.body || {};
    if (!id) {
      res.status(400).json({ error: "Parâmetro 'id' é obrigatório." });
      return;
    }
    const password = generateStrongPassword();
    try {
      await updateSupabaseUserPassword(id, password);
      res.status(200).json({ ok: true, password });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) {
      res.status(400).json({ error: "Parâmetro 'id' é obrigatório." });
      return;
    }
    if (id === session.userId) {
      res.status(400).json({ error: "Você não pode remover a própria conta." });
      return;
    }
    try {
      await deleteSupabaseUser(id);
      await disconnect(id); // limpa a conexão ML dessa conta, se houver
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: "Método não permitido." });
};
