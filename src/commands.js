/**
 * Command registry for Quick Actions command palette.
 * Pure data + filtering, zero browser dependencies.
 */

/* global fuzzyMatch, t */

const COMMANDS = [
  { id: "close-other-tabs", icon: "\uD83D\uDDD1" },
  { id: "close-duplicates", icon: "\uD83E\uDDF9" },
  { id: "mute-tab", icon: "\uD83D\uDD07" },
  { id: "unmute-tab", icon: "\uD83D\uDD0A" },
  { id: "pin-tab", icon: "\uD83D\uDCCC" },
  { id: "unpin-tab", icon: "\uD83D\uDCCD" },
  { id: "duplicate-tab", icon: "\uD83D\uDCCB" },
  { id: "sort-tabs-title", icon: "\uD83D\uDD24" },
];

function getCommandLabel(command) {
  if (typeof t !== "function") return command.id;
  return t("commands." + command.id);
}

function getCommandDescription(command) {
  if (typeof t !== "function") return "";
  return t("commands." + command.id + ".desc");
}

function filterCommands(query) {
  const q = (query || "").trim().toLowerCase();

  if (!q) {
    return COMMANDS.map((cmd) => ({
      ...cmd,
      label: getCommandLabel(cmd),
      description: getCommandDescription(cmd),
      matchScore: 0,
      matchIndices: null,
    }));
  }

  const results = [];

  for (const cmd of COMMANDS) {
    const label = getCommandLabel(cmd);
    const match =
      typeof fuzzyMatch === "function" ? fuzzyMatch(label, q) : null;
    const isSubstring = !match && label.toLowerCase().includes(q);

    if (match || isSubstring) {
      results.push({
        ...cmd,
        label,
        description: getCommandDescription(cmd),
        matchScore: match ? match.score : 0,
        matchIndices: match ? match.indices : null,
      });
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COMMANDS,
    filterCommands,
    getCommandLabel,
    getCommandDescription,
  };
}
