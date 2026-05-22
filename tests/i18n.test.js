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

function createBrowserMock(storedLocale) {
  const storage = storedLocale
    ? { [I18N_STORAGE_KEY]: storedLocale }
    : {};
  return {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (storage[key] !== undefined) return { [key]: storage[key] };
          return {};
        }),
        set: vi.fn(async (items) => {
          Object.assign(storage, items);
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

  it("keeps default when storage is empty", async () => {
    const mock = createBrowserMock(null);
    globalThis.browser = mock;
    setLocaleFromStorage("it");
    await loadLocale();
    expect(getLocale()).toBe("it");
    delete globalThis.browser;
  });

  it("ignores unsupported locale from storage", async () => {
    const mock = createBrowserMock("fr");
    globalThis.browser = mock;
    setLocaleFromStorage("it");
    await loadLocale();
    expect(getLocale()).toBe("it");
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
      "Cerca schede, segnalibri, cronologia...",
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

describe("i18n - constants", () => {
  it("default locale is it", () => {
    expect(I18N_DEFAULT_LOCALE).toBe("it");
  });

  it("supports it and en", () => {
    expect(I18N_SUPPORTED_LOCALES).toEqual(["it", "en"]);
  });
});
