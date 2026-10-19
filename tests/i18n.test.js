import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  I18N_STORAGE_KEY,
  I18N_DEFAULT_LOCALE,
  I18N_SUPPORTED_LOCALES,
  I18N_MESSAGES,
  t,
  getLocale,
  loadLocale,
  setLocale,
  setLocaleFromStorage,
  onLocaleChange,
  applyTranslations,
} = require("../src/i18n.js");

function createBrowserMock(storedLocale, uiLanguage = "it-IT") {
  const storage = storedLocale
    ? { [I18N_STORAGE_KEY]: storedLocale }
    : {};
  return {
    i18n: { getUILanguage: () => uiLanguage },
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (storage[key] !== undefined) return { [key]: storage[key] };
          return {};
        }),
        set: vi.fn(async (items) => {
          Object.assign(storage, items);
        }),
        remove: vi.fn(async (key) => {
          delete storage[key];
        }),
      },
    },
  };
}

beforeEach(() => {
  setLocaleFromStorage("it");
});

describe("i18n - t()", () => {
  it("returns italian translation by default", () => {
    expect(t("states.empty")).toBe("Inizia a digitare per cercare...");
  });

  it("returns key when translation is missing", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates params with {{placeholder}}", () => {
    const result = t("states.noResults", { query: "test" });
    expect(result).toContain("test");
    expect(result).not.toContain("{{query}}");
  });

  it("returns english translation after locale change", () => {
    setLocaleFromStorage("en");
    expect(t("states.empty")).toBe("Start typing to search...");
  });
});

describe("i18n - getLocale()", () => {
  it("returns current locale", () => {
    expect(getLocale()).toBe("it");
    setLocaleFromStorage("en");
    expect(getLocale()).toBe("en");
  });
});

describe("i18n - loadLocale()", () => {
  it("loads stored locale from browser.storage", async () => {
    const mock = createBrowserMock("en");
    globalThis.browser = mock;
    await loadLocale();
    expect(getLocale()).toBe("en");
    delete globalThis.browser;
  });

  it("follows Firefox's language when nothing is stored (L1)", async () => {
    globalThis.browser = createBrowserMock(null, "en-GB");
    setLocaleFromStorage("it");
    await loadLocale();
    expect(getLocale()).toBe("en");

    globalThis.browser = createBrowserMock(null, "it-IT");
    await loadLocale();
    expect(getLocale()).toBe("it");
    delete globalThis.browser;
  });

  it("falls back to English for languages it does not have", async () => {
    globalThis.browser = createBrowserMock(null, "fr-FR");
    setLocaleFromStorage("it");
    await loadLocale();
    expect(getLocale()).toBe("en");
    delete globalThis.browser;
  });

  it("ignores an unsupported stored locale and uses Firefox's", async () => {
    globalThis.browser = createBrowserMock("fr", "it-IT");
    setLocaleFromStorage("en");
    await loadLocale();
    expect(getLocale()).toBe("it");
    delete globalThis.browser;
  });
});

describe("i18n - automatic language (L1, O3)", () => {
  const { resolveLocale, clearLocale, getLocalePreference } = require(
    "../src/i18n.js",
  );

  it("resolveLocale prefers a valid stored choice", () => {
    expect(resolveLocale("en", "it-IT")).toBe("en");
    expect(resolveLocale(undefined, "it")).toBe("it");
    expect(resolveLocale(undefined, "de-DE")).toBe("en");
    expect(resolveLocale(undefined, "")).toBe("en");
  });

  it("reports auto until a language is chosen, then the choice", async () => {
    globalThis.browser = createBrowserMock(null, "it-IT");
    await loadLocale();
    expect(getLocalePreference()).toBe("auto");
    await setLocale("en");
    expect(getLocalePreference()).toBe("en");
    delete globalThis.browser;
  });

  it("clearLocale forgets the choice and goes back to Firefox's language", async () => {
    const mock = createBrowserMock("en", "it-IT");
    globalThis.browser = mock;
    await loadLocale();
    const listener = vi.fn();
    onLocaleChange(listener);
    await clearLocale();
    expect(mock.storage.local.remove).toHaveBeenCalledWith(I18N_STORAGE_KEY);
    expect(getLocale()).toBe("it");
    expect(getLocalePreference()).toBe("auto");
    expect(listener).toHaveBeenCalledWith("it");
    delete globalThis.browser;
  });
});

describe("i18n - setLocale()", () => {
  it("persists locale to storage and updates current", async () => {
    const mock = createBrowserMock(null);
    globalThis.browser = mock;
    await setLocale("en");
    expect(getLocale()).toBe("en");
    expect(mock.storage.local.set).toHaveBeenCalledWith({
      [I18N_STORAGE_KEY]: "en",
    });
    delete globalThis.browser;
  });

  it("ignores unsupported locale", async () => {
    const mock = createBrowserMock(null);
    globalThis.browser = mock;
    await setLocale("fr");
    expect(getLocale()).toBe("it");
    delete globalThis.browser;
  });

  it("notifies change listeners", async () => {
    const mock = createBrowserMock(null);
    globalThis.browser = mock;
    const listener = vi.fn();
    onLocaleChange(listener);
    await setLocale("en");
    expect(listener).toHaveBeenCalledWith("en");
    delete globalThis.browser;
  });
});

