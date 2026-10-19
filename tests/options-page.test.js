import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync(
  path.join(__dirname, "../options/options.html"),
  "utf8",
);
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);

describe("options.html script order", () => {
  it("loads only scripts the page needs, dependencies first", () => {
    expect(scripts).not.toContain("../src/search-utils.js");
    expect(scripts.indexOf("../src/config-storage.js")).toBeLessThan(
      scripts.indexOf("options.js"),
    );
    expect(scripts.indexOf("../src/i18n.js")).toBeLessThan(
      scripts.indexOf("options.js"),
    );
  });
});
