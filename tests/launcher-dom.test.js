import { beforeEach, describe, expect, it } from "vitest";

for (const file of ["config-storage", "i18n", "icons", "render-utils"]) {
  Object.assign(globalThis, require(`../src/${file}.js`));
}
const { createOverlayDOM, translateOverlayDOM } = require("../content/launcher-dom.js");

function buildOverlay() {
  const root = document.createElement("div").attachShadow({ mode: "closed" });
  return { root, elements: createOverlayDOM(root) };
}

beforeEach(() => setLocaleFromStorage("en"));

describe("launcher overlay DOM", () => {
  it("returns the overlay elements inside the supplied closed shadow root", () => {
    const { root, elements } = buildOverlay();
    expect(Object.keys(elements).sort()).toEqual([
      "overlay", "backdrop", "panel", "input", "results", "footer", "groupToggle",
      "fulltextToggle", "settingsBtn", "quickActions", "guide", "toastSlot",
      "duplicatesSlot", "pageToastSlot",
    ].sort());
    for (const element of Object.values(elements)) {
      expect(element.getRootNode()).toBe(root);
      expect([...element.classList].every((name) => name.startsWith("qal-"))).toBe(true);
    }
    expect([...root.children]).toEqual([elements.overlay, elements.pageToastSlot]);
    expect([...elements.overlay.children]).toEqual([elements.backdrop, elements.panel]);
    expect([...elements.panel.children]).toEqual([
      elements.input.parentNode, elements.quickActions, elements.guide,
      elements.toastSlot, elements.duplicatesSlot, elements.results, elements.footer,
    ]);
    expect(elements.overlay.style.display).toBe("none");
    expect(elements.guide.hidden).toBe(true);
    expect(elements.input.parentNode.querySelectorAll("svg")).toHaveLength(2);
    for (const button of [elements.groupToggle, elements.fulltextToggle, elements.settingsBtn]) {
      expect(button.type).toBe("button");
    }
    expect(elements.settingsBtn.dataset.qalAction).toBe("open-options");
  });

  it("connects the combobox to its listbox and keeps interactive banners outside it", () => {
    const { root, elements: e } = buildOverlay();
    expect(e.panel.getAttribute("role")).toBe("dialog");
    expect(e.panel.getAttribute("aria-label")).toBe("Quick Tab Launcher");
    expect(e.input.getAttribute("role")).toBe("combobox");
    expect(e.input.getAttribute("aria-controls")).toBe(e.results.id);
    expect(root.getElementById(e.results.id)).toBe(e.results);
    expect(e.results.getAttribute("role")).toBe("listbox");
    expect(e.results.activeDescendantOwner).toBe(e.input);
    expect(e.input.getAttribute("aria-expanded")).toBe("true");
    expect(e.input.getAttribute("aria-autocomplete")).toBe("list");
    expect(e.input.autocomplete).toBe("off");
    expect(e.input.spellcheck).toBe(false);
    expect(e.duplicatesSlot.parentNode).toBe(e.results.parentNode);
    expect(e.toastSlot.getAttribute("aria-live")).toBe("polite");
    expect(e.pageToastSlot.getAttribute("aria-live")).toBe("polite");
  });

  it.each(["en", "it"])("applies %s labels on creation and translates after a language change", (locale) => {
    setLocaleFromStorage(locale);
    const { elements: e } = buildOverlay();
    expect(e.input.placeholder).toBe(t("launcher.placeholder"));
    expect(e.input.getAttribute("aria-label")).toBe(t("launcher.inputLabel"));
    translateOverlayDOM(e);
    expect(e.settingsBtn.title).toBe(t("launcher.settings"));
    expect(e.settingsBtn.getAttribute("aria-label")).toBe(t("launcher.settings"));
    expect(e.groupToggle.textContent).toBe(t("launcher.groupToggle"));
    expect(e.groupToggle.title).toBe(t("launcher.groupToggle.tooltip"));
    expect(e.fulltextToggle.textContent).toBe(t("launcher.fulltextToggle"));
    const previous = e.input.placeholder;
    setLocaleFromStorage(locale === "en" ? "it" : "en");
    translateOverlayDOM(e);
    expect(e.input.placeholder).toBe(t("launcher.placeholder"));
    expect(e.input.placeholder).not.toBe(previous);
    expect(e.input.getAttribute("aria-label")).toBe(t("launcher.inputLabel"));
    expect(e.settingsBtn.title).toBe(t("launcher.settings"));
    expect(e.groupToggle.textContent).toBe(t("launcher.groupToggle"));
  });
});
