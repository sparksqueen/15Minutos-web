"use strict";

window.GameMobile = function setupMobile(viewport, { interact, carry, skip, start }) {
  const stage = viewport.querySelector("#stage");
  const controls = viewport.querySelector("#touch-controls");
  const stick = viewport.querySelector("#touch-stick");
  const carryButton = viewport.querySelector("#touch-carry");
  const interactButton = viewport.querySelector("#touch-interact");
  const skipButton = viewport.querySelector("#touch-skip");
  const rotateScreen = viewport.querySelector("#rotate-screen");
  const runMessage = viewport.querySelector("#mobile-run-message");
  const runButton = viewport.querySelector("#mobile-run");
  const fullscreenButton = viewport.querySelector("#fullscreen-button");
  const fullscreenHelp = viewport.querySelector("#fullscreen-help");
  const coarse = window.matchMedia("(pointer: coarse)");
  const portrait = window.matchMedia("(orientation: portrait)");
  const standalone = window.matchMedia("(display-mode: standalone)");
  const movement = { x: 0, y: 0 };
  let active = coarse.matches;
  let joystickPointer = null;
  let fullscreenHintTimer;
  let layoutDirty = true;
  let currentScreen;
  let startRequested = false;
  let fullscreenFailed = false;

  function invalidateLayout() {
    layoutDirty = true;
  }

  function reset() {
    if (joystickPointer === null) return;
    const pointer = joystickPointer;
    joystickPointer = null;
    if (stick.hasPointerCapture(pointer)) stick.releasePointerCapture(pointer);
    movement.x = movement.y = 0;
    stick.style.setProperty("--stick-x", "0px");
    stick.style.setProperty("--stick-y", "0px");
  }

  function moveStick(event) {
    if (event.pointerId !== joystickPointer) return;
    const { left, top, width, height } = stick.getBoundingClientRect();
    const radius = Math.min(width, height) * .32;
    if (!radius) return;
    const dx = event.clientX - left - width / 2;
    const dy = event.clientY - top - height / 2;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, radius);
    const strength = Math.max(0, (travel / radius - .16) / .84);
    const directionX = distance ? dx / distance : 0;
    const directionY = distance ? dy / distance : 0;
    movement.x = directionX * strength;
    movement.y = -directionY * strength;
    stick.style.setProperty("--stick-x", `${directionX * travel}px`);
    stick.style.setProperty("--stick-y", `${directionY * travel}px`);
  }

  stick.addEventListener("pointerdown", event => {
    if (controls.hidden || joystickPointer !== null || event.button !== 0) return;
    event.preventDefault();
    joystickPointer = event.pointerId;
    stick.setPointerCapture(joystickPointer);
    moveStick(event);
  });
  stick.addEventListener("pointermove", moveStick);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    stick.addEventListener(type, event => {
      if (event.pointerId === joystickPointer) reset();
    });
  }
  viewport.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch") active = true;
    else if (event.pointerType === "mouse" && !coarse.matches && joystickPointer === null) active = false;
  }, true);
  coarse.addEventListener("change", event => {
    active = event.matches;
    if (!active) reset();
  });
  portrait.addEventListener("change", reset);
  function bindTouchAction(button, action) {
    let lastTouch = -Infinity;
    // A second finger must work even while the primary pointer is driving the stick.
    button.addEventListener("pointerup", event => {
      if (event.pointerType !== "touch") return;
      lastTouch = event.timeStamp;
      const { left, right, top, bottom } = button.getBoundingClientRect();
      if (event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom) action();
    });
    button.addEventListener("click", event => {
      const syntheticTouch = event.pointerType === "touch" ||
        (!event.pointerType && event.timeStamp - lastTouch < 700);
      if (!syntheticTouch || event.detail === 0) action();
    });
  }

  bindTouchAction(carryButton, carry);
  bindTouchAction(interactButton, interact);
  skipButton.addEventListener("click", skip);

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function appFullscreen() {
    return fullscreenElement() === viewport || standalone.matches || window.navigator?.standalone === true;
  }

  function mobileBlocked() {
    return active && (!appFullscreen() || portrait.matches);
  }

  function refreshFullscreenLabel() {
    invalidateLayout();
    const expanded = Boolean(fullscreenElement());
    const label = expanded ? "Salir de pantalla completa" : "Pantalla completa";
    fullscreenButton.dataset.expanded = String(expanded);
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.title = label;
    fullscreenHelp.hidden = true;
    if (!fullscreenButton.hidden) showFullscreenHint();
  }

  function showFullscreenHint() {
    clearTimeout(fullscreenHintTimer);
    fullscreenButton.classList.remove("screen-idle");
    fullscreenHintTimer = setTimeout(() => fullscreenButton.classList.add("screen-idle"), 4500);
  }

  fullscreenButton.addEventListener("pointerenter", showFullscreenHint);
  async function toggleFullscreen() {
    showFullscreenHint();
    const current = fullscreenElement();
    const change = current
      ? document.exitFullscreen || document.webkitExitFullscreen
      : viewport.requestFullscreen || viewport.webkitRequestFullscreen;
    if (change) {
      try {
        await change.call(current ? document : viewport);
        fullscreenFailed = false;
        refreshFullscreenLabel();
        if (!current && active) {
          try {
            await window.screen?.orientation?.lock?.("landscape");
          } catch {
            // The rotation screen still enforces landscape when a lock isn't available.
          }
        }
        return;
      } catch {
        // Some browsers expose the API but reject fullscreen for page elements.
      }
    }
    fullscreenHelp.textContent = active
      ? "En Safari para iPhone, tocá Compartir → Agregar a inicio → Abrir como app web."
      : "La pantalla completa no está disponible desde este navegador.";
    fullscreenHelp.hidden = mobileBlocked() || !fullscreenHelp.hidden;
    fullscreenFailed = true;
  }

  fullscreenButton.addEventListener("click", toggleFullscreen);
  runButton.addEventListener("click", () => {
    if (appFullscreen()) return;
    startRequested = currentScreen === "title";
    toggleFullscreen();
  });
  document.addEventListener("fullscreenchange", refreshFullscreenLabel);
  document.addEventListener("webkitfullscreenchange", refreshFullscreenLabel);

  function positionFullscreen() {
    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    viewport.style.setProperty("--fullscreen-left", `${Math.max(0, stageRect.left - viewportRect.left)}px`);
    viewport.style.setProperty("--fullscreen-bottom", `${Math.max(0, viewportRect.bottom - stageRect.bottom)}px`);
  }

  function sync({ screen, overlay, cinematic }) {
    currentScreen = screen;
    const blocked = Boolean(screen) && mobileBlocked();
    if (rotateScreen.hidden === blocked) {
      rotateScreen.hidden = !blocked;
      stage.inert = blocked;
    }
    if (blocked) {
      const needsFullscreen = !appFullscreen();
      const message = needsFullscreen
        ? fullscreenFailed ? fullscreenHelp.textContent : "En celular, jugá en pantalla completa."
        : "Girá el celular para jugar en horizontal.";
      if (runMessage.textContent !== message) runMessage.textContent = message;
      const label = screen === "title" ? "Jugar en pantalla completa" : "Volver a pantalla completa";
      if (runButton.textContent !== label) runButton.textContent = label;
      runButton.hidden = !needsFullscreen;
    } else if (startRequested) {
      startRequested = false;
      if (screen === "title") start();
    }
    const showControls = active && !blocked && screen === "playing" && !overlay && !cinematic;
    if (controls.hidden === showControls) controls.hidden = !showControls;
    if (!showControls) reset();
    const showSkip = active && !blocked && Boolean(cinematic) && !overlay;
    skipButton.hidden = !showSkip;
    viewport.classList.toggle("touch-ui", active);
    const hideFullscreen = !screen || blocked || (appFullscreen() && !fullscreenElement());
    if (fullscreenButton.hidden !== hideFullscreen) {
      fullscreenButton.hidden = hideFullscreen;
      if (hideFullscreen) {
        clearTimeout(fullscreenHintTimer);
        fullscreenHelp.hidden = true;
      } else {
        refreshFullscreenLabel();
      }
    }
    if (!hideFullscreen && layoutDirty) {
      positionFullscreen();
      layoutDirty = false;
    }
  }

  function setLabels(interaction, carrying) {
    if (interactButton.textContent !== interaction) interactButton.textContent = interaction;
    if (carryButton.textContent !== carrying) carryButton.textContent = carrying;
  }

  return {
    movement, reset, sync, setLabels, invalidateLayout, fullscreenControl: fullscreenButton,
    get active() { return active; },
    get blocked() { return mobileBlocked(); },
  };
};
