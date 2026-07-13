// Cria a primeiríssima conta admin. Só existe porque só admin pode criar
// usuário pelo painel — então o primeiro precisa ser criado por fora da
// aplicação. Fica no repositório também como "vidro quebrado" pra criar
// outro admin no futuro sem depender do painel.
//
// Uso: node scripts/create-first-admin.js email@exemplo.com "Nome Completo" "senha"
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

const { createSupabaseUser } = require("../lib/auth");

async function main() {
  const [, , email, fullName, password] = process.argv;
  if (!email || !fullName || !password) {
    console.error('Uso: node scripts/create-first-admin.js email@exemplo.com "Nome Completo" "senha"');
    process.exit(1);
  }

  const user = await createSupabaseUser({ email, password, fullName, role: "admin" });
  console.log("Admin criado com sucesso:", user.id, email);
}

main().catch((err) => {
  console.error("Erro ao criar admin:", err.message);
  process.exit(1);
});
