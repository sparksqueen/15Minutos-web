"use strict";

window.GameOverlays = (() => {
  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  }

  function button(text, action, className = "wood-button") {
    const control = element("button", className, text);
    control.type = "button";
    control.onclick = action;
    return control;
  }

  function mainMenu(entries) {
    const menu = element("nav", "game-menu");
    menu.setAttribute("aria-label", "Menú principal");
    entries.forEach(([label, action]) => {
      menu.append(button(label.toUpperCase(), action, "menu-action"));
    });
    return menu;
  }

  function iconButton(label, icon, action) {
    const control = button("", action, "hud-icon-button");
    control.setAttribute("aria-label", label);
    control.title = label;
    const sprite = element("img");
    sprite.src = "assets/hud-" + icon + ".png";
    sprite.alt = "";
    control.append(sprite);
    return control;
  }

  function frame(title, kind, clock) {
    const backdrop = element("div", "game-overlay");
    const panel = element("section", "wood-panel " + kind);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", title);
    const header = element("header", "wood-header");
    header.append(element("h2", "wood-heading", title));
    if (clock) {
      const time = element("span", "overlay-clock", clock);
      time.setAttribute("aria-label", "Tiempo restante");
      header.append(time);
    }
    panel.append(header);
    backdrop.append(panel);
    return { backdrop, panel };
  }

  function actions(panel, onClose, label = "Volver al juego") {
    const footer = element("footer", "wood-actions");
    footer.append(button(label, onClose));
    panel.append(footer);
    return footer;
  }

  function levels(entries, onClose) {
    const { backdrop, panel } = frame("Niveles", "menu-panel");
    const menu = element("nav", "level-menu light-card");
    menu.setAttribute("aria-label", "Seleccionar nivel");
    entries.forEach(([label, action]) => {
      menu.append(button(label, action, "menu-action"));
    });
    panel.append(menu);
    actions(panel, onClose, "Volver al menú");
    return backdrop;
  }

  function skipWarning(onClose) {
    const { backdrop, panel } = frame("Salto denegado", "skip-warning");
    const message = element("p", "skip-message", "No podés avanzar. Tenés que pasar por este trauma.");
    message.id = "skip-message";
    panel.setAttribute("aria-describedby", message.id);
    panel.append(message);
    actions(panel, onClose, "Bueno, sigo mirando").firstElementChild.classList.add("skip-continue");
    return backdrop;
  }

  function confirmExit(onCancel, onExit) {
    const { backdrop, panel } = frame("Salir de la partida", "skip-warning");
    panel.append(element("p", "skip-message", "Si volvés al menú, se pierde el progreso de esta partida."));
    actions(panel, onExit, "Salir al menú").prepend(button("Seguir jugando", onCancel, "wood-button secondary"));
    return backdrop;
  }

  function phoneChat(messages) {
    const phone = element("div", "scene-phone");
    phone.setAttribute("aria-label", "Chat con Susi Tinder");
    const screen = element("div", "phone-screen");
    const status = element("div", "phone-status");
    status.setAttribute("aria-hidden", "true");
    status.append(element("span", "", "09:45"), element("span", "phone-battery"));
    const header = element("div", "phone-contact");
    const avatar = element("span", "phone-avatar", "♥");
    avatar.setAttribute("aria-hidden", "true");
    header.append(avatar, element("strong", "", "Susi Tinder"));
    const thread = element("div", "phone-thread");
    thread.setAttribute("role", "log");
    thread.setAttribute("aria-label", "Mensajes de la cinemática");
    screen.append(status, header, thread, element("span", "phone-home"));
    phone.append(screen);

    const bubbles = messages.map(({ from, at, text }) => {
      const bubble = element("div", from === "Vos" ? "phone-bubble outgoing" : "phone-bubble");
      bubble.append(element("span", "phone-message-meta", `${from} · ${at}`), element("p", "", text));
      return bubble;
    });
    let visible = 0;
    function advance(time) {
      const count = messages.filter(message => message.time <= time).length;
      if (count === visible) return;
      for (let index = visible; index < count; index++) thread.append(bubbles[index]);
      while (thread.children.length > 3) thread.firstElementChild.remove();
      visible = count;
    }
    return { phone, advance };
  }

  function tutorialPanel(title, lines, sprite, onContinue, onMap) {
    const { backdrop, panel } = frame(title, "tutorial-panel");
    const copy = element("div", "tutorial-copy");
    lines.forEach(line => copy.append(element("p", "", line)));
    const content = element("div", sprite ? "tutorial-content" : "tutorial-content no-sprite");
    if (sprite) {
      const image = element("img", "tutorial-sprite");
      image.src = sprite;
      image.alt = "";
      content.append(image);
    }
    content.append(copy);
    panel.append(content);
    const footer = actions(panel, onContinue, "Entendido");
    if (onMap) footer.prepend(button("Ver mapa", onMap, "wood-button secondary"));
    return backdrop;
  }

  function tutorial({ sprite, hasDestination, onContinue, onMap, toggle }) {
    const instructions = [toggle
      ? "Tocá G para agarrar el objeto. Tocá G otra vez para soltarlo."
      : "Mantené G para agarrar el objeto y soltá la tecla para dejarlo."];
    if (hasDestination) instructions.push("Cuando aparezca «Colocar acá», el objeto queda en su lugar.");
    return tutorialPanel("Mover objetos", instructions, sprite, onContinue, onMap);
  }

  function interactionTutorial(sprite, onContinue) {
    return tutorialPanel("Limpiar y quitar objetos", [
      "Acercate a un objeto hasta que aparezca «Espacio · Limpiar» o «Espacio · Quitar».",
      "Presioná Espacio para hacer esa acción. Cada objeto que resolvés baja el Caosómetro.",
    ], sprite, onContinue);
  }

  function map(config) {
    const { backdrop, panel } = frame("Mapa de " + config.level, "map-panel", config.clock);
    const image = element("img", "notebook-map");
    image.src = config.map;
    image.alt = "Plano de " + config.level;
    const body = element("div", "map-body");
    body.append(image);
    panel.append(body);
    actions(panel, config.onClose);
    return backdrop;
  }

  function inventory(config) {
    const { backdrop, panel } = frame("Pendientes", "inventory-panel", config.clock);
    const list = element("div", "object-list");
    list.setAttribute("aria-label", "Objetos del nivel");
    const details = element("article", "object-details");
    let controls = [];
    const filters = element("div", "inventory-filters");
    filters.setAttribute("role", "tablist");
    filters.setAttribute("aria-label", "Filtrar pendientes");
    const listPanel = element("div", "inventory-list-panel");
    listPanel.setAttribute("role", "tabpanel");
    listPanel.id = "inventory-list-panel";
    listPanel.append(list);

    function select(item) {
      controls.forEach(([entry, option]) => option.setAttribute("aria-pressed", String(entry === item)));
      details.replaceChildren();
      if (!item) {
        const hint = button("Ver pista", null);
        hint.disabled = true;
        details.append(element("p", "", "Elegí un objeto de la lista."), hint);
        return;
      }
      const caption = element("p", "objective-clue", item.completed ? "Este objeto ya está ordenado." : "Consultá una pista si necesitás orientación.");
      const hint = button("Ver pista", () => { caption.textContent = item.clue; });
      hint.disabled = item.completed;
      caption.setAttribute("aria-live", "polite");
      if (item.sprite) {
        const image = element("img", "object-preview");
        image.src = item.sprite;
        image.alt = "";
        details.append(image);
      }
      details.append(element("h3", "", item.name), element("p", "objective-state", item.completed ? "Ordenado" : "Pendiente"), caption, hint);
    }

    const tabs = [
      [false, button("Todos", () => filter(false), "wood-button inventory-tab")],
      [true, button("Por hacer", () => filter(true), "wood-button inventory-tab")],
    ];
    tabs.forEach(([onlyPending, control]) => {
      control.id = onlyPending ? "inventory-pending" : "inventory-all";
      control.setAttribute("role", "tab");
      control.setAttribute("aria-controls", listPanel.id);
      filters.append(control);
    });

    function filter(onlyPending, focus = false) {
      tabs.forEach(([value, control]) => {
        const active = value === onlyPending;
        control.setAttribute("aria-selected", String(active));
        control.tabIndex = active ? 0 : -1;
        if (active) {
          listPanel.setAttribute("aria-labelledby", control.id);
          if (focus) control.focus();
        }
      });
      controls = [];
      list.replaceChildren();
      for (const item of config.entries) {
        if (onlyPending && item.completed) continue;
        const row = element("div", "object-row");
        const check = element("input", "objective-check");
        check.type = "checkbox";
        check.checked = item.completed;
        check.disabled = true;
        check.setAttribute("aria-label", item.name + (item.completed ? ": ordenado" : ": pendiente"));
        const option = button("", () => select(item), "object-option");
        if (item.sprite) {
          const icon = element("img", "object-icon");
          icon.src = item.sprite;
          icon.alt = "";
          option.append(icon);
        }
        option.append(element("span", "", item.name));
        option.setAttribute("aria-label", item.name + (item.completed ? ", ordenado" : ", pendiente"));
        controls.push([item, option]);
        row.append(check, option);
        list.append(row);
      }
      select(null);
    }

    filters.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        filter(event.target.id === "inventory-all", true);
      }
    });
    const shelf = element("div", "inventory-shelf");
    shelf.append(filters, listPanel);
    const body = element("div", "object-browser");
    body.append(shelf, details);
    filter(false);
    panel.append(body);
    actions(panel, config.onClose);
    return backdrop;
  }

  function settings(config) {
    const { backdrop, panel } = frame("Ajustes", "menu-panel", config.clock);
    const body = element("div", "settings-body");

    function section(title) {
      const group = element("fieldset", "settings-group");
      group.append(element("legend", "", title));
      body.append(group);
      return group;
    }

    function range(label, value, onChange) {
      const row = element("label", "settings-range");
      const input = element("input");
      input.type = "range";
      input.min = "0";
      input.max = "100";
      input.value = Math.round(value * 100);
      const reading = element("span", "settings-value", input.value + "%");
      input.oninput = () => {
        reading.textContent = input.value + "%";
        onChange(Number(input.value) / 100);
      };
      input.setAttribute("aria-label", label);
      reading.setAttribute("aria-hidden", "true");
      row.append(element("span", "", label), input, reading);
      return row;
    }

    function preference(label, checked, onChange) {
      const row = element("label", "wood-check");
      const input = element("input");
      input.type = "checkbox";
      input.checked = checked;
      input.onchange = () => onChange(input.checked);
      row.append(input, element("span", "", label));
      return row;
    }

    section("Sonido").append(range("Música", config.music, config.onMusic), range("Efectos", config.effects, config.onEffects));
    section("Accesibilidad").append(
      preference("Modo apto para daltónicos", config.colorblind, config.onColorblind),
      preference("Agarrar con un toque", config.toggle, config.onToggle),
      preference("Texto grande", config.large, config.onLarge),
      preference("Tipografía accesible", config.readable, config.onReadable),
    );
    panel.append(body);
    const footer = actions(panel, config.onClose, config.closeLabel);
    if (config.onExit) footer.prepend(button("Volver al menú", config.onExit, "wood-button secondary"));
    return backdrop;
  }

  return { mainMenu, levels, button, iconButton, inventory, map, settings, tutorial, interactionTutorial, skipWarning, confirmExit, phoneChat };
})();
