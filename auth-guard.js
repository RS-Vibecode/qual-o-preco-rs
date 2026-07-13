"use strict";

/* ---------------------------------------------------------
   Guard de autenticação compartilhado por toda página protegida
   (index.html, admin.html). Confere a sessão via /api/auth/me antes de
   revelar o conteúdo (a página começa com <body class="auth-pending">,
   que o CSS esconde até este script confirmar o login — evita mostrar a
   calculadora por um instante antes do redirect).

   Páginas que exigem um papel específico usam
   <body data-require-role="admin">; quem não tem esse papel é mandado
   pra index.html (está logado, só não pode ver aquela página).
   --------------------------------------------------------- */

(function () {
  const body = document.body;
  const requiredRole = body.dataset.requireRole || null;

  function redirectToLogin() {
    window.location.replace("login.html");
  }

  function populateUserChip(session) {
    const chip = document.getElementById("userChip");
    if (!chip) return;
    const nameEl = document.getElementById("userChipName");
    const roleEl = document.getElementById("userChipRole");
    const adminLink = document.getElementById("userChipAdminLink");
    const avatarImg = document.getElementById("userChipAvatarImg");
    const avatarInitial = document.getElementById("userChipAvatarInitial");

    const displayName = session.fullName || session.email;
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = session.role === "admin" ? "Administrador" : "Cliente";
    if (adminLink) adminLink.hidden = session.role !== "admin";

    if (avatarImg && avatarInitial) {
      if (session.photoUrl) {
        avatarImg.src = session.photoUrl;
        avatarImg.hidden = false;
        avatarInitial.hidden = true;
      } else {
        avatarImg.hidden = true;
        avatarInitial.hidden = false;
        avatarInitial.textContent = displayName.trim().charAt(0).toUpperCase();
      }
    }

    chip.hidden = false;
  }

  async function checkAuth() {
    let resp;
    try {
      resp = await fetch("/api/auth/me", { credentials: "same-origin" });
    } catch {
      redirectToLogin();
      return;
    }

    if (resp.status === 401) {
      redirectToLogin();
      return;
    }

    const session = await resp.json();

    if (requiredRole && session.role !== requiredRole) {
      window.location.replace("index.html");
      return;
    }

    populateUserChip(session);
    body.classList.remove("auth-pending");
  }

  checkAuth();

  document.addEventListener("click", (event) => {
    if (event.target && event.target.id === "userChipLogout") {
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
        window.location.replace("login.html");
      });
    }
  });

  // bfcache: o navegador às vezes restaura a página (ex.: botão "voltar")
  // sem rodar este script de novo — força recarregar pra reconferir a
  // sessão (ex.: usuário tinha acabado de deslogar).
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
})();
