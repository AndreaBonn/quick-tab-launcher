import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const filename = path.resolve(__dirname, "../content/extract-content.js");
const source = fs.readFileSync(filename, "utf8");

describe("page text extraction for executeScript", () => {
  it("returns rendered body text unchanged, including whitespace and Unicode", () => {
    const innerText = "  Fattura già pagata\n€42\n";
    const document = { body: { innerText, textContent: "Hidden text is excluded" } };

    expect(vm.runInNewContext(source, { document }, { filename })).toBe(innerText);
  });

  it("returns an empty string when the document has no body", () => {
    expect(vm.runInNewContext(source, { document: { body: null } }, { filename })).toBe("");
    expect(vm.runInNewContext(source, { document: { body: { innerText: "Visible text" } } }, { filename })).toBe("Visible text");
  });

  it("returns an empty string for a body with no rendered text", () => {
    const document = { body: { innerText: "", textContent: "Hidden content" } };

    expect(vm.runInNewContext(source, { document }, { filename })).toBe("");
    document.body.innerText = "Now visible";
    expect(vm.runInNewContext(source, { document }, { filename })).toBe("Now visible");
  });
});
