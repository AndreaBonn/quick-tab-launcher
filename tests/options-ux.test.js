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
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getURL: vi.fn((p) => `moz-extension://id/${p}`),
    },
    tabs: { create: vi.fn().mockResolvedValue({}) },
    permissions: {
      contains: vi.fn().mockResolvedValue(false),
      request: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(true),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
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
  delete require.cache[require.resolve("../options/options-shortcut.js")];
  Object.assign(globalThis, require("../options/options-shortcut.js"));
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

describe("how-to link (O6)", () => {
  it("reopens the welcome page from the settings", async () => {
    const browserMock = await openOptions();
    const link = $("#qal-open-welcome");
    expect(link.textContent).toBe("Come si usa");
    link.click();
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://id/welcome/welcome.html",
    });
  });
});

describe("web search switch (R9)", () => {
  async function openWithPermission(granted, requestResult = true) {
    const browserMock = await openOptions();
    browserMock.permissions = {
      contains: vi.fn().mockResolvedValue(granted),
      request: vi.fn().mockResolvedValue(requestResult),
      remove: vi.fn().mockResolvedValue(true),
    };
    // Reload so the page reads the permission state through the new mock.
    globalThis.browser = browserMock;
    delete require.cache[require.resolve("../options/options-shortcut.js")];
    Object.assign(globalThis, require("../options/options-shortcut.js"));
    delete require.cache[require.resolve("../options/options.js")];
    let onReady;
    const spy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((type, handler) => {
        if (type === "DOMContentLoaded") onReady = handler;
      });
    require("../options/options.js");
    spy.mockRestore();
    document.body.innerHTML = OPTIONS_HTML.slice(
      OPTIONS_HTML.indexOf("<body>") + "<body>".length,
      OPTIONS_HTML.indexOf("<script"),
    );
    await onReady();
    await new Promise((r) => setTimeout(r, 0));
    return browserMock;
  }

  it("reflects whether the permission is granted", async () => {
    await openWithPermission(true);
    expect($("#qal-web-search").checked).toBe(true);
  });

  it("asks Firefox for the permission when switched on", async () => {
    const browserMock = await openWithPermission(false, true);
    const sw = $("#qal-web-search");
    sw.checked = true;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.permissions.request).toHaveBeenCalledWith({
      permissions: ["search"],
    });
    expect(sw.checked).toBe(true);
  });

  it("turns back off when the user declines", async () => {
    const browserMock = await openWithPermission(false, false);
    const sw = $("#qal-web-search");
    sw.checked = true;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.permissions.request).toHaveBeenCalled();
    expect(sw.checked).toBe(false);
  });

  it("gives the permission back when switched off", async () => {
    const browserMock = await openWithPermission(true);
    const sw = $("#qal-web-search");
    sw.checked = false;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(browserMock.permissions.remove).toHaveBeenCalledWith({
      permissions: ["search"],
    });
  });
});

describe("web search switch robustness (R9 review)", () => {
  async function openWithPermissions(permissions) {
    const browserMock = await openOptions();
    browserMock.permissions = permissions;
    globalThis.browser = browserMock;
    delete require.cache[require.resolve("../options/options-shortcut.js")];
    Object.assign(globalThis, require("../options/options-shortcut.js"));
    delete require.cache[require.resolve("../options/options.js")];
    let onReady;
    const spy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((type, handler) => {
        if (type === "DOMContentLoaded") onReady = handler;
      });
    require("../options/options.js");
    spy.mockRestore();
    document.body.innerHTML = OPTIONS_HTML.slice(
      OPTIONS_HTML.indexOf("<body>") + "<body>".length,
      OPTIONS_HTML.indexOf("<script"),
    );
    await onReady();
    await new Promise((r) => setTimeout(r, 0));
    return browserMock;
  }

  it("falls back to the real state when Firefox rejects the request", async () => {
    await openWithPermissions({
      contains: vi.fn().mockResolvedValue(false),
      request: vi.fn().mockRejectedValue(new Error("not a user action")),
      remove: vi.fn(),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    });
    const sw = $("#qal-web-search");
    sw.checked = true;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.checked).toBe(false);
    expect($("#qal-feedback").textContent).not.toBe("");
  });

  it("follows a permission revoked from the add-ons manager", async () => {
    const onRemoved = { addListener: vi.fn() };
    const contains = vi.fn().mockResolvedValue(true);
    await openWithPermissions({
      contains,
      request: vi.fn(),
      remove: vi.fn(),
      onAdded: { addListener: vi.fn() },
      onRemoved,
    });
    const sw = $("#qal-web-search");
    expect(sw.checked).toBe(true);
    contains.mockResolvedValue(false);
    onRemoved.addListener.mock.calls[0][0]({ permissions: ["search"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.checked).toBe(false);
  });
});
