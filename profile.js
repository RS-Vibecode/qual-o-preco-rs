"use strict";

const form = document.getElementById("profile-form");
const submitBtn = document.getElementById("profile-submit");
const submitBtnDefaultText = submitBtn.textContent;
const formError = document.getElementById("form-error");
const successMsg = document.getElementById("successMsg");
const photoInput = document.getElementById("photoInput");
const photoImg = document.getElementById("photoPreviewImg");
const photoInitial = document.getElementById("photoPreviewInitial");
const removePhotoBtn = document.getElementById("removePhotoBtn");

let pendingPhoto = null; // { base64, contentType }
let pendingRemovePhoto = false;
let currentName = "";

function setPhotoPreview(url, name) {
  if (url) {
    photoImg.src = url;
    photoImg.hidden = false;
    photoInitial.hidden = true;
  } else {
    photoImg.hidden = true;
    photoInitial.hidden = false;
    photoInitial.textContent = (name || "?").trim().charAt(0).toUpperCase();
  }
}

async function loadProfile() {
  const resp = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!resp.ok) return;
  const data = await resp.json();
  document.getElementById("fullName").value = data.fullName || "";
  document.getElementById("position").value = data.position || "";
  document.getElementById("phone").value = data.phone || "";
  document.getElementById("email").value = data.email || "";
  currentName = data.fullName || data.email || "";
  setPhotoPreview(data.photoUrl, currentName);
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    formError.textContent = "Foto muito grande (máximo 3MB).";
    formError.hidden = false;
    photoInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = String(reader.result).split(",")[1];
    pendingPhoto = { base64, contentType: file.type };
    pendingRemovePhoto = false;
    setPhotoPreview(reader.result, "");
  };
  reader.readAsDataURL(file);
});

removePhotoBtn.addEventListener("click", () => {
  pendingPhoto = null;
  pendingRemovePhoto = true;
  photoInput.value = "";
  setPhotoPreview(null, currentName);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  successMsg.hidden = true;

  const body = {
    fullName: document.getElementById("fullName").value.trim(),
    position: document.getElementById("position").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
  };
  if (pendingPhoto) {
    body.photoBase64 = pendingPhoto.base64;
    body.photoContentType = pendingPhoto.contentType;
  } else if (pendingRemovePhoto) {
    body.removePhoto = true;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const resp = await fetch("/api/profile/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (!resp.ok) {
      formError.textContent = data.error || "Não foi possível salvar.";
      formError.hidden = false;
      return;
    }

    pendingPhoto = null;
    pendingRemovePhoto = false;
    currentName = data.fullName || currentName;
    successMsg.hidden = false;
    setPhotoPreview(data.photoUrl, currentName);
  } catch {
    formError.textContent = "Erro de conexão. Tente novamente.";
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultText;
  }
});

loadProfile();
