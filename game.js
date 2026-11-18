"use strict";

(() => {
  const data = window.FIFTEEN_MINUTES;
  const geo = window.GameGeometry;
  const overlays = window.GameOverlays;
  const width = 1920;
  const height = 1080;
  const viewport = document.querySelector("#viewport");
  const stage = document.querySelector("#stage");
  const canvas = document.querySelector("#world");
  const ui = document.querySelector("#ui");
  const loading = document.querySelector("#loading");
  const context = canvas.getContext("2d", { alpha: false });
  const images = new Map();
  const keys = new Set();
  const music = new Audio(data.music.file);
  const brush = new Audio(data.brush);
  const playerBox = geo.colliderPaths(data.player)[0].bounds;
  // A pair of colliders has a per-shape contact offset of .01 world units.
  const interactionReach = .02;
  const pickupReach = .76;
  const zoneReferencePoints = [null, [.5, .5], [0, 0], [1, 0], [0, 1], [1, 1], [.5, 0], [.5, 1], [0, .5], [1, .5]];
  const sounds = { brush };
  const mobile = window.GameMobile(viewport, { interact: useInteraction, carry: tapCarry, skip: requestIntroSkip, start: showLevels });
  let state;
  let loadId = 0;
  let lastTime = performance.now();
  let musicTime = 0;
  let scaleX = 1;
  let scaleY = 1;
  let volume = readVolume();
  const demo = new URLSearchParams(location.search).has("demo");
  let largeText = savedFlag("LargeText");
  let toggleCarry = savedFlag("ToggleCarry");
  let colorblind = savedFlag("Colorblind");
  let readable = savedFlag("ReadableFont");
  let navigationTutorialSeen = savedFlag("NavigationTutorialSeen");
  brush.volume = readVolume("EffectsVolume");
  stage.classList.toggle("large-ui", largeText);
  stage.classList.toggle("colorblind-ui", colorblind);
  stage.classList.toggle("readable-ui", readable);

  function savedFlag(key, value) {
    try {
      if (value !== undefined) localStorage.setItem(key, value ? "1" : "0");
      return localStorage.getItem(key) === "1";
    } catch { return false; }
  }
  music.loop = data.music.loop;
  music.preservesPitch = false;
  music.volume = volume;
  music.preload = "auto";

  function readVolume(key = "MusicVolume") {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null && Number.isFinite(Number(stored))) return Math.max(0, Math.min(1, Number(stored)));
    } catch {}
    return 1;
  }

  function setVolume(value) {
    music.volume = volume = Number(value);
    try { localStorage.setItem("MusicVolume", String(volume)); } catch {}
  }

  function playMusic() {
    if (music.paused) music.play().catch(() => {});
  }

  function resetMusic() {
    musicTime = 0;
    music.currentTime = 0;
    music.playbackRate = data.music.normal;
  }

  function playSound(name) {
    const sound = sounds[name];
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  function resize() {
    const availableWidth = viewport.clientWidth || innerWidth;
    const availableHeight = viewport.clientHeight || innerHeight;
    const scale = Math.min(availableWidth / width, availableHeight / height);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(availableWidth - width * scale) / 2}px`;
    stage.style.top = `${(availableHeight - height * scale) / 2}px`;
    stage.style.setProperty("--cinematic-width", `${availableWidth / scale}px`);
    stage.style.setProperty("--cinematic-height", `${availableHeight / scale}px`);
    stage.style.setProperty("--stage-scale", scale);
    mobile.invalidateLayout();
    const pixels = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * scale * pixels));
    canvas.height = Math.max(1, Math.round(height * scale * pixels));
    scaleX = canvas.width / width;
    scaleY = canvas.height / height;
  }

  function loadImage(key) {
    if (!key) return Promise.resolve(null);
    if (images.has(key)) return images.get(key).promise;
    const image = new Image();
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => { images.delete(key); reject(new Error(data.sprites[key].src)); };
      image.src = data.sprites[key].src;
    });
    images.set(key, { image, promise });
    return promise;
  }

  function assetsForUi(node) {
    return [node.image, ...node.children.flatMap(assetsForUi)].filter(Boolean);
  }

  function preload(keysToLoad) {
    return Promise.all([...new Set(keysToLoad)].filter(Boolean).map(loadImage));
  }

  function rectFor(node, [x, y, w, h]) {
    const childWidth = w * (node.max[0] - node.min[0]) + node.size[0];
    const childHeight = h * (node.max[1] - node.min[1]) + node.size[1];
    const left = x + w * (node.min[0] + (node.max[0] - node.min[0]) * node.pivot[0]) + node.position[0] - childWidth * node.pivot[0];
    const top = y + h * (1 - node.min[1] - (node.max[1] - node.min[1]) * node.pivot[1]) - node.position[1] - childHeight * (1 - node.pivot[1]);
    return [left, top, childWidth, childHeight];
  }

  function color([r, g, b, a]) {
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }

  function setRect(element, [x, y, w, h]) {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${Math.max(w, 0)}px`;
    element.style.height = `${Math.max(h, 0)}px`;
  }

  function buildUi(node, area, container, elements, { root = false, full = false, labelArea } = {}) {
    const rect = labelArea ?? (root && full ? area : rectFor(node, area));
    const element = document.createElement(node.action ? "button" : "div");
    element.className = node.action ? "ui-node ui-button" : "ui-node";
    element.dataset.name = node.name;
    if (node.action) {
      element.type = "button";
      const label = node.children.find(child => child.text)?.text.trim() || node.name;
      element.setAttribute("aria-label", { Exit: "Salir", OpcionesButton: "Opciones", CerrarSlider: "Cerrar opciones" }[node.name] || label);
      element.onclick = event => {
        event.stopPropagation();
        handleAction(node);
      };
    }
    element.hidden = !root && !node.active;
    setRect(element, rect);

    if (node.image) {
      const image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.className = "ui-image";
      image.src = data.sprites[node.image].src;
      const [r, g, b, a] = node.tint;
      image.style.opacity = a;
      if (r === g && g === b && r !== 1) image.style.filter = `brightness(${r})`;
      if (r === 1 && g === 0 && b === 0) image.style.filter = "brightness(0) saturate(100%) invert(17%) sepia(95%) saturate(7407%) hue-rotate(1deg)";
      element.append(image);
    }

    if (node.text !== undefined) {
      const text = document.createElement("span");
      text.className = "ui-text";
      text.textContent = node.text.trim();
      if (labelArea) text.classList.add("ui-button-label");
      const fontSize = labelArea
        ? Math.min(node.font, Math.floor((rect[2] - 28) / text.textContent.length), Math.floor(rect[3] * .65))
        : node.font;
      text.style.fontSize = `${fontSize}px`;
      text.style.color = color(node.color);
      text.style.textAlign = ({ 1: "left", 2: "center", 4: "right" })[node.align] || "center";
      text.style.justifyContent = ({ 256: "flex-start", 512: "center", 1024: "flex-end" })[node.vertical] || "center";
      element.append(text);
    }

    if (node.name === "VolumeSlider") {
      const slider = document.createElement("input");
      slider.className = "volume";
      slider.type = "range";
      slider.min = 0;
      slider.max = 1;
      slider.step = 0.01;
      slider.value = volume;
      slider.setAttribute("aria-label", "Volumen de la música");
      slider.onclick = event => event.stopPropagation();
      slider.oninput = () => setVolume(slider.value);
      element.append(slider);
    } else {
      for (const child of node.children) {
        const labelArea = node.labelArea && child.text
          ? node.labelArea.map((value, i) => value * rect[2 + i % 2])
          : undefined;
        buildUi(child, [0, 0, rect[2], rect[3]], element, elements, { labelArea });
      }
    }

    container.append(element);
    elements.set(node.id, element);
    return element;
  }

  function surface(node, { full = false } = {}) {
    const elements = new Map();
    const element = buildUi(node, [0, 0, width, height], ui, elements, { root: true, full });
    return { element, elements };
  }

  function handleAction(node) {
    playMusic();
    if (node.action === "ReintentarNivel") return startLevel(state.level.number);
    if (node.action === "OnPlayPressed") return showLevels();
    if (node.action === "OnLevel1Selected" || node.action === "OnLevel2Selected" || node.action === "OnLevel3Selected") {
      return startLevel(Number(node.action[7]));
    }
    if (node.action === "IrAlNivel2" || node.action === "IrAlNivel3") return startLevel(Number(node.action.at(-1)));
    if (node.action === "IrACreditos") return showCredits();
    if (node.action === "ReiniciarJuego" || node.action === "SalirDelJuego") return showTitle();
  }

  function showTitle() {
    loadId++;
    keys.clear();
    resetMusic();
    state = { screen: "title" };
    ui.replaceChildren();
    surface(data.ui.title).element.append(overlays.mainMenu([
      ["Jugar", () => { playMusic(); showLevels(); }],
      ["Ajustes", () => { playMusic(); openSettings(); }],
      ["Créditos", () => { playMusic(); showCredits(); }],
    ]));
  }

  function showLevels() {
    keys.clear();
    state = { screen: "levels" };
    ui.replaceChildren();
    const levelButtons = data.levels.map(level => [
      `Nivel ${level.number} · ${level.name}`,
      () => startLevel(level.number),
    ]);
    surface(data.ui.title);
    openPanel(overlays.levels(levelButtons, showTitle));
  }

  function showCredits() {
    keys.clear();
    musicTime = 0;
    ui.replaceChildren();
    const credits = surface(data.credits, { full: true });
    const creditText = credits.element.querySelector('[data-name="Credits Text"]');
    const lines = creditText.querySelector(".ui-text");
    const start = height * .72;
    creditText.style.top = `${start}px`;
    lines.style.justifyContent = "flex-start";
    const scrollDistance = start + lines.scrollHeight;
    const returnButton = overlays.button("Volver al menú", showTitle, "wood-button credits-back");
    ui.append(returnButton);
    state = { screen: "credits", elapsed: 0, creditText, scrollDistance };
  }

  function createObject(source) {
    return {
      ...source,
      x: source.matrix[4],
      y: source.matrix[5],
      paths: geo.colliderPaths(source),
      completed: false,
      hidden: false,
    };
  }

  function animationFrame(animation, time, loop = false) {
    if (loop && animation.duration > 0) time %= animation.duration;
    for (let i = animation.frames.length - 1; i >= 0; i--) {
      if (animation.frames[i][0] <= time) return animation.frames[i][1];
    }
    return animation.frames[0]?.[1];
  }

  async function startLevel(number, quickStart = false) {
    const level = data.levels.find(item => item.number === number);
    if (!level) return;
    const request = ++loadId;
    keys.clear();
    state = { screen: "loading" };
    loading.textContent = "Cargando…";
    loading.hidden = false;
    ui.replaceChildren();
    const baseAssets = level.objects.flatMap(object => [object.sprite, object.cleanSprite]);
    const animationAssets = Object.values(data.player.animations).flatMap(animation => animation.frames.map(([, key]) => key));
    const introFrames = level.intro.animation.frames;
    try {
      await preload([...baseAssets, ...animationAssets, data.player.sprite, ...introFrames.slice(0, 8).map(([, key]) => key),
        ...assetsForUi(level.map), ...assetsForUi(level.win), ...assetsForUi(level.lose)]);
    } catch (error) {
      if (request === loadId) {
        console.error(error);
        loading.textContent = "No se pudieron cargar los archivos. Recargá la página.";
      }
      return;
    }
    if (request !== loadId) return;
    loading.hidden = true;
    const objects = level.objects.map(createObject);
    const targets = objects.filter(object => object.tag === "Pickup" || object.tag === "Interactable");
    const zones = objects.filter(object => object.destination);
    const solids = objects.filter(object => object.paths.some(path => !path.trigger));
    const player = createObject(data.player);
    const intro = { ...level.intro };
    [player.x, player.y] = quickStart ? [3.25, -1.65] : level.spawn;
    if (quickStart) intro.duration = 0;
    resetMusic();
    playMusic();
    const prompt = surface({ ...data.ui.prompt, children: [] }).element;
    prompt.classList.add("interaction-prompt");
    const promptRows = Array.from({ length: 2 }, () => {
      const row = document.createElement("div");
      const key = document.createElement("kbd");
      const label = document.createElement("span");
      row.className = "prompt-row";
      row.append(key, label);
      prompt.append(row);
      return { row, key, label };
    });
    prompt.hidden = true;
    const hud = surface({ ...data.ui.hud, children: data.ui.hud.children.filter(node => node.name !== "CaosometroSlider") }).element;
    const meter = document.createElement("div");
    meter.className = "chaos-slot";
    meter.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "chaos-fill";
    const chaosValue = document.createElement("span");
    chaosValue.className = "chaos-value";
    meter.append(fill, chaosValue);
    hud.append(meter);
    const toolbar = document.createElement("div");
    toolbar.className = "hud-tools";
    const buttons = document.createElement("div");
    buttons.className = "hud-tool-icons";
    buttons.append(
      overlays.iconButton("Mapa", "map", () => openMap()),
      overlays.iconButton("Inventario de pendientes", "list", () => openInventory()),
      overlays.iconButton("Ajustes", "gear", openSettings),
    );
    const progress = document.createElement("output");
    progress.className = "hud-progress hud-plaque";
    progress.setAttribute("aria-label", "Objetos pendientes");
    const placement = document.createElement("output");
    placement.className = "placement-feedback hud-plaque";
    placement.hidden = true;
    placement.setAttribute("aria-live", "polite");
    toolbar.append(progress, buttons);
    ui.append(toolbar, placement);
    state = {
      screen: "playing", level, objects, player, intro, targets, zones, solids,
      hud, prompt, promptRows, progress, toolbar, placement, clock: hud.querySelector('[data-name="TimerText"] > .ui-text'),
      fill, chaosValue,
      camera: [player.x, player.y], direction: "idle", animationTime: 0,
      elapsed: 0, left: targets.length, panel: null, held: null, lastDropped: null, events: new Set(),
      tutorial: null, tutorialSeen: false, interactionTutorialSeen: false, carryArmed: false, carrySuspended: false, touchCarry: false,
    };
    updateHud();
    if (intro.duration > 0) {
      const cinematic = document.createElement("div");
      cinematic.className = "cinematic";
      cinematic.setAttribute("role", intro.chat || intro.letter ? "region" : "img");
      cinematic.setAttribute("aria-label", "Cinemática de " + level.name);
      toolbar.inert = true;
      ui.append(cinematic);
      state.cinematic = cinematic;
      if (intro.chat) state.phoneChat = overlays.phoneChat(intro.chat);
      if (intro.letter) {
        state.letter = overlays.cinematicLetter(data.sprites[intro.sprite].src, intro.letter, intro.letterLabel);
        cinematic.classList.add("cinematic-full", "cinematic-letter");
        if (intro.letterStyle) cinematic.dataset.letterStyle = intro.letterStyle;
        cinematic.append(state.letter.element);
      }
      preloadIntroAhead(state);
      renderIntro(state);
      canvas.focus();
    }
  }

  function renderIntro(game) {
    const time = game.elapsed;
    if (game.letter) {
      game.letter.advance(time);
      return;
    }
    const frames = game.intro.animation.frames;
    if (game.phoneChat && time < frames[0][0]) {
      const { phone, advance } = game.phoneChat;
      if (game.cinematic.firstChild !== phone) game.cinematic.replaceChildren(phone);
      advance(time);
      return;
    }
    const ready = frames.findLast(([at, key]) => {
      const image = images.get(key)?.image;
      return at <= time && image?.complete && image.naturalWidth;
    });
    const image = images.get(ready?.[1])?.image;
    if (!image || game.cinematic.firstChild === image) return;
    image.alt = "";
    if (game.intro.closingLine) {
      const line = document.createElement("p");
      line.className = "cinematic-dialogue";
      line.textContent = game.intro.closingLine;
      game.cinematic.classList.add("cinematic-full");
      game.cinematic.replaceChildren(image, line);
    } else {
      game.cinematic.replaceChildren(image);
    }
  }

  function preloadIntroAhead(game) {
    const frames = game.intro.animation.frames;
    const current = animationFrame(game.intro.animation, game.elapsed);
    const frameKeys = new Set([game.intro.sprite, current]);
    for (const [time, key] of frames) {
      if (time >= game.elapsed - 1 && time <= game.elapsed + 5) frameKeys.add(key);
    }
    for (const [, key] of frames) {
      if (!frameKeys.has(key)) images.delete(key);
    }
    preload(frameKeys).catch(error => console.error("No se pudo cargar un fotograma:", error));
  }

  function releaseIntro(game) {
    game.cinematic.remove();
    game.cinematic = null;
    game.phoneChat = null;
    game.letter = null;
    game.toolbar.inert = false;
    for (const [, key] of game.intro.animation.frames) images.delete(key);
    images.delete(game.intro.sprite);
  }

  function updateHud() {
    const seconds = Math.max(0, Math.ceil(data.timer.visible * (data.timer.real - state.elapsed) / data.timer.real));
    const clock = [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
    if (state.clock.textContent !== clock) state.clock.textContent = clock;
    if (state.panelClock && state.panelClock.textContent !== clock) state.panelClock.textContent = clock;
    if (state.progress) {
      const pending = state.left + (state.left === 1 ? " pendiente" : " pendientes");
      if (state.progress.textContent !== pending) state.progress.textContent = pending;
    }
    const amount = state.targets.length ? state.left / state.targets.length : 0;
    state.fill.style.width = `${amount * 100}%`;
    const percent = `${Math.round(amount * 100)}%`;
    if (state.chaosValue.textContent !== percent) state.chaosValue.textContent = percent;
  }

  function touchingTrigger(object) {
    const reach = object.interactionReach ?? interactionReach;
    const [l, b, r, t] = playerBox;
    const box = geo.translate([l - reach, b - reach, r + reach, t + reach], state.player.x, state.player.y);
    return object.paths.some(path => path.trigger && geo.intersection(path, object.x, object.y, box) > 1e-6);
  }

  function solidPaths(object) {
    if (object.hidden || object === state.held || object.looseInPassage || (object.completed && object.tag === "Pickup")) return [];
    return object.paths.filter(path => !path.trigger);
  }

  function movePlayer(dx, dy) {
    const p = state.player;
    const movementBox = state.level.feetBox ?? playerBox;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .04);
    for (let i = 0; i < steps; i++) {
      slidePlayer(dx / steps, 0);
      slidePlayer(0, dy / steps);
    }

    function slidePlayer(x, y) {
      if (!x && !y) return;
      const current = geo.translate(movementBox, p.x, p.y);
      const pushesFor = fraction => {
        const dx = x * fraction;
        const dy = y * fraction;
        const next = geo.translate(current, dx, dy);
        const pushes = [];
        for (const object of state.solids) {
          if (object.walkOver) continue;
          const paths = solidPaths(object);
          const from = object.playerFeetBox
            ? geo.translate(object.playerFeetBox, p.x, p.y)
            : current;
          const to = from === current ? next : geo.translate(from, dx, dy);
          const inWay = paths.some(path =>
            geo.intersection(path, object.x, object.y, to) >
              geo.intersection(path, object.x, object.y, from) + 1e-7);
          if (!inWay) continue;
          // Free rigid bodies can slide ahead of the player through the doorway.
          if (!object.body || object.completed ||
              objectHitsSolid(object, object.x + dx, object.y + dy, true)) return null;
          pushes.push(object);
        }
        return pushes;
      };

      let fraction = 1;
      let pushes = pushesFor(1);
      if (!pushes) {
        let upper = 1;
        fraction = 0;
        for (let i = 0; i < 8; i++) {
          const middle = (fraction + upper) / 2;
          const nextPushes = pushesFor(middle);
          if (nextPushes) {
            fraction = middle;
            pushes = nextPushes;
          } else upper = middle;
        }
      }
      p.x += x * fraction;
      p.y += y * fraction;
      for (const object of pushes ?? []) {
        object.x += x * fraction;
        object.y += y * fraction;
      }
    }
  }

  function complete(object) {
    if (!object.completed) {
      object.completed = true;
      state.left--;
    }
  }

  function canInteract(object) {
    return !object.completed && object !== state.held && object.action !== 3 && touchingTrigger(object);
  }

  function interact() {
    for (const object of state.targets) {
      if (!canInteract(object)) continue;
      complete(object);
      if (object.action === 0 && object.cleanSprite) object.sprite = object.cleanSprite;
      if (object.action === 1 || object.action === 2) object.hidden = true;
      playSound("brush");
    }
    updateHud();
    afterTask();
  }

  function afterTask() {
    if (state.left === 0 && state.targets.length) return showEnd("win");
    if (state.level.number !== 1 || navigationTutorialSeen || state.left === state.targets.length) return;
    navigationTutorialSeen = true;
    savedFlag("NavigationTutorialSeen", true);
    showTutorial(overlays.navigationTutorial({
      pending: state.left,
      onContinue: closeTutorial,
      onInventory: () => { closeTutorial(); openInventory(true); },
      onMap: () => { closeTutorial(); openMap(true); },
    }));
  }

  function inPickupRange(object, x = object.x, y = object.y, reach = pickupReach) {
    const player = state.player;
    return object.paths.some(path => geo.touchesCircle(path, player.x, player.y, x, y, reach));
  }

  function deliveryZone(object) {
    return state.zones.find(zone => zone.name === object.name && zone.paths.some(trigger =>
      trigger.trigger && geo.touchesCircle(trigger, object.x, object.y, zone.x, zone.y, .2)
      && object.paths.some(path => geo.shapesOverlap(path, object.x, object.y, trigger, zone.x, zone.y))));
  }

  function updatePickup() {
    const player = state.player;
    if (state.touchCarry || state.carrySuspended || (toggleCarry ? state.carryArmed : keys.has("KeyG"))) {
      if (!state.held) {
        const canGrab = object => object && object.tag === "Pickup" && !object.completed && inPickupRange(object);
        const object = canGrab(state.lastDropped) ? state.lastDropped : state.targets.find(canGrab);
        if (!object) return;
        state.held = object;
        object.looseInPassage = false;
        state.lastDropped = null;
      }
      state.held.x = player.x + player.holdOffset[0];
      state.held.y = player.y + player.holdOffset[1];
      return;
    }

    const object = state.held;
    if (!object) return;
    state.held = null;
    const zone = deliveryZone(object);
    if (!zone) {
      settleDrop(object);
      state.lastDropped = object;
      return;
    }

    [object.x, object.y] = zone.destination;
    const reference = zoneReferencePoints[zone.referencePoint];
    if (reference && object.sprite) {
      const { size: [w, h], pivot: [px, py] } = data.sprites[object.sprite];
      const [a, b, c, d] = object.matrix;
      const [flipX, flipY] = object.flip;
      const x = (reference[0] - px) * w * (flipX ? -1 : 1);
      const y = (reference[1] - py) * h * (flipY ? -1 : 1);
      object.x -= a * x + c * y;
      object.y -= b * x + d * y;
    }
    object.order = 50;
    object.z = -5;
    complete(object);
    if (state.placement) {
      state.placement.textContent = "✓ Objeto colocado";
      state.placement.hidden = false;
      state.placementUntil = state.elapsed + 1.8;
      playSound("brush");
    }
    updateHud();
    afterTask();
  }

  function objectHitsSolid(object, x, y, moving = false) {
    const paths = object.paths.filter(path => !path.trigger);
    return state.solids.some(other => other !== object && !other.walkOver && solidPaths(other).some(wall =>
      paths.some(path => geo.shapesOverlap(path, x, y, wall, other.x, other.y) &&
        (!moving || !geo.shapesOverlap(path, object.x, object.y, wall, other.x, other.y)))));
  }

  function settleDrop(object) {
    const { x, y } = state.player;
    const clear = (tx, ty) => inPickupRange(object, tx, ty) && !objectHitsSolid(object, tx, ty);
    if (clear(object.x, object.y)) return;
    // Try the other sides of the player's position if the carry point hits a wall.
    for (const radius of [.55, .74, .9]) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-.707, .707], [.707, .707], [-.707, -.707], [.707, -.707]]) {
        const tx = x + radius * dx;
        const ty = y + radius * dy;
        if (clear(tx, ty)) {
          [object.x, object.y] = [tx, ty];
          return;
        }
      }
    }
    // A large item can still be set down and picked back up in a narrow passage.
    [object.x, object.y] = [x, y];
    object.looseInPassage = true;
  }

  function updatePrompt() {
    if (state.held) {
      const correct = Boolean(deliveryZone(state.held));
      if (mobile.active) {
        mobile.setLabels("Interactuar", correct ? "Colocar" : "Soltar");
        setPrompt([]);
        return;
      }
      setPrompt([["G", correct ? "Colocar acá" : toggleCarry ? "Tocá para soltar" : "Soltá para dejarlo"]], correct);
      return;
    }

    const target = state.targets.find(object => !object.completed && object.action !== 3 && touchingTrigger(object));
    const action = target?.action === 0 ? "Limpiar" : "Quitar";
    if (mobile.active) {
      mobile.setLabels(target ? action : "Interactuar", "Agarrar");
      setPrompt([]);
      return;
    }
    const pickup = state.targets.some(object => object.tag === "Pickup" && !object.completed && inPickupRange(object));
    if (target) {
      setPrompt(pickup ? [["Espacio", action], ["G", "Agarrar"]] : [["Espacio", action]]);
    } else {
      setPrompt(pickup ? [["G", "Agarrar"]] : []);
    }
  }

  function setPrompt(rows, correct = false) {
    state.prompt.hidden = rows.length === 0;
    state.prompt.dataset.destination = String(correct);
    state.promptRows.forEach(({ row, key, label }, index) => {
      const entry = rows[index];
      row.hidden = !entry;
      if (entry) {
        if (key.textContent !== entry[0]) key.textContent = entry[0];
        if (label.textContent !== entry[1]) label.textContent = entry[1];
      }
    });
  }

  const itemLabels = {
    Plant: "Maceta", Doll: "Muñeco", Chair: "Silla", Pan: "Sartén", Plunger: "Sopapa",
    Skate: "Patineta", Pillow: "Almohadón", Frame: "Cuadro", MobileCan: "Lata",
    RottenFood: "Comida en mal estado", Food: "Restos de comida", TrashCan: "Tacho",
    Toiletpaper: "Papel higiénico", Rug: "Alfombra", Tissue: "Pañuelo", Oven: "Horno",
    Fridge: "Heladera", Mirror: "Espejo", Sink: "Pileta", Toilet: "Inodoro",
    Window: "Ventana", Poster: "Póster", Shelf: "Estante", WashingMachine: "Lavarropas",
    Bathtub: "Bañera", Sheet: "Sábana", Bottles: "Botellas", Armario: "Armario",
    Stain: "Mancha", Spiderweb: "Telaraña", Vasijavacio: "Vasija", Palette: "Paleta",
    Paint: "Pintura", Decapitado: "Estatua", Bar: "Mostrador",
    Displayroto: "Vitrina rota", Emptydisplay: "Vitrina vacía", Art_Singles_: "Cuadro",
  };

  function notebookEntries() {
    const visibleNames = new Map();
    return [...state.targets].sort((a, b) => {
      const aPlant = a.name.startsWith("Plant");
      const bPlant = b.name.startsWith("Plant");
      return Number(bPlant) - Number(aPlant) || Number(b.tag === "Pickup") - Number(a.tag === "Pickup");
    }).map(object => {
      const key = object.name.replace(/[0-9]+$/, "");
      const stem = key.charAt(0).toUpperCase() + key.slice(1);
      const name = itemLabels[stem] || (/^(Bobby|Tobby)$/.test(stem) ? stem : "Objeto por ordenar");
      const number = (visibleNames.get(name) || 0) + 1;
      visibleNames.set(name, number);
      const clue = ({
        Plant: "Buscá un rincón del patio. Que la maceta estorbe un poco menos, al menos.",
        Plunger: "Revisá el baño.",
        Pan: "La cocina es un buen punto de partida.",
        Pillow: "Volvé a mirar el dormitorio.",
      })[stem] || (object.action === 3 || object.name === "Skate"
        ? "Compará el ambiente con el plano y buscá dónde encaja."
        : mobile.active ? "Acercate y tocá Limpiar o Quitar." : "Acercate y usá Espacio cuando aparezca el aviso.");
      return { name: name + (number > 1 ? " " + number : ""), sprite: data.sprites[object.sprite]?.src,
        completed: object.completed, clue };
    });
  }

  function prepareOverlay() {
    if (state.held && !state.touchCarry && !toggleCarry) state.carrySuspended = true;
    keys.clear();
    mobile.reset();
  }

  function closeTutorial() {
    state.tutorial?.remove();
    state.tutorial = null;
    canvas.focus();
  }

  function showTutorial(tutorial) {
    prepareOverlay();
    state.tutorial = tutorial;
    ui.append(tutorial);
    tutorial.querySelector("button")?.focus();
  }

  function teachInteraction() {
    state.interactionTutorialSeen = true;
    const target = state.targets.find(canInteract);
    const sprite = data.sprites[target?.sprite]?.src;
    showTutorial(overlays.interactionTutorial(sprite, closeTutorial, mobile.active));
  }

  function canPlay() {
    return state?.screen === "playing" && !state.panel && !state.tutorial && !state.cinematic && !mobile.blocked;
  }

  function useInteraction() {
    if (!canPlay()) return;
    if (state.interactionTutorialSeen) interact();
    else teachInteraction();
  }

  function tapCarry() {
    if (!canPlay() || maybeTeachPickup()) return;
    state.touchCarry = !state.held;
    state.carryArmed = false;
    state.carrySuspended = false;
    keys.delete("KeyG");
    updatePickup();
    if (!state.held) state.touchCarry = false;
  }

  function requestIntroSkip() {
    if (state?.cinematic && !state.panel && !mobile.blocked) {
      openPanel(overlays.skipWarning(() => closePanel()));
    }
  }

  function maybeTeachPickup() {
    if (state.tutorialSeen || state.elapsed < state.intro.duration || state.held) return false;
    const { x, y } = state.player;
    const object = state.targets
      .filter(item => item.tag === "Pickup" && !item.completed && inPickupRange(item, item.x, item.y, 1.15))
      .reduce((nearest, item) => !nearest || Math.hypot(item.x - x, item.y - y) < Math.hypot(nearest.x - x, nearest.y - y) ? item : nearest, null);
    if (!object) return false;
    state.tutorialSeen = true;
    showTutorial(overlays.tutorial({
      sprite: data.sprites[object.sprite]?.src,
      hasDestination: state.zones.some(zone => zone.name === object.name),
      toggle: toggleCarry,
      touch: mobile.active,
      onContinue: closeTutorial,
      onMap: () => { closeTutorial(); openMap(); },
    }));
    return true;
  }

  function openPanel(panel, pauseClock = false) {
    state.panelReturnFocus = document.activeElement;
    if (state.screen === "playing") prepareOverlay();
    state.panel = panel;
    state.panelPausesClock = pauseClock;
    ui.append(panel);
    state.panelClock = panel.querySelector(".overlay-clock");
    panel.querySelector("button, input")?.focus();
  }

  function closePanel(restoreFocus = true) {
    state.panel?.remove();
    state.panel = null;
    state.panelClock = null;
    state.panelPausesClock = false;
    if (restoreFocus) {
      const previous = state.panelReturnFocus;
      if (state.screen === "title" && previous?.closest?.("#ui")) previous.focus();
      else canvas.focus();
    }
  }

  function openMap(pauseClock = false) {
    const mapImage = state.level.map.children.find(child => child.image);
    openPanel(overlays.map({
      map: data.sprites[mapImage.image].src,
      level: state.level.name,
      clock: state.clock.textContent,
      onClose: () => closePanel(),
    }), pauseClock);
  }

  function openInventory(pauseClock = false) {
    openPanel(overlays.inventory({
      entries: notebookEntries(),
      clock: state.clock.textContent,
      onClose: () => closePanel(),
    }), pauseClock);
  }

  function openSettings() {
    openPanel(overlays.settings({
      clock: state.clock?.textContent,
      closeLabel: state.screen === "title" ? "Volver al menú" : "Volver al juego",
      music: volume,
      effects: brush.volume,
      colorblind,
      toggle: toggleCarry,
      large: largeText,
      readable,
      touch: mobile.active,
      onMusic: setVolume,
      onEffects: value => {
        brush.volume = value;
        try { localStorage.setItem("EffectsVolume", String(value)); } catch {}
      },
      onColorblind: value => {
        colorblind = value;
        savedFlag("Colorblind", value);
        stage.classList.toggle("colorblind-ui", value);
      },
      onLarge: value => {
        largeText = value;
        savedFlag("LargeText", value);
        stage.classList.toggle("large-ui", value);
      },
      onReadable: value => {
        readable = value;
        savedFlag("ReadableFont", value);
        stage.classList.toggle("readable-ui", value);
      },
      onToggle: value => {
        toggleCarry = value;
        savedFlag("ToggleCarry", value);
        state.carryArmed = value && Boolean(state.held) && !state.touchCarry;
        state.carrySuspended = !value && Boolean(state.held) && !state.touchCarry;
      },
      onClose: () => closePanel(),
      onExit: state.screen === "playing" ? () => {
        closePanel(false);
        openPanel(overlays.confirmExit(() => closePanel(), showTitle));
      } : null,
    }));
  }

  function showEnd(kind) {
    state.screen = kind;
    state.prompt.hidden = true;
    closePanel(false);
    state.toolbar.hidden = true;
    state.placement.hidden = true;
    state.hud.hidden = true;
    const ending = state.level[kind];
    const { element } = surface(ending, { full: true });
    if (ending.dialogue) {
      element.classList.add("illustrated-ending");
      const dialogue = document.createElement("p");
      dialogue.className = "ending-dialogue";
      dialogue.textContent = ending.dialogue;
      element.append(dialogue);
    }
    const actions = document.createElement("nav");
    actions.className = "ending-actions";
    actions.setAttribute("aria-label", "Opciones del final");
    const options = [
      ["Reiniciar nivel", "ReintentarNivel"],
      ["Volver al menú", "SalirDelJuego"],
    ];
    if (state.level.number === 3) options.splice(1, 0, ["Créditos", "IrACreditos"]);
    if (ending.nextLevel) options.push(["Siguiente nivel", `IrAlNivel${ending.nextLevel}`]);
    actions.append(...options.map(([label, action]) => overlays.button(label, () => handleAction({ action }))));
    element.append(actions);
  }

  function update(dt, elapsed) {
    if (state.panelPausesClock) return;
    if (!music.paused && state.screen !== "lose") {
      musicTime += elapsed;
      music.playbackRate = data.music.normal + (data.music.max - data.music.normal) * Math.min(1, musicTime / data.music.duration);
    }
    if (state.screen === "credits") {
      state.elapsed += elapsed;
      const scrollStop = state.scrollDistance;
      const moved = Math.min(scrollStop, state.elapsed * data.creditsTiming.speed);
      state.creditText.style.transform = `translateY(${-moved}px)`;
      if (state.elapsed >= scrollStop / data.creditsTiming.speed + data.creditsTiming.delay) showTitle();
      return;
    }
    if (state.screen !== "playing" || state.tutorial || (state.cinematic && state.panel)) return;
    const previousSecond = Math.floor(state.elapsed);
    state.elapsed += elapsed;
    updateHud();
    const secondsRemaining = data.timer.visible * (1 - state.elapsed / data.timer.real);
    for (const [threshold, event] of [[600, "Llamado del ex"], [300, "Vecina chusma"]]) {
      if (secondsRemaining <= threshold && !state.events.has(event)) {
        state.events.add(event);
        console.debug(event);
      }
    }
    if (state.cinematic) {
      if (state.elapsed < state.intro.duration) {
        if (Math.floor(state.elapsed) !== previousSecond) preloadIntroAhead(state);
        renderIntro(state);
        return;
      }
      releaseIntro(state);
    }
    if (state.elapsed >= data.timer.real) return showEnd("lose");
    if (!state.placement.hidden && state.elapsed >= state.placementUntil) state.placement.hidden = true;

    if (state.panel) return;
    if (state.elapsed >= state.intro.duration) {
      const previousX = state.player.x;
      const previousY = state.player.y;
      const down = (...codes) => Number(codes.some(code => keys.has(code)));
      const x = down("ArrowRight", "KeyD") - down("ArrowLeft", "KeyA") + mobile.movement.x;
      const y = down("ArrowUp", "KeyW") - down("ArrowDown", "KeyS") + mobile.movement.y;
      const speed = state.player.speed * dt / Math.max(1, Math.hypot(x, y));
      movePlayer(x * speed, y * speed);
      if ((state.player.x !== previousX || state.player.y !== previousY) && maybeTeachPickup()) return;
      const direction = y ? (y > 0 ? "up" : "down") : x ? (x > 0 ? "right" : "left") : "idle";
      state.animationTime = direction === state.direction ? state.animationTime + dt : 0;
      state.direction = direction;
    }
    updatePickup();
    if (state.screen !== "playing") return;
    updatePrompt();
    const factor = 1 - (1 - data.camera.smooth) ** (dt * 60);
    state.camera[0] += (state.player.x - state.camera[0]) * factor;
    state.camera[1] += (state.player.y - state.camera[1]) * factor;
  }

  function drawObject(object, spriteKey = object.sprite, highlight = false) {
    if (!spriteKey || object.hidden) return;
    const image = images.get(spriteKey)?.image;
    if (!image?.complete || !image.naturalWidth) return;
    const { size: [w, h], pivot: [px, py], smooth } = data.sprites[spriteKey];
    const [a, b, c, d] = object.matrix;
    const [fx, fy] = object.flip;
    context.save();
    const cleanOffsetY = object.completed ? object.cleanOffsetY ?? 0 : 0;
    context.transform(a, b, c, d, object.x, object.y + cleanOffsetY);
    context.scale(fx ? -1 : 1, fy ? 1 : -1);
    context.globalAlpha = object.alpha;
    context.imageSmoothingEnabled = smooth;
    if (highlight) context.filter = "drop-shadow(2px 0 #fff4ce) drop-shadow(-2px 0 #fff4ce) drop-shadow(0 2px #fff4ce) drop-shadow(0 -2px #fff4ce) drop-shadow(0 0 1px #182738)";
    context.drawImage(image, -px * w, (py - 1) * h, w, h);
    context.restore();
  }

  function draw() {
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (!state?.level) return;
    const zoom = height / (2 * data.camera.size);
    const [x, y] = state.camera;
    context.translate(width / 2 - x * zoom, height / 2 + y * zoom);
    context.scale(zoom, -zoom);
    const { held, player } = state;
    const layers = [...state.objects, player];
    layers.sort((a, b) => Number(!!b.background) - Number(!!a.background) ||
      (a.order || 0) - (b.order || 0) || b.z - a.z);
    const showCues = colorblind && state.screen === "playing" && !state.cinematic;
    for (const object of layers) {
      if (object === player) {
        drawObject(object, animationFrame(object.animations[state.direction], state.animationTime, true));
      } else {
        const highlight = showCues && !object.completed && !object.hidden &&
          (object === held || (!held && (object.tag === "Pickup" ? inPickupRange(object) :
            object.tag === "Interactable" && touchingTrigger(object))));
        drawObject(object, object.sprite, highlight);
      }
    }
  }

  function tick(time) {
    const elapsed = Math.max(0, (time - lastTime) / 1000);
    lastTime = time;
    if (state && !document.hidden && !mobile.blocked) update(Math.min(.04, elapsed), elapsed);
    mobile.sync({
      screen: state?.screen,
      overlay: state?.tutorial || state?.panel,
      cinematic: state?.cinematic,
    });
    draw();
    requestAnimationFrame(tick);
  }

  const gameKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyG"]);
  window.addEventListener("keydown", event => {
    if (mobile.blocked) return;
    if (event.code === "Escape" && ["credits", "levels"].includes(state?.screen)) {
      showTitle();
      return;
    }
    if (state?.tutorial || state?.panel) {
      if (state.tutorial && event.code === "Space" && event.repeat) event.preventDefault();
      if (event.code === "Tab") {
        const modal = state.tutorial || state.panel;
        const controls = [...modal.querySelectorAll("button:not(:disabled), input")].filter(control => control.tabIndex >= 0);
        if (!mobile.fullscreenControl.hidden) controls.push(mobile.fullscreenControl);
        const edge = event.shiftKey ? controls.at(0) : controls.at(-1);
        if (document.activeElement === edge) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
        }
      }
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) state.tutorial ? closeTutorial() : closePanel();
      }
      return;
    }
    if (state?.cinematic) {
      const activatesFullscreen = event.code === "Space" && event.target === mobile.fullscreenControl;
      if (event.code === "Escape" || (gameKeys.has(event.code) && !activatesFullscreen)) event.preventDefault();
      if (event.code === "Escape" && !event.repeat) requestIntroSkip();
      return;
    }
    if (!canPlay() || !gameKeys.has(event.code)) return;
    if (event.code === "Space" && event.target?.tagName === "BUTTON") return;
    event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "KeyG") {
      if (maybeTeachPickup()) return;
      state.touchCarry = false;
      state.carrySuspended = false;
      if (toggleCarry) state.carryArmed = !state.held;
      updatePickup();
    }
    if (event.code === "Space") useInteraction();
  });
  window.addEventListener("keyup", event => {
    keys.delete(event.code);
    if (event.code === "KeyG" && canPlay()) updatePickup();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    mobile.reset();
  });
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    lastTime = performance.now();
    if (document.hidden) {
      keys.clear();
      mobile.reset();
    }
  });
  window.addEventListener("pointerdown", playMusic, { once: true });
  window.addEventListener("keydown", playMusic, { once: true });
  resize();
  requestAnimationFrame(tick);
  viewport.dataset.started = "true";

  preload([...Object.values(data.ui).flatMap(assetsForUi), ...assetsForUi(data.credits)])
    .then(() => {
      if (demo) startLevel(2, true);
      else {
        showTitle();
        loading.hidden = true;
      }
      viewport.setAttribute("aria-busy", "false");
    })
    .catch(error => {
      console.error(error);
      loading.textContent = "No se pudieron cargar los archivos. Recargá la página.";
    });
})();
