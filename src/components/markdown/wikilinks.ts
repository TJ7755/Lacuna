// Wikilink (`[[Note name]]`) support for lesson notes and cards.
//
// Notes pasted from Obsidian-style revision maps use `[[Note name]]` and
// `[[target|label]]` references. remark-gfm does not handle these, so without
// this plugin they render as literal brackets. This rehype plugin rewrites
// them to native, non-navigating pills — the target note may not exist on this
// device, so they deliberately render as a `span`, never a link.

interface HastText {
  type: 'text';
  value: string;
}

interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: Array<{ type: string }>;
}

interface HastParent {
  type?: string;
  tagName?: string;
  children: Array<HastText | HastElement | { type: string }>;
}

/** Match `[[target]]` or `[[target|label]]`. Targets cannot contain `]` or `|`. */
export const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

export interface WikilinkPart {
  target: string;
  label: string;
}

/** Split plain text into literal and wikilink parts. Pure helper for tests. */
export function parseWikilinkText(value: string): Array<string | WikilinkPart> {
  const parts: Array<string | WikilinkPart> = [];
  let last = 0;
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(value)) !== null) {
    if (match.index > last) parts.push(value.slice(last, match.index));
    const target = match[1].trim();
    const label = (match[2] ?? match[1]).trim();
    if (target.length > 0 && label.length > 0) {
      parts.push({ target, label });
    } else {
      parts.push(match[0]);
    }
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push(value.slice(last));
  return parts;
}

function isText(node: { type: string }): node is HastText {
  return node.type === 'text';
}

function isElement(node: { type: string }): node is HastElement {
  return node.type === 'element';
}

/**
 * Rehype plugin: replace `[[...]]` sequences in text nodes with
 * `<span class="lacuna-wikilink">` pills. Code blocks, inline code and pre
 * sections are left untouched so diagram sources and examples keep working.
 */
export function rehypeWikilinks(): (tree: unknown) => void {
  return (tree) => {
    walk(tree as HastParent, false);
  };
}

function walk(node: HastParent, insideCode: boolean): void {
  if (!Array.isArray(node.children)) return;
  const inCode = insideCode || node.tagName === 'code' || node.tagName === 'pre';
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (isElement(child)) {
      walk(child as HastParent, inCode);
      continue;
    }
    if (!isText(child) || inCode) continue;
    const parts = parseWikilinkText(child.value);
    if (parts.length === 1 && typeof parts[0] === 'string') continue;
    const replacement: Array<{ type: string }> = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        replacement.push({ type: 'text', value: part } as HastText as {
          type: string;
        });
      } else {
        replacement.push({
          type: 'element',
          tagName: 'span',
          properties: {
            className: ['lacuna-wikilink'],
            title: `Note: ${part.target}`,
          },
          children: [{ type: 'text', value: part.label } as { type: string }],
        } as unknown as { type: string });
      }
    }
    node.children.splice(
      i,
      1,
      ...(replacement as Array<HastText | HastElement | { type: string }>),
    );
  }
}
