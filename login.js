"use strict";

// Se já tiver sessão válida, nem mostra o formulário — manda direto pro
// destino certo (admin ou calculadora).
(async function redirectIfAlreadyLoggedIn() {
  try {
    const resp = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (resp.ok) {
      const session = await resp.json();
      window.location.replace(session.role === "admin" ? "admin.html" : "index.html");
    }
  } catch {
    // segue pro formulário normalmente se a checagem falhar
  }
})();

const form = document.getElementById("login-form");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("login-submit");
const submitBtnDefaultText = submitBtn.textContent;

const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const passwordSlash = document.getElementById("passwordSlash");

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  passwordSlash.hidden = isHidden;
  togglePasswordBtn.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
});

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.closest(".field").classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(id) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.closest(".field").classList.remove("has-error");
  input.removeAttribute("aria-invalid");
  error.textContent = "";
  error.hidden = true;
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldError("email");
  clearFieldError("password");
  clearFormError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  let hasError = false;
  if (!email) {
    setFieldError("email", "Informe seu e-mail.");
    hasError = true;
  }
  if (!password) {
    setFieldError("password", "Informe sua senha.");
    hasError = true;
  }
  if (hasError) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando...";

  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      formError.textContent = data.error || "Não foi possível entrar.";
      formError.hidden = false;
      return;
    }

    window.location.replace(data.role === "admin" ? "admin.html" : "index.html");
  } catch {
    formError.textContent = "Erro de conexão. Tente novamente.";
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultText;
  }
});
