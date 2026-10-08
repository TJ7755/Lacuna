// The Welcome course's two drawings as shown. The stored assets keep their original bytes
// (seed.ts, including its one-off repair), because an upgrade must never rewrite a user's
// records; these themed versions replace them only when displayed.
//
// An <img> cannot read the app's CSS, but its prefers-color-scheme follows the page's
// color-scheme, which index.css sets from the theme. Colours are the Direction C palette's
// ink-faint and default amber accent, light then dark.

const STYLE = `<style>
    .axis { stroke: hsl(218 12% 42%); stroke-opacity: 0.45; }
    .label { fill: hsl(218 12% 42%); font-family: system-ui, sans-serif; }
    .accent { stroke: hsl(32 90% 48%); }
    @media (prefers-color-scheme: dark) {
      .axis { stroke: hsl(220 10% 64%); }
      .label { fill: hsl(220 10% 64%); }
      .accent { stroke: hsl(34 92% 56%); }
    }
  </style>`;

const FORGETTING_CURVE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  ${STYLE}
  <line class="axis" x1="30" y1="130" x2="300" y2="130" stroke-width="1"/>
  <line class="axis" x1="30" y1="130" x2="30" y2="20" stroke-width="1"/>
  <text class="label" x="16" y="25" font-size="10">R</text>
  <text class="label" x="16" y="135" font-size="10">t</text>
  <path class="accent" d="M 30 30 Q 120 45 200 85 T 300 125" fill="none" stroke-width="2.5" stroke-linecap="round"/>
  <line class="axis" x1="30" y1="45" x2="300" y2="45" stroke-width="1" stroke-dasharray="3,3"/>
  <text class="label" x="276" y="40" font-size="9">0.90</text>
</svg>`;

const SAMPLE_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  ${STYLE}
  <rect class="axis" x="10" y="20" width="180" height="80" rx="10" fill="none" stroke-width="1.5"/>
  <circle class="axis" cx="60" cy="55" r="14" fill="none" stroke-width="1.5"/>
  <polyline class="accent" points="90,90 115,60 140,80 175,40" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Stored seed-drawing hashes (SHA-256 of seed.ts's SVG text), each version of each drawing,
 * mapped to the drawing shown in its place.
 */
const SHOWN_FOR_HASH: Readonly<Record<string, string>> = {
  // Forgetting curve: the first currentColor version, then the dark stone panel.
  '83dcc930c1010020af0ccd1d9050bad606639eee505205dd8a917dad2655fbd9': FORGETTING_CURVE,
  '6628f6d02b9b5cf6a4f3148aefd00cb660d0cc8c57a9a5d29673d51a4f0821d1': FORGETTING_CURVE,
  // Sample image, likewise.
  '7436ef10804411a2622688ffe3265842ddaec2047838e8f01c225b282ec89e14': SAMPLE_IMAGE,
  '4b0e794581633d4e3e8a44898217059d41230e2696e5fd3130c9c6d56ce8968d': SAMPLE_IMAGE,
};

/** The themed drawing to show for a stored Welcome seed asset, or undefined for any other. */
export function seedArtworkFor(hash: string): Blob | undefined {
  const svg = SHOWN_FOR_HASH[hash];
  return svg === undefined ? undefined : new Blob([svg], { type: 'image/svg+xml' });
}
