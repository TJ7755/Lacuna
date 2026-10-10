// The repeating item colours (--hue-1 to --hue-4 in index.css), so lists such as a
// course's lessons are told apart at a glance. Class names are spelt out in full so
// Tailwind generates them.
const HUES = [
  { mark: 'border-hue-1 bg-hue-1/15', fill: 'bg-hue-1', track: 'bg-hue-1/20', text: 'text-hue-1' },
  { mark: 'border-hue-2 bg-hue-2/15', fill: 'bg-hue-2', track: 'bg-hue-2/20', text: 'text-hue-2' },
  { mark: 'border-hue-3 bg-hue-3/15', fill: 'bg-hue-3', track: 'bg-hue-3/20', text: 'text-hue-3' },
  { mark: 'border-hue-4 bg-hue-4/15', fill: 'bg-hue-4', track: 'bg-hue-4/20', text: 'text-hue-4' },
] as const;

export type Hue = (typeof HUES)[number];

/** The colour for the item at `index`, cycling through the four hues. */
export function hueAt(index: number): Hue {
  return HUES[((index % HUES.length) + HUES.length) % HUES.length];
}
