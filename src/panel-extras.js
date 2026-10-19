/**
 * DOM builders for the panel areas around the result list: first-run guide,
 * quick action chips, undo toast and confirmation strip.
 * Clicks are handled by the caller through `data-qal-action` attributes.
 */

/* global t */

function createActionButton(className, action, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.dataset.qalAction = action;
  btn.textContent = label;
  return btn;
}

/**
 * Fills the guide area with the short "how it works" note.
 *
 * @param {HTMLElement} el - Guide container.
 */
function renderGuide(el) {
  el.textContent = "";
  const text = document.createElement("p");
  text.className = "qal-guide-text";
  const title = document.createElement("strong");
  title.textContent = t("guide.title") + " ";
  text.append(title, document.createTextNode(t("guide.body")));
  el.append(
    text,
    createActionButton("qal-link-btn", "dismiss-guide", t("guide.dismiss")),
  );
}

/**
 * Fills the quick action row with one chip per command plus "all actions".
 *
 * @param {HTMLElement} el - Quick actions container.
 * @param {Array<{id: string}>} commands - Commands to offer, in order.
 */
function renderQuickActions(el, commands) {
  el.textContent = "";
  const label = document.createElement("span");
  label.className = "qal-quick-label";
  label.textContent = t("quick.label");
  el.appendChild(label);
  for (const cmd of commands) {
    const chip = createActionButton(
      "qal-chip",
      "run-command",
      t("quick." + cmd.id),
    );
    chip.dataset.commandId = cmd.id;
    el.appendChild(chip);
  }
  el.appendChild(
    createActionButton("qal-chip", "show-commands", t("quick.all")),
  );
}

/**
 * Builds a status message, optionally with an Undo button.
 *
 * @param {string} message - Text to announce.
 * @param {boolean} canUndo - Whether to show the Undo button.
 * @returns {HTMLElement}
 */
function buildToast(message, canUndo) {
  const toast = document.createElement("div");
  toast.className = "qal-toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.className = "qal-toast-text";
  text.textContent = message;
  toast.appendChild(text);
  if (canUndo) {
    const undo = createActionButton("qal-toast-undo", "undo", t("toast.undo"));
    undo.title = t("toast.undo.tooltip");
    toast.appendChild(undo);
  }
  return toast;
}

/**
 * Builds the strip that asks to press Enter again before closing tabs.
 *
 * @param {string} message - Confirmation text with the tab count.
 * @returns {HTMLElement}
 */
function buildConfirmStrip(message) {
  const strip = document.createElement("div");
  strip.className = "qal-confirm";
  strip.setAttribute("role", "alert");
  strip.textContent = message;
  return strip;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    renderGuide,
    renderQuickActions,
    buildToast,
    buildConfirmStrip,
  };
}