describe("i18n - setLocaleFromStorage()", () => {
  it("updates locale in memory without storage call", () => {
    setLocaleFromStorage("en");
    expect(getLocale()).toBe("en");
  });

  it("ignores unsupported locale", () => {
    setLocaleFromStorage("de");
    expect(getLocale()).toBe("it");
  });
});

describe("i18n - applyTranslations()", () => {
  it("populates elements with data-i18n attribute", () => {
    document.body.innerHTML = '<span data-i18n="states.empty"></span>';
    applyTranslations(document);
    expect(document.querySelector("span").textContent).toBe(
      "Inizia a digitare per cercare...",
    );
  });

  it("sets placeholder on data-i18n-placeholder elements", () => {
    document.body.innerHTML =
      '<input data-i18n-placeholder="launcher.placeholder" />';
    applyTranslations(document);
    expect(document.querySelector("input").placeholder).toBe(
      "Cerca schede, segnalibri, cronologia o > azioni",
    );
  });

  it("sets title on data-i18n-title elements", () => {
    document.body.innerHTML =
      '<button data-i18n-title="badges.closeTab"></button>';
    applyTranslations(document);
    expect(document.querySelector("button").title).toBe("Chiudi scheda");
  });
});

describe("i18n - dictionary completeness", () => {
  it("IT and EN dictionaries have identical keys", () => {
    const itKeys = Object.keys(I18N_MESSAGES.it).sort();
    const enKeys = Object.keys(I18N_MESSAGES.en).sort();
    expect(itKeys).toEqual(enKeys);
  });

  it("no empty values in IT dictionary", () => {
    for (const [key, value] of Object.entries(I18N_MESSAGES.it)) {
      expect(value, `IT key "${key}" should not be empty`).toBeTruthy();
    }
  });

  it("no empty values in EN dictionary", () => {
    for (const [key, value] of Object.entries(I18N_MESSAGES.en)) {
      expect(value, `EN key "${key}" should not be empty`).toBeTruthy();
    }
  });
});

describe("i18n - user-facing wording", () => {
  it("placeholder mentions the > prefix in both locales", () => {
    expect(I18N_MESSAGES.it["launcher.placeholder"]).toContain(">");
    expect(I18N_MESSAGES.en["launcher.placeholder"]).toContain(">");
  });

  it("fulltext toggle label says what it does", () => {
    expect(I18N_MESSAGES.it["launcher.fulltextToggle"]).toBe("Cerca nel testo");
    expect(I18N_MESSAGES.en["launcher.fulltextToggle"]).toBe("Search text");
  });

  it("product name is spelled Quick Tab Launcher", () => {
    expect(I18N_MESSAGES.it["options.title"]).toBe("Quick Tab Launcher");
    expect(I18N_MESSAGES.en["options.title"]).toBe("Quick Tab Launcher");
  });

  it("Italian texts use accented vowels, not keyboard fallbacks", () => {
    const unaccented = /\b(piu|perche|puo|gia|cosi|e')\b/i;
    for (const [key, value] of Object.entries(I18N_MESSAGES.it)) {
      expect(unaccented.test(value), `IT key "${key}": ${value}`).toBe(false);
    }
    expect(unaccented.test("piu lento")).toBe(true);
  });

  it("command descriptions do not repeat the command label", () => {
    for (const locale of ["it", "en"]) {
      const dict = I18N_MESSAGES[locale];
      for (const key of Object.keys(dict).filter((k) => k.endsWith(".desc"))) {
        const label = dict[key.replace(/\.desc$/, "")];
        expect(dict[key].toLowerCase(), `${locale} ${key}`).not.toContain(
          label.toLowerCase(),
        );
      }
    }
  });
});

describe("i18n - tCount()", () => {
  const { tCount } = require("../src/i18n.js");

  it("uses the singular form for one", () => {
    setLocaleFromStorage("it");
    expect(tCount("done.close-other-tabs", 1)).toBe("1 scheda chiusa");
  });

  it("uses the plural form for other counts", () => {
    setLocaleFromStorage("it");
    expect(tCount("done.close-other-tabs", 3)).toBe("3 schede chiuse");
    expect(tCount("done.close-other-tabs", 0)).toBe("0 schede chiuse");
  });

  it("falls back to the plural key when no singular exists", () => {
    setLocaleFromStorage("en");
    expect(tCount("duplicates.item", 1, { title: "X" })).toBe("X (1 extra)");
  });
});

describe("i18n - constants", () => {
  it("default locale is it", () => {
    expect(I18N_DEFAULT_LOCALE).toBe("it");
  });

  it("supports it and en", () => {
    expect(I18N_SUPPORTED_LOCALES).toEqual(["it", "en"]);
  });
});
