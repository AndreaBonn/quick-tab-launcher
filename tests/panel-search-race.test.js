import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { scriptsFor, pageFor } from "./helpers/load-scripts.js";
import { createBrowserMock } from "./helpers/load-launcher.js";

const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(["content", "popup"])("%s search rejection ordering", (host) => {
  it("keeps newer results when an older search rejects", async () => {
    let rejectOld;
    const errors = vi.fn();
    const output = new VirtualConsole();
    output.on("error", errors);
    const dom = new JSDOM(pageFor(host), {
      pretendToBeVisual: true, runScripts: "outside-only", url: "https://extension.test/", virtualConsole: output,
    });
    const { window } = dom;
    const attachShadow = window.HTMLElement.prototype.attachShadow;
    window.HTMLElement.prototype.attachShadow = function (options) {
      this.testRoot = attachShadow.call(this, options);
      return this.testRoot;
    };
    window.browser = createBrowserMock({ search: ({ query }) => query === "old"
      ? new Promise((_, reject) => { rejectOld = reject; })
      : { tabs: [{ id: 42, title: "Newest page", url: "https://new.example" }], bookmarks: [], history: [] },
    });
    try {
      const loaded = new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
      for (const file of scriptsFor(host)) vm.runInContext(fs.readFileSync(file, "utf8"), dom.getInternalVMContext(), { filename: file });
      await loaded;
      await pause();
      let root = window.document;
      if (host === "content") {
        // Capture the closed root through the test-only shadow attachment boundary.
        window.browser.runtime.onMessage.addListener.mock.calls[0][0]({ action: "toggle" });
        root = window.document.getElementById("qal-shadow-host").testRoot;
        await pause();
      }
      const input = root.querySelector(".qal-input");
      const wait = window.eval("QAL_CONFIG.DEBOUNCE_MS") + 30;
      input.value = "old";
      input.dispatchEvent(new window.Event("input"));
      await pause(wait);
      input.value = "new";
      input.dispatchEvent(new window.Event("input"));
      await pause(wait);
      expect(root.querySelector(".qal-results").textContent).toContain("Newest page");
      rejectOld(new Error("Old request failed"));
      await pause();
      expect(root.querySelector(".qal-results").textContent).toContain("Newest page");
      expect(errors).not.toHaveBeenCalled();
    } finally { window.close(); }
  });
});
