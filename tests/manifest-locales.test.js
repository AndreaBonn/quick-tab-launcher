import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const manifestText = fs.readFileSync(path.join(root, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const placeholders = [...manifestText.matchAll(/__MSG_(\w+)__/g)].map(
  (m) => m[1],
);

describe("manifest localization (L1)", () => {
  it("declares a default locale that exists", () => {
    expect(manifest.default_locale).toBe("en");
    expect(fs.existsSync(path.join(root, "_locales/en/messages.json"))).toBe(
      true,
    );
  });

  it("uses translated text for the description and the shortcut", () => {
    expect(placeholders).toEqual(
      expect.arrayContaining(["extensionDescription", "commandToggle"]),
    );
  });

  for (const locale of ["en", "it"]) {
    it(`${locale} defines every message the manifest uses`, () => {
      const messages = JSON.parse(
        fs.readFileSync(
          path.join(root, `_locales/${locale}/messages.json`),
          "utf8",
        ),
      );
      for (const key of placeholders) {
        expect(messages[key]?.message, `${locale}: ${key}`).toBeTruthy();
      }
    });
  }
});

describe("web search permission (R9)", () => {
  it("is optional, so updating users are not asked for it", () => {
    expect(manifest.optional_permissions).toContain("search");
    expect(manifest.permissions).not.toContain("search");
  });
});
