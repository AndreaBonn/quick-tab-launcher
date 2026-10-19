import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const HTML = fs.readFileSync(
  path.join(__dirname, "../welcome/welcome.html"),
  "utf8",
);

async function openWelcome({
  shortcut = "Ctrl+Shift+Space",
  ui = "it-IT",
} = {}) {
  const browserMock = {
    i18n: { getUILanguage: () => ui },
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    commands: {
      getAll: vi
        .fn()
        .mockResolvedValue([{ name: "toggle-launcher", shortcut }]),
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      openOptionsPage: vi.fn().mockResolvedValue(undefined),
    },
  };
  globalThis.browser = browserMock;
  Object.assign(
    globalThis,
    require("../src/i18n.js"),
    require("../src/shortcut.js"),
  );
  document.body.innerHTML = HTML.slice(
    HTML.indexOf("<body>") + "<body>".length,
    HTML.indexOf("<script"),
  );
  // Run only this load's handler: earlier tests left theirs on `document`.
  let onReady;
  const spy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation((type, handler) => {
      if (type === "DOMContentLoaded") onReady = handler;
    });
  delete require.cache[require.resolve("../welcome/welcome.js")];
  require("../welcome/welcome.js");
  spy.mockRestore();
  await onReady();
  return browserMock;
}

const keys = () =>
  [...document.querySelectorAll("#qal-welcome-keys kbd")].map(
    (k) => k.textContent,
  );

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.browser;
});

describe("welcome page (B1)", () => {
  it("shows the real shortcut to press, in the user's language", async () => {
    await openWelcome();
    expect(keys()).toEqual(["Ctrl", "Shift", "Spazio"]);
    expect(document.querySelector(".qal-welcome-title").textContent).toBe(
      "Installato. Provalo adesso.",
    );
  });

  it("speaks English in an English Firefox", async () => {
    await openWelcome({ ui: "en-US" });
    expect(keys()).toEqual(["Ctrl", "Shift", "Space"]);
    expect(document.querySelector(".qal-welcome-title").textContent).toBe(
      "Installed. Try it now.",
    );
  });

  it("waits, then confirms once the shortcut is used", async () => {
    const browserMock = await openWelcome();
    const status = document.getElementById("qal-welcome-status");
    expect(status.textContent).toContain("In attesa");
    const listener = browserMock.runtime.onMessage.addListener.mock.calls[0][0];
    listener({ action: "shortcut-used" });
    expect(status.textContent).toContain("Fatto");
    expect(status.classList.contains("qal-welcome-status--done")).toBe(true);
  });

  it("says where to set a shortcut when none is set", async () => {
    await openWelcome({ shortcut: "" });
    expect(keys()).toEqual([]);
    expect(document.getElementById("qal-welcome-status").textContent).toContain(
      "impostazioni",
    );
  });

  it("both links open the settings", async () => {
    const browserMock = await openWelcome();
    document.getElementById("qal-welcome-shortcut").click();
    document.getElementById("qal-welcome-settings").click();
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
  });
});
