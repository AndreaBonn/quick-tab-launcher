/**
 * First-run guide in the launcher: shown on the first openings until the user
 * dismisses it. Pure state transitions, storage at the edges.
 */

/* global browser */

const GUIDE_STORAGE_KEY = "qal_guide";
const GUIDE_MAX_OPENS = 10;
const GUIDE_INITIAL_STATE = { opens: 0, dismissed: false };

function shouldShowGuide(guideState) {
  return !guideState.dismissed && guideState.opens <= GUIDE_MAX_OPENS;
}

function registerGuideOpen(guideState) {
  return { ...guideState, opens: guideState.opens + 1 };
}

function dismissGuide(guideState) {
  return { ...guideState, dismissed: true };
}

async function loadGuideState() {
  const result = await browser.storage.local.get(GUIDE_STORAGE_KEY);
  return { ...GUIDE_INITIAL_STATE, ...(result[GUIDE_STORAGE_KEY] || {}) };
}

async function saveGuideState(guideState) {
  await browser.storage.local.set({ [GUIDE_STORAGE_KEY]: guideState });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GUIDE_STORAGE_KEY,
    GUIDE_MAX_OPENS,
    GUIDE_INITIAL_STATE,
    shouldShowGuide,
    registerGuideOpen,
    dismissGuide,
    loadGuideState,
    saveGuideState,
  };
}
