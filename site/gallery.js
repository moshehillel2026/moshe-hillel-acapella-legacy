"use strict";

const gallery = document.querySelector(".portrait-gallery");
const stage = gallery.querySelector(".portrait-stage");
const slides = Array.from(stage.querySelectorAll(".portrait-slide"));
const controls = gallery.querySelector(".portrait-controls");
const dots = gallery.querySelector(".portrait-dots");
const previous = stage.querySelector(".portrait-prev");
const next = stage.querySelector(".portrait-next");
const openPortrait = stage.querySelector(".portrait-open");
const rotation = gallery.querySelector(".portrait-rotation");
const announcement = gallery.querySelector(".portrait-announcement");
const dialog = document.querySelector(".portrait-dialog");
const enlarged = dialog.querySelector("img");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let current = 0;
let requested = 0;
let rotating = !reducedMotion.matches;
let timer;
let touchStart;


function wrap(index) {
  return (index + slides.length) % slides.length;
}

function imageFor(index) {
  const image = slides[index].querySelector("img");
  if (!image.hasAttribute("src")) image.src = image.dataset.src;
  return image;
}

function scheduleRotation() {
  window.clearTimeout(timer);
  if (rotating && !document.hidden && !dialog.open) {
    timer = window.setTimeout(() => selectPortrait(current + 1, false), 4000);
  }
}

function setRotation(enabled) {
  rotating = enabled;
  const label = enabled ? "עצירת החלפה אוטומטית" : "הפעלת החלפה אוטומטית";
  rotation.setAttribute("aria-label", label);
  rotation.title = label;
  rotation.firstElementChild.textContent = enabled ? "Ⅱ" : "▶";
  scheduleRotation();
}

const markers = slides.map((slide, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "portrait-dot";
  button.setAttribute("aria-label", `תמונה ${index + 1} מתוך ${slides.length}: ${slide.querySelector("img").alt}`);
  button.addEventListener("click", () => selectPortrait(index));
  dots.append(button);
  return button;
});
markers[0].setAttribute("aria-current", "true");

async function selectPortrait(index, announce = true) {
  const target = wrap(index);
  const request = ++requested;
  window.clearTimeout(timer);
  try {
    const image = imageFor(target);
    await image.decode();
    if (request !== requested || dialog.open) return;
    if (!announce && (!rotating || document.hidden)) return;

    slides[current].classList.remove("is-current");
    slides[current].setAttribute("aria-hidden", "true");
    markers[current].removeAttribute("aria-current");
    current = target;
    slides[current].classList.add("is-current");
    slides[current].removeAttribute("aria-hidden");
    markers[current].setAttribute("aria-current", "true");
    if (announce) announcement.textContent = `${image.alt}, תמונה ${current + 1} מתוך ${slides.length}`;
    imageFor(wrap(current + 1));
  } catch {
    if (announce) announcement.textContent = "לא ניתן לטעון את התמונה. אפשר לבחור תמונה אחרת.";
  } finally {
    if (request === requested) scheduleRotation();
  }
}

previous.addEventListener("click", () => selectPortrait(current - 1));
next.addEventListener("click", () => selectPortrait(current + 1));
rotation.addEventListener("click", () => setRotation(!rotating));
gallery.addEventListener("focusin", event => {
  if (rotating && event.target.matches(":focus-visible")) setRotation(false);
});
gallery.addEventListener("keydown", event => {
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    selectPortrait(current + (event.key === "ArrowLeft" ? 1 : -1));
  }
});
reducedMotion.addEventListener("change", event => {
  if (event.matches) setRotation(false);
});
document.addEventListener("visibilitychange", scheduleRotation);

stage.addEventListener("pointerdown", event => {
  if (event.pointerType === "touch" && event.target === openPortrait) {
    touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
});
stage.addEventListener("pointerup", event => {
  if (touchStart?.id !== event.pointerId) return;
  const x = event.clientX - touchStart.x;
  const y = event.clientY - touchStart.y;
  touchStart = undefined;
  if (Math.abs(x) > 42 && Math.abs(x) > Math.abs(y) * 1.3) {
    selectPortrait(current + (x > 0 ? 1 : -1));
  } else if (Math.hypot(x, y) < 12) {
    showPortrait();
  }
});
stage.addEventListener("pointercancel", () => { touchStart = undefined; });

function showPortrait() {
  if (dialog.open) return;
  const image = imageFor(current);
  enlarged.src = image.currentSrc || image.src;
  enlarged.alt = image.alt;
  dialog.showModal();
  scheduleRotation();
}

openPortrait.addEventListener("click", event => {
  if (event.pointerType !== "touch") showPortrait();
});
dialog.addEventListener("close", scheduleRotation);

for (const control of [controls, openPortrait, previous, next]) control.hidden = false;
imageFor(1);
setRotation(rotating);
