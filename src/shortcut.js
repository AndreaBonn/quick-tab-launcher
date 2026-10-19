/**
 * Turns a key press into a Firefox command shortcut string and back into
 * readable keys. Format rules: 2 or 3 keys, a Ctrl/Alt/Command/MacCtrl
 * modifier (optional only for function keys), at most one secondary modifier.
 * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands
 */

const NAMED_KEYS = {
  Space: "Space",
  Comma: "Comma",
  Period: "Period",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;
const MAX_MODIFIERS = 2;

const KEY_LABELS = {
  Command: "⌘",
  MacCtrl: "⌃",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};
const MAC_ONLY_LABELS = { Shift: "⇧", Alt: "⌥" };

function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (FUNCTION_KEY.test(code)) return code;
  return NAMED_KEYS[code] || null;
}

function modifiersFrom(event, isMac) {
  const modifiers = [];
  if (isMac) {
    if (event.metaKey) modifiers.push("Command");
    if (event.ctrlKey) modifiers.push("MacCtrl");
  } else if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return modifiers;
}

/**
 * Builds a shortcut from a keydown event.
 *
 * @param {{code: string, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean}} event
 * @param {boolean} isMac - Whether the user is on macOS.
 * @returns {{shortcut: string}|{pending: true}|{error: "invalid"}}
 *   pending while only modifiers are held down.
 */
function buildShortcut(event, isMac) {
  if (MODIFIER_CODES.test(event.code)) return { pending: true };
  const key = keyFromCode(event.code);
  const modifiers = modifiersFrom(event, isMac);
  const hasMainModifier = modifiers.some((m) => m !== "Shift");
  const isValid =
    key !== null &&
    modifiers.length <= MAX_MODIFIERS &&
    (hasMainModifier || (FUNCTION_KEY.test(key) && modifiers.length === 0));
  if (!isValid) return { error: "invalid" };
  return { shortcut: [...modifiers, key].join("+") };
}

/**
 * Splits a shortcut string into the labels to draw as keys.
 *
 * @param {string} shortcut - e.g. "Ctrl+Shift+Space".
 * @param {boolean} isMac - Use Mac symbols.
 * @param {string} spaceLabel - Localized name of the space bar.
 * @returns {string[]}
 */
function shortcutToKeys(shortcut, isMac, spaceLabel) {
  if (!shortcut) return [];
  return shortcut.split("+").map((part) => {
    if (part === "Space") return spaceLabel;
    if (isMac && MAC_ONLY_LABELS[part]) return MAC_ONLY_LABELS[part];
    return KEY_LABELS[part] || part;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildShortcut, shortcutToKeys };
}
