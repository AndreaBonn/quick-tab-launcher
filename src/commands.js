/**
 * Command registry for Quick Actions command palette.
 * Pure data + filtering, zero browser dependencies.
 */

/* global fuzzyMatch, t */

// Ordered by group: the palette renders "tabs" actions first, then the ones on
// the current tab. `confirm` marks commands that close several tabs at once.
const COMMANDS = [
  { id: "close-other-tabs", icon: "trash", group: "tabs", confirm: true },
  { id: "close-duplicates", icon: "copies", group: "tabs", confirm: true },
  { id: "duplicate-tab", icon: "duplicate", group: "tabs" },
  { id: "sort-tabs-title", icon: "sort", group: "tabs" },
  { id: "mute-tab", icon: "mute", group: "current" },
  { id: "unmute-tab", icon: "sound", group: "current" },
  { id: "pin-tab", icon: "pin", group: "current" },
  { id: "unpin-tab", icon: "unpin", group: "current" },
];

// Each toggle command only makes sense in one tab state.
const APPLICABLE_WHEN = {
  "mute-tab": (tab) => !tab.muted,
  "unmute-tab": (tab) => tab.muted,
  "pin-tab": (tab) => !tab.pinned,
  "unpin-tab": (tab) => tab.pinned,
};

// Shorter queries match too many labels by accident.
const MIN_SEARCH_COMMAND_QUERY = 3;

function getCommandLabel(command) {
  if (typeof t !== "function") return command.id;
  return t("commands." + command.id);
}

function getCommandDescription(command) {
  if (typeof t !== "function") return "";
  return t("commands." + command.id + ".desc");
}

/**
 * Whether a command does something on a tab in the given state.
 *
 * @param {object} command - Entry of COMMANDS.
 * @param {{muted: boolean, pinned: boolean}|null} tabState - Unknown when null.
 * @returns {boolean}
 */
function isCommandApplicable(command, tabState) {
  const rule = APPLICABLE_WHEN[command.id];
  return !tabState || !rule || rule(tabState);
}

function toResult(cmd, label, match) {
  return {
    ...cmd,
    label,
    description: getCommandDescription(cmd),
    matchScore: match ? match.score : 0,
    matchIndices: match ? match.indices : null,
  };
}

function filterCommands(query, tabState = null) {
  const q = (query || "").trim().toLowerCase();
  const available = COMMANDS.filter((cmd) =>
    isCommandApplicable(cmd, tabState),
  );

  if (!q) {
    return available.map((cmd) => toResult(cmd, getCommandLabel(cmd), null));
  }

  const results = [];

  for (const cmd of available) {
    const label = getCommandLabel(cmd);
    const match =
      typeof fuzzyMatch === "function" ? fuzzyMatch(label, q) : null;
    const isSubstring = !match && label.toLowerCase().includes(q);

    if (match || isSubstring) {
      results.push(toResult(cmd, label, match));
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

/**
 * Commands whose label has a word starting with the query, for showing actions
 * among normal search results. Stricter than fuzzy matching on purpose: a
 * search for "git" must not surface "Ordina schede per titolo".
 *
 * @param {string} query - Raw search text.
 * @param {{muted: boolean, pinned: boolean}|null} tabState - Current tab state.
 * @returns {Array<object>} Matching commands in registry order.
 */
function matchCommandsForSearch(query, tabState) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < MIN_SEARCH_COMMAND_QUERY) return [];
  return COMMANDS.filter((cmd) => isCommandApplicable(cmd, tabState))
    .map((cmd) => ({ cmd, label: getCommandLabel(cmd) }))
    .filter(({ label }) =>
      label
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.startsWith(q)),
    )
    .map(({ cmd, label }) => toResult(cmd, label, null));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COMMANDS,
    filterCommands,
    getCommandLabel,
    getCommandDescription,
    isCommandApplicable,
    matchCommandsForSearch,
  };
}
