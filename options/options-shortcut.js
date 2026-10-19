/* global browser, t, buildShortcut, shortcutToKeys */

const TOGGLE_COMMAND = "toggle-launcher";
const IS_MAC = /mac/i.test(navigator.platform || "");

let currentShortcut = "";
let isCapturingShortcut = false;

function renderShortcut() {
  const container = document.getElementById("qal-shortcut-keys");
  if (!container) return;
  container.textContent = "";
  const keys = shortcutToKeys(currentShortcut, IS_MAC, t("keys.space"));
  if (keys.length === 0) {
    container.textContent = t("options.shortcut.none");
    return;
  }
  for (const key of keys) {
    const kbd = document.createElement("kbd");
    kbd.className = "qal-kbd";
    kbd.textContent = key;
    container.appendChild(kbd);
  }
}

function setShortcutStatus(message, isError = false) {
  const status = document.getElementById("qal-shortcut-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("qal-shortcut-status--error", isError);
}

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    currentShortcut =
      commands.find((c) => c.name === TOGGLE_COMMAND)?.shortcut || "";
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut unavailable", err);
  }
  renderShortcut();
}

function stopCapture() {
  isCapturingShortcut = false;
  document.removeEventListener("keydown", captureShortcut, true);
  document
    .getElementById("qal-shortcut-change")
    ?.removeAttribute("aria-pressed");
}

async function applyShortcut(shortcut) {
  try {
    await browser.commands.update({ name: TOGGLE_COMMAND, shortcut });
    currentShortcut = shortcut;
    renderShortcut();
    setShortcutStatus(t("options.shortcut.saved"));
    browser.runtime.sendMessage({ action: "refresh-action-title" });
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut update failed", err);
    setShortcutStatus(t("options.shortcut.failed"), true);
  }
}

function captureShortcut(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopCapture();
    setShortcutStatus("");
    return;
  }
  const result = buildShortcut(event, IS_MAC);
  if (result.pending) return;
  if (result.error) {
    setShortcutStatus(t("options.shortcut.invalid"), true);
    return;
  }
  stopCapture();
  applyShortcut(result.shortcut);
}

function startCapture() {
  if (isCapturingShortcut) return;
  isCapturingShortcut = true;
  document
    .getElementById("qal-shortcut-change")
    ?.setAttribute("aria-pressed", "true");
  setShortcutStatus(t("options.shortcut.prompt"));
  document.addEventListener("keydown", captureShortcut, true);
}

async function resetShortcut() {
  try {
    await browser.commands.reset(TOGGLE_COMMAND);
    await loadShortcut();
    setShortcutStatus(t("options.shortcut.saved"));
    browser.runtime.sendMessage({ action: "refresh-action-title" });
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut reset failed", err);
    setShortcutStatus(t("options.shortcut.failed"), true);
  }
}

function setupShortcut() {
  const changeBtn = document.getElementById("qal-shortcut-change");
  changeBtn?.addEventListener("click", startCapture);
  // Leaving the button ends recording, so other fields get their keys back.
  changeBtn?.addEventListener("blur", () => {
    if (!isCapturingShortcut) return;
    stopCapture();
    setShortcutStatus("");
  });
  document
    .getElementById("qal-shortcut-reset")
    ?.addEventListener("click", resetShortcut);
  loadShortcut();
}

if (typeof module !== "undefined") {
  module.exports = {
    renderShortcut, setShortcutStatus, loadShortcut, stopCapture, applyShortcut,
    captureShortcut, startCapture, resetShortcut, setupShortcut,
  };
}
