// Qualquer usuário logado edita o PRÓPRIO perfil (nome, cargo, telefone,
// e-mail, foto) — nunca o de outra pessoa (isso é o painel admin).
const {
  getSessionFromRequest,
  parseCookies,
  updateProfileRow,
  updateSupabaseUserEmail,
  uploadAvatar,
  refreshSession,
} = require("../../lib/auth");

const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB — mesmo limite do bucket "avatars"
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

module.exports = async (req, res) => {
  if (req.method !== "PATCH") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Sessão não encontrada. Faça login novamente." });
    return;
  }

  const { fullName, phone, position, email, photoBase64, photoContentType, removePhoto } = req.body || {};

  try {
    const fields = {};
    if (fullName !== undefined) fields.full_name = fullName;
    if (phone !== undefined) fields.phone = phone;
    if (position !== undefined) fields.position = position;

    if (photoBase64) {
      if (!ALLOWED_PHOTO_TYPES.includes(photoContentType)) {
        res.status(400).json({ error: "Formato de imagem não suportado (use JPG, PNG ou WebP)." });
        return;
      }
      const estimatedBytes = Math.ceil((photoBase64.length * 3) / 4);
      if (estimatedBytes > MAX_PHOTO_BYTES) {
        res.status(400).json({ error: "Foto muito grande (máximo 3MB)." });
        return;
      }
      fields.photo_url = await uploadAvatar(session.userId, photoBase64, photoContentType);
    } else if (removePhoto) {
      fields.photo_url = null;
    }

    if (email && email !== session.email) {
      await updateSupabaseUserEmail(session.userId, email);
      fields.email = email;
    }

    const updated = Object.keys(fields).length ? await updateProfileRow(session.userId, fields) : null;

    const { sid } = parseCookies(req);
    await refreshSession(sid, {
      fullName: updated?.full_name ?? session.fullName,
      email: updated?.email ?? session.email,
    });

    res.status(200).json({
      fullName: updated?.full_name ?? session.fullName,
      email: updated?.email ?? session.email,
      phone: updated?.phone ?? null,
      position: updated?.position ?? null,
      photoUrl: updated?.photo_url ?? null,
      role: session.role,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
