// Redefine a senha de um usuário existente por fora do painel — serve pro
// caso em que o próprio admin fica sem acesso (não dá pra usar o botão
// "Redefinir senha" do admin.html sem estar logado).
//
// Uso: node scripts/reset-password.js email@exemplo.com
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local
// (rode `vercel env pull .env.local` antes, se ainda não tiver).

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const { listProfiles, updateSupabaseUserPassword, generateStrongPassword } = require("../lib/auth");

async function main() {
  const [, , email] = process.argv;
  if (!email) {
    console.error("Uso: node scripts/reset-password.js email@exemplo.com");
    process.exit(1);
  }

  const profiles = await listProfiles();
  const profile = profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());
  if (!profile) {
    console.error("Nenhum usuário encontrado com esse e-mail:", email);
    process.exit(1);
  }

  const password = generateStrongPassword();
  await updateSupabaseUserPassword(profile.id, password);
  console.log("Senha redefinida com sucesso para", email);
  console.log("Nova senha:", password);
}

main().catch((err) => {
  console.error("Erro ao redefinir senha:", err.message);
  process.exit(1);
});
