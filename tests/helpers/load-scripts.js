import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(__dirname, "../..");
const PAGES = {
  popup: "popup/popup.html",
  options: "options/options.html",
  welcome: "welcome/welcome.html",
};

export function pageFor(point) {
  return PAGES[point] ? fs.readFileSync(path.join(ROOT, PAGES[point]), "utf8") : "";
}

export function scriptsFor(point) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  if (point === "background") return manifest.background.scripts.map(resolveScript);
  if (point === "content") return manifest.content_scripts.flatMap(({ js }) => js.map(resolveScript));
  if (!Object.hasOwn(PAGES, point)) throw new Error(`Unknown loading point: ${point}`);
  const dom = new JSDOM(pageFor(point));
  try {
    return [...dom.window.document.querySelectorAll("script[src]")].map((script) =>
      path.resolve(ROOT, path.dirname(PAGES[point]), script.getAttribute("src")),
    );
  } finally {
    dom.window.close();
  }
}

function resolveScript(file) {
  return path.resolve(ROOT, file);
}
