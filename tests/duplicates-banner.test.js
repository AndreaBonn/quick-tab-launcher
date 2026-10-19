import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserMock } from "./helpers/load-launcher.js";

for (const file of ["config-storage", "i18n", "icons", "render-utils", "render-states", "render-views"]) {
  Object.assign(globalThis, require(`../src/${file}.js`));
}
const { createDuplicatesBanner, duplicateSignature } = require("../content/duplicates-banner.js");
const summary = { count: 2, groups: [{ url: "https://example.com", extra: 2 }] };
const dismissedKey = "qal_duplicates_dismissed";

function setup(replies = {}) {
  const browser = createBrowserMock({ "get-duplicate-count": summary, ...replies });
  const slot = document.createElement("div");
  const onClosed = vi.fn();
  const warn = vi.fn();
  const active = { value: true };
  const banner = createDuplicatesBanner({
    slot, browser, onClosed, warn, isActive: () => active.value,
  });
  return { browser, slot, onClosed, warn, active, banner };
}

beforeEach(() => setLocaleFromStorage("en"));

describe("duplicate signature", () => {
  it("includes the count, page URL and extra tab count in their original order", () => {
    expect(duplicateSignature(summary)).toBe("2|https://example.com#2");
    expect(duplicateSignature({ count: 0 })).toBe("0");
    expect(duplicateSignature({ count: 3, groups: [
      { url: "https://b.com", extra: 1 }, { url: "https://a.com", extra: 2 },
    ] })).toBe("3|https://b.com#1|https://a.com#2");
  });
});

