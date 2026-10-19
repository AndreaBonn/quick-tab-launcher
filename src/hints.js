/**
 * Footer keyboard hints: only the keys that matter in the current mode,
 * with the full list one keypress away. Key names follow the user's platform.
 */

/* global t */

const HINTS = {
  "enter-go": { keys: ["↵"], label: "hints.go" },
  "enter-open": { keys: ["↵"], label: "hints.open" },
  "enter-run": { keys: ["↵"], label: "hints.run" },
  navigate: { keys: ["↑↓"], label: "hints.navigate" },
  "new-tab": { keys: ["Ctrl", "↵"], label: "hints.newTab" },
  actions: { keys: [">"], label: "hints.actions" },
  group: { keys: ["Alt", "G"], label: "hints.group" },
  fulltext: { keys: ["Alt", "C"], label: "hints.fulltext" },
  back: { keys: ["⌫"], label: "hints.back" },
  "close-tab": { keys: ["Alt", "W"], label: "hints.closeTab" },
  undo: { keys: ["Alt", "Z"], label: "hints.undo" },
  esc: { keys: ["Esc"], label: "hints.close" },
  help: { keys: ["?"], label: "hints.help", action: "toggle-help" },
  "help-less": { keys: ["?"], label: "hints.helpLess", action: "toggle-help" },
};

const HINT_SETS = {
  recent: ["enter-go", "navigate", "actions", "help"],
  search: ["enter-open", "new-tab", "group", "help"],
  commands: ["enter-run", "navigate", "back"],
  all: [
    "navigate",
    "enter-open",
    "new-tab",
    "actions",
    "group",
    "fulltext",
    "close-tab",
    "undo",
    "esc",
    "help-less",
  ],
};

const MAC_KEY_NAMES = { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" };

function isMacPlatform(platform) {
  return /mac/i.test(platform || "");
}

function formatKey(key, isMac) {
  return isMac && MAC_KEY_NAMES[key] ? MAC_KEY_NAMES[key] : key;
}

/**
 * Returns the hints to show for a mode.
 *
 * @param {string} mode - "recent" | "search" | "commands".
 * @param {boolean} expanded - True to list every shortcut.
 * @returns {Array<{id: string, keys: string[], label: string, action?: string}>}
 */
function getFooterHints(mode, expanded) {
  const ids = expanded ? HINT_SETS.all : HINT_SETS[mode] || HINT_SETS.recent;
  return ids.map((id) => ({ id, ...HINTS[id] }));
}

/**
 * Renders the hints into the footer element, replacing its content.
 *
 * @param {HTMLElement} footer - Footer container.
 * @param {object} options - { mode, expanded, isMac }.
 */
function renderFooterHints(footer, { mode, expanded, isMac }) {
  footer.textContent = "";
  for (const hint of getFooterHints(mode, expanded)) {
    const item = document.createElement(hint.action ? "button" : "span");
    item.className = "qal-hint";
    if (hint.action) {
      item.type = "button";
      item.dataset.qalAction = hint.action;
      item.setAttribute("aria-expanded", String(expanded));
    }
    for (const key of hint.keys) {
      const kbd = document.createElement("kbd");
      kbd.className = "qal-kbd";
      kbd.textContent = formatKey(key, isMac);
      item.appendChild(kbd);
    }
    item.appendChild(document.createTextNode(" " + t(hint.label)));
    footer.appendChild(item);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    HINTS,
    HINT_SETS,
    isMacPlatform,
    formatKey,
    getFooterHints,
    renderFooterHints,
  };
}
