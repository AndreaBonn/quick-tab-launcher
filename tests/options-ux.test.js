import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const OPTIONS_HTML = fs.readFileSync(
  path.join(__dirname, "../options/options.html"),
  "utf8",
);

function createBrowserMock({ shortcut = "Ctrl+Shift+Space", locale } = {}) {
  const store = locale ? { qal_locale: locale } : {};
  return {
    store,
    i18n: { getUILanguage: () => "it-IT" },
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    commands: {
      getAll: vi
        .fn()
        .mockResolvedValue([{ name: "toggle-launcher", shortcut }]),
      update: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      local: {
        get: vi.fn(async (key) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items) => Object.assign(store, items)),
        remove: vi.fn(async (key) => {
          delete store[key];
        }),
      },
    },
  };
}

async function openOptions(options) {
  const browserMock = createBrowserMock(options);
  globalThis.browser = browserMock;
  Object.assign(
    globalThis,
    require("../src/config-storage.js"),
    require("../src/i18n.js"),
    require("../src/shortcut.js"),
  );
  document.body.innerHTML = OPTIONS_HTML.slice(
    OPTIONS_HTML.indexOf("<body>") + "<body>".length,
    OPTIONS_HTML.indexOf("<script"),
  );
  delete require.cache[require.resolve("../options/options.js")];
  require("../options/options.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 20));
  return browserMock;
}

const $ = (sel) => document.querySelector(sel);

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.browser;
  vi.useRealTimers();
});

describe("shortcut (O1)", () => {
  it("shows the current shortcut as keys", async () => {
    await openOptions();
    const keys = [...document.querySelectorAll("#qal-shortcut-keys kbd")].map(
      (k) => k.textContent,
    );
    expect(keys).toEqual(["Ctrl", "Shift", "Spazio"]);
  });

  it("records a new combination and saves it in Firefox", async () => {
    const browserMock = await openOptions();
    $("#qal-shortcut-change").click();
    expect($("#qal-shortcut-status").textContent).toContain("Premi");

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyK",
        key: "K",
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(browserMock.commands.update).toHaveBeenCalledWith({
      name: "toggle-launcher",
      shortcut: "Ctrl+Shift+K",
    });
    expect(
      [...document.querySelectorAll("#qal-shortcut-keys kbd")].map(
        (k) => k.textContent,
      ),
    ).toEqual(["Ctrl", "Shift", "K"]);
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      action: "refresh-action-title",
    });
  });

  it("explains an invalid combination and keeps listening", async () => {
    const browserMock = await openOptions();
    $("#qal-shortcut-change").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
    expect($("#qal-shortcut-status").textContent).toContain("Ctrl o Alt");
    expect(browserMock.commands.update).not.toHaveBeenCalled();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyJ", altKey: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.commands.update).toHaveBeenCalledWith({
      name: "toggle-launcher",
      shortcut: "Alt+J",
    });
  });

  it("Esc cancels without changing anything", async () => {
    const browserMock = await openOptions();
    $("#qal-shortcut-change").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyJ", altKey: true }),
    );
    expect(browserMock.commands.update).not.toHaveBeenCalled();
  });

  it("Reset restores the default shortcut", async () => {
    const browserMock = await openOptions();
    $("#qal-shortcut-reset").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.commands.reset).toHaveBeenCalledWith("toggle-launcher");
  });
});

describe("language menu (O3)", () => {
  it("starts on Automatic when nothing was chosen", async () => {
    await openOptions();
    expect($("#qal-locale-select").value).toBe("auto");
  });

  it("shows the chosen language", async () => {
    await openOptions({ locale: "en" });
    expect($("#qal-locale-select").value).toBe("en");
  });

  it("choosing Automatic forgets the stored language", async () => {
    const browserMock = await openOptions({ locale: "en" });
    const select = $("#qal-locale-select");
    select.value = "auto";
    select.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.storage.local.remove).toHaveBeenCalledWith("qal_locale");
  });
});

describe("autosave (O4)", () => {
  it("saves a valid change without a Save button", async () => {
    const browserMock = await openOptions();
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    const field = $("#qal-history-days");
    field.value = "60";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
    expect(browserMock.store.qal_user_config.HISTORY_DAYS).toBe(60);
    expect($("#qal-feedback").textContent).toBe("Salvato.");
  });

  it("marks an invalid field and does not save", async () => {
    const browserMock = await openOptions();
    const field = $("#qal-history-days");
    field.value = "999";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
    expect(field.hasAttribute("aria-invalid")).toBe(true);
    expect(browserMock.store.qal_user_config).toBeUndefined();
  });
});

describe("page layout (O2, O5, S4)", () => {
  it("keeps technical settings inside a closed Advanced section", async () => {
    await openOptions();
    const details = $("details.qal-advanced");
    expect(details.open).toBe(false);
    expect(details.querySelector("#qal-debounce-ms")).not.toBeNull();
    expect(details.querySelector("#qal-loading-threshold-ms")).not.toBeNull();
    expect(details.querySelector("#qal-history-days")).toBeNull();
  });

  it("presents text search as a switch with a privacy note", async () => {
    await openOptions();
    expect($("#qal-enable-fulltext-search").getAttribute("role")).toBe(
      "switch",
    );
    expect(document.body.textContent).toContain("non lascia il browser");
  });

  it("credits the author at the bottom of the settings", async () => {
    await openOptions();
    expect($(".qal-options-footer").textContent).toContain("Bonn");
  });
});

describe("review fixes - options (#11)", () => {
  it("an emptied number field is invalid, not zero", async () => {
    const browserMock = await openOptions();
    const field = $("#qal-debounce-ms");
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
    expect(field.hasAttribute("aria-invalid")).toBe(true);
    expect(browserMock.store.qal_user_config).toBeUndefined();
  });

  it("leaving the Change button stops recording keys", async () => {
    const browserMock = await openOptions();
    const btn = $("#qal-shortcut-change");
    btn.click();
    btn.dispatchEvent(new Event("blur"));
    const event = new KeyboardEvent("keydown", {
      code: "KeyJ",
      altKey: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(browserMock.commands.update).not.toHaveBeenCalled();
  });
});
