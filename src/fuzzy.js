/**
 * Fuzzy matching for search queries.
 * Pure functions, zero browser dependencies.
 */

/* global escapeHtml */

const FUZZY_BONUS_CONSECUTIVE = 3;
const FUZZY_BONUS_WORD_BOUNDARY = 2;
const FUZZY_BONUS_BASE = 1;

function fuzzyMatch(text, query) {
  if (!query || !text) return null;
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();
  if (qLower.length > tLower.length) return null;

  let score = 0;
  let queryIdx = 0;
  const indices = [];
  let prevIdx = -2;

  for (let i = 0; i < tLower.length && queryIdx < qLower.length; i++) {
    if (tLower[i] !== qLower[queryIdx]) continue;

    indices.push(i);
    if (i === prevIdx + 1) {
      score += FUZZY_BONUS_CONSECUTIVE;
    } else if (i === 0 || /[\s\-_./]/.test(text[i - 1])) {
      score += FUZZY_BONUS_WORD_BOUNDARY;
    } else {
      score += FUZZY_BONUS_BASE;
    }
    prevIdx = i;
    queryIdx++;
  }

  return queryIdx === qLower.length ? { score, indices } : null;
}

function fuzzyScore(item, query) {
  const titleMatch = fuzzyMatch(item.title || "", query);
  const urlMatch = fuzzyMatch(item.url || "", query);

  if (!titleMatch && !urlMatch) return null;

  return {
    score: Math.max(
      titleMatch ? titleMatch.score : 0,
      urlMatch ? urlMatch.score : 0,
    ),
  };
}

function highlightFuzzyMatch(text, indices) {
  if (!text) return "";
  const escape =
    typeof escapeHtml === "function" ? escapeHtml : (s) => String(s);
  if (!indices || indices.length === 0) return escape(text);

  const indexSet = new Set(indices);
  const parts = [];
  let i = 0;

  while (i < text.length) {
    if (indexSet.has(i)) {
      let group = "";
      while (i < text.length && indexSet.has(i)) {
        group += text[i];
        i++;
      }
      parts.push('<mark class="qal-highlight">' + escape(group) + "</mark>");
    } else {
      let group = "";
      while (i < text.length && !indexSet.has(i)) {
        group += text[i];
        i++;
      }
      parts.push(escape(group));
    }
  }

  return parts.join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    fuzzyMatch,
    fuzzyScore,
    highlightFuzzyMatch,
    FUZZY_BONUS_CONSECUTIVE,
    FUZZY_BONUS_WORD_BOUNDARY,
    FUZZY_BONUS_BASE,
  };
}
