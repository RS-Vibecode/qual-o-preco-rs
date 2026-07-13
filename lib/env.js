// Helper compartilhado por lib/ml.js e lib/auth.js.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

module.exports = { requireEnv };