describe("duplicates banner", () => {
  it("requests a summary and renders the real translated banner into its slot", async () => {
    const p = setup();
    await p.banner.checkDuplicates();
    expect(p.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "get-duplicate-count" });
    expect(p.browser.storage.local.get).toHaveBeenCalledWith(dismissedKey);
    expect(p.slot.querySelector(".qal-duplicate-banner").textContent).toContain(tCount("duplicates.banner", 2));
    expect(p.slot.querySelector(".qal-duplicate-dismiss").textContent).toBe(t("duplicates.dismiss"));
    expect(p.warn).not.toHaveBeenCalled();
  });

  it("persists dismissal, ignores the same set on a new controller and shows a changed set", async () => {
    const p = setup();
    await p.banner.checkDuplicates();
    p.banner.dismiss(p.slot.querySelector(".qal-duplicate-banner"));
    expect(p.slot.childElementCount).toBe(0);
    expect(p.browser.storage.local.set).toHaveBeenCalledWith({ [dismissedKey]: "2|https://example.com#2" });
    const reopened = createDuplicatesBanner({ slot: p.slot, browser: p.browser, isActive: () => true, onClosed: p.onClosed });
    await reopened.checkDuplicates();
    expect(p.slot.childElementCount).toBe(0);
    p.browser.runtime.sendMessage.mockResolvedValue({ count: 2, groups: [{ url: "https://changed.com", extra: 2 }] });
    await reopened.checkDuplicates();
    expect(p.slot.querySelector(".qal-duplicate-banner")).not.toBeNull();
  });

  it.each([null, { count: 0 }, { count: -1 }])("ignores an empty summary %j and subsequently renders duplicates", async (empty) => {
    const p = setup({ "get-duplicate-count": empty === null ? () => null : empty });
    await p.banner.checkDuplicates();
    expect(p.slot.childElementCount).toBe(0);
    expect(p.browser.storage.local.get).not.toHaveBeenCalled();
    p.browser.runtime.sendMessage.mockResolvedValue(summary);
    await p.banner.checkDuplicates();
    expect(p.slot.querySelector(".qal-duplicate-banner")).not.toBeNull();
    expect(p.browser.storage.local.get).toHaveBeenCalledWith(dismissedKey);
  });

  it("checks visibility after the message reply", async () => {
    let resolve;
    const p = setup({ "get-duplicate-count": () => new Promise((done) => { resolve = done; }) });
    const pending = p.banner.checkDuplicates();
    p.active.value = false;
    resolve(summary);
    await pending;
    expect(p.slot.childElementCount).toBe(0);
    p.active.value = true;
    p.browser.runtime.sendMessage.mockResolvedValue(summary);
    await p.banner.checkDuplicates();
    expect(p.slot.querySelector(".qal-duplicate-banner")).not.toBeNull();
  });

  it("checks visibility again after reading dismissed state", async () => {
    const p = setup();
    p.browser.storage.local.get.mockImplementationOnce(async () => {
      p.active.value = false;
      return {};
    });
    await p.banner.checkDuplicates();
    expect(p.slot.childElementCount).toBe(0);
    p.active.value = true;
    await p.banner.checkDuplicates();
    expect(p.slot.querySelector(".qal-duplicate-banner")).not.toBeNull();
  });

  it.each([{ closed: 2 }, {}, null])("removes the banner and notifies onClosed with the reply %j", async (result) => {
    const p = setup({ "close-duplicates": () => result });
    await p.banner.checkDuplicates();
    const pending = p.banner.closeDuplicatesFromBanner(p.slot.firstElementChild);
    expect(p.slot.childElementCount).toBe(0);
    await pending;
    expect(p.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "close-duplicates" });
    expect(p.onClosed).toHaveBeenCalledExactlyOnceWith(result?.closed ?? 0);
    expect(p.warn).not.toHaveBeenCalled();
  });

  it.each(["message", "storage"])("logs a failed %s check and renders again after recovery", async (boundary) => {
    const p = setup();
    const error = new Error("Unavailable");
    const method = boundary === "message" ? p.browser.runtime.sendMessage : p.browser.storage.local.get;
    method.mockRejectedValueOnce(error);
    await p.banner.checkDuplicates();
    expect(p.warn).toHaveBeenCalledExactlyOnceWith("Quick TAB Launcher: duplicate check failed", error);
    expect(p.slot.childElementCount).toBe(0);
    await p.banner.checkDuplicates();
    expect(p.slot.querySelector(".qal-duplicate-banner")).not.toBeNull();
  });

  it("logs a failed dismissal save", async () => {
    const p = setup();
    const error = new Error("Storage unavailable");
    await p.banner.checkDuplicates();
    p.browser.storage.local.set.mockRejectedValueOnce(error);
    p.banner.dismiss(p.slot.firstElementChild);
    await Promise.resolve();
    expect(p.slot.childElementCount).toBe(0);
    expect(p.warn).toHaveBeenCalledExactlyOnceWith("Quick TAB Launcher: save failed", error);
  });

  it("logs closing failures without notifying success and notifies on a subsequent success", async () => {
    const p = setup({ "close-duplicates": { closed: 2 } });
    const error = new Error("Closing failed");
    await p.banner.checkDuplicates();
    p.browser.runtime.sendMessage.mockRejectedValueOnce(error);
    await p.banner.closeDuplicatesFromBanner(p.slot.firstElementChild);
    expect(p.warn).toHaveBeenCalledExactlyOnceWith("Quick TAB Launcher: closing duplicates failed", error);
    expect(p.onClosed).not.toHaveBeenCalled();
    await p.banner.checkDuplicates();
    await p.banner.closeDuplicatesFromBanner(p.slot.firstElementChild);
    expect(p.onClosed).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("routes nested button clicks and leaves unrelated clicks alone", async () => {
    const p = setup({ "close-duplicates": { closed: 2 } });
    p.slot.addEventListener("click", p.banner.handleClick);
    const parent = document.createElement("div");
    const bubbled = vi.fn();
    parent.append(p.slot);
    parent.addEventListener("click", bubbled);
    await p.banner.checkDuplicates();
    p.slot.firstElementChild.click();
    expect(bubbled).toHaveBeenCalledTimes(1);
    const nested = document.createElement("span");
    p.slot.querySelector(".qal-duplicate-dismiss").append(nested);
    nested.click();
    expect(p.slot.childElementCount).toBe(0);
    expect(bubbled).toHaveBeenCalledTimes(1);
    expect(p.browser.store[dismissedKey]).toBe(duplicateSignature(summary));
    delete p.browser.store[dismissedKey];
    await p.banner.checkDuplicates();
    p.slot.querySelector(".qal-duplicate-action").click();
    await Promise.resolve();
    expect(p.onClosed).toHaveBeenCalledExactlyOnceWith(2);
    expect(bubbled).toHaveBeenCalledTimes(1);
  });

  it("supports an injected renderer and keeps dismissed signatures separate per controller", async () => {
    const p = setup();
    const renderBanner = vi.fn((slot, reply) => { slot.textContent = `Duplicates: ${reply.count}`; });
    const other = setup({ "get-duplicate-count": { count: 1 } });
    const custom = createDuplicatesBanner({ slot: p.slot, browser: p.browser, isActive: () => true, onClosed: p.onClosed, renderBanner });
    await custom.checkDuplicates();
    expect(renderBanner).toHaveBeenCalledWith(p.slot, summary);
    expect(p.slot.textContent).toBe("Duplicates: 2");
    await other.banner.checkDuplicates();
    other.banner.dismiss(other.slot.firstElementChild);
    expect(other.browser.store[dismissedKey]).toBe("1");
    expect(p.browser.store).toEqual({});
  });
});
