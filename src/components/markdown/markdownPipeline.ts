import type { ComponentProps } from 'react';
import type ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { rehypeWikilinks } from './wikilinks';
import { rehypeMermaidPlaceholder } from './mermaid';

// Stable plugin references so the unified pipeline isn't rebuilt on every call.
type MarkdownProps = ComponentProps<typeof ReactMarkdown>;
// remarkBreaks turns single newlines into hard line breaks (<br>) instead of the
// CommonMark default of merging them into the same line — this matches how users
// expect notes and cards to render when they press Enter without a blank line.
export const REMARK_PLUGINS: MarkdownProps['remarkPlugins'] = [remarkGfm, remarkMath, remarkBreaks];

/** Restricted schema that only allows the specific className patterns needed by
 *  remark-math ($...$ markers), fenced code blocks, Mermaid placeholders,
 *  wikilink pills and the table wrapper. KaTeX and highlight.js run *after*
 *  sanitisation so their generated markup is not stripped.
 */
const RESTRICTED_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'audio'],
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', 'math', 'math-inline', 'cloze-blank', 'cloze-reveal', 'lacuna-wikilink'],
      ['title'],
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'math', 'math-display', 'lacuna-table-wrap'],
    ],
    pre: [['className', 'lacuna-mermaid']],
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
    audio: ['src', 'controls', 'preload'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'blob'],
  },
};

/** Convert Lacuna's `![audio](lacuna-asset://…)` marker, after object-URL resolution,
 * into a native player. Remote images labelled "audio" remain images; only local
 * blob URLs are eligible. */
function rehypeAudioAssets(): (tree: unknown) => void {
  return (tree) => {
    walkHast(tree as HastParent, (el, i, parent) => {
      if (el.tagName !== 'img' || el.properties?.alt !== 'audio') return;
      const src = el.properties.src;
      if (typeof src !== 'string' || !src.startsWith('blob:')) return;
      parent.children[i] = {
        type: 'element',
        tagName: 'audio',
        properties: { src, controls: true, preload: 'metadata' },
        children: [],
      } as { type: string };
    });
  };
}

/** Linked diagrams keep their authored navigation rather than nesting controls. */
function rehypeLinkedImages(): (tree: unknown) => void {
  return (tree) => {
    const visit = (
      node: { tagName?: string; data?: Record<string, unknown>; children?: unknown[] },
      linked = false,
    ) => {
      if (linked && node.tagName === 'img') node.data = { ...node.data, linkedImage: true };
      node.children?.forEach((child) =>
        visit(child as typeof node, linked || node.tagName === 'a'),
      );
    };
    visit(tree as Parameters<typeof visit>[0]);
  };
}

export const REHYPE_PLUGINS: MarkdownProps['rehypePlugins'] = [
  rehypeRaw,
  rehypeAudioAssets,
  rehypeMermaidPlaceholder,
  rehypeWikilinks,
  [rehypeSanitize, RESTRICTED_SCHEMA],
  rehypeLinkedImages,
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

// ── Video embed plugin ────────────────────────────────────────────────────────

/** Match a bare YouTube watch URL, capturing the video ID. */
const YT_WATCH_RE =
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#?].*)?$/;
/** Match a bare youtu.be short URL, capturing the video ID. */
const YT_SHORT_RE = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/;
/** Match a bare Vimeo URL, capturing the numeric video ID. */
const VIMEO_RE = /^https?:\/\/(?:www\.)?vimeo\.com\/([0-9]+)(?:[/?#].*)?$/;

/** Returns the privacy-aware embed src for a recognised video URL, or null. */
function videoEmbedSrc(url: string): string | null {
  const yt = YT_WATCH_RE.exec(url) ?? YT_SHORT_RE.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vi = VIMEO_RE.exec(url);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return null;
}

// Minimal inline hast node shapes used by the embed plugins. These avoid importing
// the hast package directly (it is a transitive dependency, not a direct one).
interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<
    string,
    boolean | number | string | Array<string | number> | null | undefined
  >;
  children: Array<{ type: string }>;
}
interface HastParent {
  children: Array<{ type: string }>;
}

/**
 * Walk the hast tree depth-first (right to left so index-based splices are safe),
 * calling `fn` for every element node found.
 */
function walkHast(
  node: HastParent,
  fn: (el: HastElement, i: number, parent: HastParent) => void,
): void {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (child.type === 'element') {
      const el = child as HastElement;
      fn(el, i, node);
      walkHast(el as HastParent, fn);
    }
  }
}

/**
 * Rehype plugin factory that converts a bare YouTube or Vimeo URL on its own
 * paragraph into a responsive 16:9 iframe on the appropriate privacy-first embed
 * host. The transformer runs before sanitisation so generated iframes pass the
 * schema check.
 */
function rehypeEmbedVideos(): (tree: unknown) => void {
  return (tree) => {
    walkHast(tree as HastParent, (el, i, parent) => {
      if (el.tagName !== 'p') return;

      // Keep only non-blank children to identify a bare-URL paragraph.
      const significant = (el as HastParent).children.filter(
        (n) => !(n.type === 'text' && (n as HastText).value.trim() === ''),
      );
      if (significant.length !== 1) return;

      const only = significant[0];
      let url: string | undefined;

      if (only.type === 'element' && (only as HastElement).tagName === 'a') {
        const href = (only as HastElement).properties?.href;
        if (typeof href === 'string') url = href;
      } else if (only.type === 'text') {
        url = (only as HastText).value.trim();
      }

      if (!url) return;
      const embedSrc = videoEmbedSrc(url);
      if (!embedSrc) return;

      const iframe: HastElement = {
        type: 'element',
        tagName: 'iframe',
        properties: {
          src: embedSrc,
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowFullScreen: true,
          title: 'Embedded video',
          loading: 'lazy',
          referrerPolicy: 'strict-origin-when-cross-origin',
          className: ['w-full', 'h-full'],
        },
        children: [],
      };

      const wrapper: HastElement = {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['w-full', 'aspect-video', 'overflow-hidden', 'rounded-xl', 'my-2'],
        },
        children: [iframe as { type: string }],
      };

      parent.children[i] = wrapper as { type: string };
    });
  };
}

