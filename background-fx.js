"use strict";

/* ---------------------------------------------------------
   Decoração de fundo compartilhada por todas as páginas
   (estrelas, cometas, revelação suave ao rolar). Extraído de
   script.js pra ser reaproveitado em login.html e admin.html.
   --------------------------------------------------------- */

const bgFxPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function generateStarfield() {
  const container = document.getElementById("starfield");
  if (!container) return;
  const STAR_COUNT = 40;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement("span");
    star.className = "star";
    const size = 1 + Math.random() * 2;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.setProperty("--dur", `${3 + Math.random() * 4}s`);
    star.style.setProperty("--delay", `${Math.random() * 4}s`);
    fragment.appendChild(star);
  }
  container.appendChild(fragment);
}

generateStarfield();

const COMET_ANGLE_DEG = 22;

function spawnComets(container, count, { minDur = 3, maxDur = 6, maxDelay = 10 } = {}) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement("span");
    wrap.className = "comet-wrap";
    wrap.style.left = `${Math.random() * 70}%`;
    wrap.style.top = `${Math.random() * 60}%`;
    wrap.style.transform = `rotate(${COMET_ANGLE_DEG}deg)`;

    const comet = document.createElement("span");
    comet.className = "comet";
    comet.style.width = `${90 + Math.random() * 70}px`;
    const dur = minDur + Math.random() * (maxDur - minDur);
    comet.style.setProperty("--dur", `${dur}s`);
    comet.style.setProperty("--delay", `${Math.random() * maxDelay}s`);

    wrap.appendChild(comet);
    fragment.appendChild(wrap);
  }
  container.appendChild(fragment);
}

spawnComets(document.getElementById("starfield"), 3, { minDur: 3, maxDur: 5, maxDelay: 8 });

function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (bgFxPrefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((el) => observer.observe(el));
}

initScrollReveal();
