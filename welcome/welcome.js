/* global browser, t, loadLocale, applyTranslations, getLocale, shortcutToKeys */

const TOGGLE_COMMAND = "toggle-launcher";
const IS_MAC = /mac/i.test(navigator.platform || "");

function renderKeys(shortcut) {
  const container = document.getElementById("qal-welcome-keys");
  const status = document.getElementById("qal-welcome-status");
  container.textContent = "";
  const keys = shortcutToKeys(shortcut, IS_MAC, t("keys.space"));
  if (keys.length === 0) {
    status.textContent = t("welcome.noShortcut");
    return;
  }
  keys.forEach((key, i) => {
    if (i > 0) container.appendChild(document.createTextNode(" + "));
    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    container.appendChild(kbd);
  });
}

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    return commands.find((c) => c.name === TOGGLE_COMMAND)?.shortcut || "";
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut unavailable", err);
    return "";
  }
}

function markShortcutFound() {
  const status = document.getElementById("qal-welcome-status");
  status.textContent = t("welcome.done");
  status.classList.add("qal-welcome-status--done");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadLocale();
  document.documentElement.lang = getLocale();
  applyTranslations(document);
  renderKeys(await loadShortcut());

  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "shortcut-used") markShortcutFound();
  });

  const openOptions = () => browser.runtime.openOptionsPage();
  document
    .getElementById("qal-welcome-shortcut")
    .addEventListener("click", openOptions);
  document
    .getElementById("qal-welcome-settings")
    .addEventListener("click", openOptions);
});