/**
 * Rehype plugin factory that removes any `<iframe>` elements left without a valid
 * src after sanitisation. This ensures user-authored raw iframes with disallowed
 * src values are fully stripped rather than left as sourceless shells.
 */
function rehypeStripUnsourcedIframes(): (tree: unknown) => void {
  return (tree) => {
    walkHast(tree as HastParent, (el, i, parent) => {
      if (el.tagName !== 'iframe') return;
      const src = el.properties?.src;
      if (typeof src !== 'string' || src.length === 0) {
        parent.children.splice(i, 1);
      }
    });
  };
}

// ── Sanitise schemas ──────────────────────────────────────────────────────────

/**
 * Extended sanitise schema for embed-aware rendering. Adds `<iframe>` with `src`
 * restricted by regex to the two trusted embed hosts.
 *
 * `<details>` and `<summary>` are already present in defaultSchema.tagNames, and
 * the `open` attribute is already permitted via the wildcard `*` rule, so no extra
 * entries are needed for collapsible sections.
 *
 * Allowed iframe src patterns:
 *   /^https:\/\/www\.youtube-nocookie\.com\/embed\//
 *   /^https:\/\/player\.vimeo\.com\/video\//
 */
const EMBED_SCHEMA = {
  ...RESTRICTED_SCHEMA,
  tagNames: [...(RESTRICTED_SCHEMA.tagNames ?? []), 'iframe'],
  attributes: {
    ...RESTRICTED_SCHEMA.attributes,
    // The video-embed wrapper needs its layout classes to survive sanitisation,
    // otherwise the responsive aspect-ratio box collapses to zero height. Block
    // maths (math/math-display) and the table wrapper must still be permitted
    // on div as well.
    div: [
      'itemScope',
      'itemType',
      [
        'className',
        'math',
        'math-display',
        'lacuna-table-wrap',
        'w-full',
        'aspect-video',
        'overflow-hidden',
        'rounded-xl',
        'my-2',
      ],
    ],
    span: [...(RESTRICTED_SCHEMA.attributes?.span ?? [])],
    pre: [['className', 'lacuna-mermaid']],
    iframe: [
      // src is permitted only when it matches one of the two trusted embed hosts.
      [
        'src',
        /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
        /^https:\/\/player\.vimeo\.com\/video\//,
      ],
      'allow',
      'allowFullScreen',
      'title',
      'loading',
      'referrerPolicy',
      'className',
    ],
  },
};

/** Rehype plugin pipeline for embed-aware rendering (lesson notes). */
export const EMBED_REHYPE_PLUGINS: MarkdownProps['rehypePlugins'] = [
  rehypeRaw,
  rehypeEmbedVideos,
  rehypeAudioAssets,
  rehypeMermaidPlaceholder,
  rehypeWikilinks,
  [rehypeSanitize, EMBED_SCHEMA],
  rehypeLinkedImages,
  rehypeStripUnsourcedIframes,
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];
