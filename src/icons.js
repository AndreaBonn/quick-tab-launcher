/**
 * Monochrome line icons drawn with the current text color.
 * Built through the DOM (no innerHTML) so they work inside the closed shadow root
 * and under the extension CSP.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_SHAPES = {
  search: [
    ["circle", { cx: 7, cy: 7, r: 4.5 }],
    ["path", { d: "M10.5 10.5 14 14" }],
  ],
  tabs: [
    ["rect", { x: 2, y: 4.5, width: 12, height: 9, rx: 1.5 }],
    ["path", { d: "M2 7.5h12M5 4.5V3h4v1.5" }],
  ],
  star: [
    [
      "path",
      {
        d: "M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z",
      },
    ],
  ],
  clock: [
    ["circle", { cx: 8, cy: 8, r: 6 }],
    ["path", { d: "M8 4.5V8l2.5 1.5" }],
  ],
  restore: [
    ["path", { d: "M3 8a5 5 0 1 0 1.5-3.5" }],
    ["path", { d: "M3 2.5V5h2.5" }],
  ],
  bolt: [["path", { d: "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" }]],
  gear: [
    ["circle", { cx: 8, cy: 8, r: 2.2 }],
    [
      "path",
      {
        d: "M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
      },
    ],
  ],
  close: [["path", { d: "M4.5 4.5l7 7M11.5 4.5l-7 7" }]],
  trash: [["path", { d: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9" }]],
  copies: [
    ["rect", { x: 2.5, y: 2.5, width: 8, height: 8, rx: 1.5 }],
    ["path", { d: "M5.5 13.5h8v-8" }],
  ],
  duplicate: [
    ["rect", { x: 5, y: 5, width: 8.5, height: 8.5, rx: 1.5 }],
    ["path", { d: "M3 10.5v-7a1 1 0 0 1 1-1h6.5" }],
  ],
  mute: [
    ["path", { d: "M2.5 6H5l3.5-3v10L5 10H2.5z" }],
    ["path", { d: "M11 6l3 4M14 6l-3 4" }],
  ],
  sound: [
    ["path", { d: "M2.5 6H5l3.5-3v10L5 10H2.5z" }],
    ["path", { d: "M11 5.5a3.5 3.5 0 0 1 0 5" }],
  ],
  pin: [
    ["path", { d: "M6 2h4l-.5 4 2 2H4.5l2-2z" }],
    ["path", { d: "M8 8v6" }],
  ],
  unpin: [
    ["path", { d: "M6 2h4l-.5 4 2 2H4.5l2-2z" }],
    ["path", { d: "M8 8v6M2.5 2.5l11 11" }],
  ],
  sort: [["path", { d: "M3 4h6M3 8h4M3 12h2M12 3v10M10 11l2 2 2-2" }]],
};

const DEFAULT_ICON_SIZE = 16;

/**
 * Creates an inline SVG icon.
 *
 * @param {string} name - Key of ICON_SHAPES.
 * @param {number} [size] - Width and height in px.
 * @returns {SVGElement|null} The icon, or null for an unknown name.
 */
function createIcon(name, size = DEFAULT_ICON_SIZE) {
  const shapes = ICON_SHAPES[name];
  if (!shapes) return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  const attrs = {
    viewBox: "0 0 16 16",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  };
  for (const [key, value] of Object.entries(attrs)) {
    svg.setAttribute(key, String(value));
  }
  svg.classList.add("qal-icon");
  for (const [tag, shapeAttrs] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(shapeAttrs)) {
      shape.setAttribute(key, String(value));
    }
    svg.appendChild(shape);
  }
  return svg;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ICON_SHAPES, createIcon };
}
