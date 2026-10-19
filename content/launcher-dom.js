/* global createElement, createIcon, t */

function createLauncherInput() {
  const input = createElement("input", "qal-input");
  input.type = "text";
  input.placeholder = t("launcher.placeholder");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", t("launcher.inputLabel"));
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");

  return input;
}

function createLauncherSearch() {
  const searchContainer = createElement("div", "qal-search-container");
  const searchIcon = createElement("span", "qal-search-icon");
  const lens = createIcon("search", 18);
  if (lens) searchIcon.appendChild(lens);
  const input = createLauncherInput();

  const groupToggle = createElement("button", "qal-toggle qal-group-toggle");
  groupToggle.type = "button";
  const fulltextToggle = createElement(
    "button",
    "qal-toggle qal-fulltext-toggle",
  );
  fulltextToggle.type = "button";

  const settingsBtn = createElement("button", "qal-icon-btn");
  settingsBtn.type = "button";
  settingsBtn.dataset.qalAction = "open-options";
  const gear = createIcon("gear");
  if (gear) settingsBtn.appendChild(gear);

  searchContainer.append(
    searchIcon,
    input,
    groupToggle,
    fulltextToggle,
    settingsBtn,
  );

  return { searchContainer, input, groupToggle, fulltextToggle, settingsBtn };
}

function createLauncherSlots(input) {
  const quickActions = createElement("div", "qal-quick-actions");
  const guide = createElement("div", "qal-guide");
  guide.hidden = true;
  const toastSlot = createElement("div", "qal-toast-slot");
  toastSlot.setAttribute("aria-live", "polite");
  // The banner has its own buttons, so it lives outside the listbox.
  const duplicatesSlot = createElement("div", "qal-duplicates-slot");

  const results = createElement("div", "qal-results");
  results.id = "qal-results";
  input.setAttribute("aria-controls", results.id);
  results.setAttribute("role", "listbox");
  results.activeDescendantOwner = input;
  const footer = createElement("div", "qal-footer");

  return { quickActions, guide, toastSlot, duplicatesSlot, results, footer };
}

function createOverlayDOM(shadowRoot) {
  const overlay = createElement("div", "qal-overlay");
  overlay.style.display = "none";
  const backdrop = createElement("div", "qal-backdrop");
  const panel = createElement("div", "qal-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Quick Tab Launcher");
  const { searchContainer, ...search } = createLauncherSearch();
  const slots = createLauncherSlots(search.input);
  panel.append(
    searchContainer, slots.quickActions, slots.guide, slots.toastSlot,
    slots.duplicatesSlot, slots.results, slots.footer,
  );
  overlay.append(backdrop, panel);
  // Outcome messages shown after the panel closes live outside it.
  const pageToastSlot = createElement("div", "qal-page-toast-slot");
  pageToastSlot.setAttribute("aria-live", "polite");
  shadowRoot.append(overlay, pageToastSlot);
  return { overlay, backdrop, panel, ...search, ...slots, pageToastSlot };
}

function translateOverlayDOM(elements) {
  const { input, groupToggle, fulltextToggle, settingsBtn } = elements;
  settingsBtn.title = t("launcher.settings");
  settingsBtn.setAttribute("aria-label", t("launcher.settings"));
  input.placeholder = t("launcher.placeholder");
  input.setAttribute("aria-label", t("launcher.inputLabel"));
  groupToggle.textContent = t("launcher.groupToggle");
  groupToggle.title = t("launcher.groupToggle.tooltip");
  fulltextToggle.textContent = t("launcher.fulltextToggle");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createOverlayDOM, translateOverlayDOM };
}
