import { memo, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { renderClozeBack, renderClozeFront } from './cloze';
import { cn } from '../ui/cn';
import { ASSET_PROTOCOL } from '../../db/assets';
import { resolveAssetMarkdownCached } from '../../db/assetCache';

type ClozeMode = 'front' | 'back' | 'none';

interface MarkdownViewProps {
  source: string;
  /** For cloze cards: render blanks (front) or reveal highlighted answers (back). */
  clozeMode?: ClozeMode;
  className?: string;
  /**
   * Opt-in to embed-aware rendering: collapsible `<details>` blocks and YouTube /
   * Vimeo video embeds. Must only be set for trusted content such as lesson notes.
   * Card rendering always uses the default (false) — do not set this on untrusted
   * or imported content.
   */
  allowEmbeds?: boolean;
}

// Stable plugin references so the unified pipeline isn't rebuilt on every call.
type MarkdownProps = ComponentProps<typeof ReactMarkdown>;
const REMARK_PLUGINS: MarkdownProps['remarkPlugins'] = [remarkGfm, remarkMath];

/** Restricted schema that only allows the specific className patterns needed by
 *  remark-math ($...$ markers) and fenced code blocks. KaTeX and highlight.js
 *  run *after* sanitisation so their generated markup is not stripped.
 */
const RESTRICTED_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ['className', 'math', 'math-inline']],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', 'math', 'math-display']],
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
  },
};

const REHYPE_PLUGINS: MarkdownProps['rehypePlugins'] = [
  rehypeRaw,
  [rehypeSanitize, RESTRICTED_SCHEMA],
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
  properties?: Record<string, boolean | number | string | Array<string | number> | null | undefined>;
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
    // maths (math/math-display) must still be permitted on div as well.
    div: [
      'itemScope',
      'itemType',
      [
        'className',
        'math',
        'math-display',
        'w-full',
        'aspect-video',
        'overflow-hidden',
        'rounded-xl',
        'my-2',
      ],
    ],
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
const EMBED_REHYPE_PLUGINS: MarkdownProps['rehypePlugins'] = [
  rehypeRaw,
  rehypeEmbedVideos,
  [rehypeSanitize, EMBED_SCHEMA],
  rehypeStripUnsourcedIframes,
  rehypeKatex,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

/**
 * Rendering a card through remark + KaTeX + highlight.js is expensive, and the same
 * source is rendered over and over: once per card row, again on every tab switch
 * (which remounts the list), and again whenever an unrelated parent state changes.
 *
 * The output for a given source is static, so we parse each unique string once and
 * cache the resulting HTML. Subsequent renders — including fresh mounts after a tab
 * switch — become a Map lookup plus an innerHTML assignment. The cache is bounded
 * with simple FIFO eviction so the live editor preview (a new string per keystroke)
 * can't grow it without limit.
 *
 * Cache keys are namespaced by render mode: embed-aware and restricted renders of
 * the same source string produce different HTML and must not share a cache entry.
 * The null-byte prefix ('\x00E\x00') cannot appear in valid Markdown, preventing
 * collisions between the two namespaces.
 */
interface CacheEntry {
  html: string;
  accessedAt: number;
}

const HTML_CACHE = new Map<string, CacheEntry>();
const DEFAULT_CACHE_LIMIT = 600;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cacheLimit = DEFAULT_CACHE_LIMIT;

function evictStaleEntries(now: number): void {
  const cutoff = now - CACHE_TTL_MS;
  for (const [key, entry] of HTML_CACHE) {
    if (entry.accessedAt < cutoff) {
      HTML_CACHE.delete(key);
    }
  }
}

/** Evict the single least-recently-used entry (oldest accessedAt). */
function evictLru(): void {
  let oldestKey: string | undefined;
  let oldestTime = Infinity;
  for (const [key, entry] of HTML_CACHE) {
    if (entry.accessedAt < oldestTime) {
      oldestTime = entry.accessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) HTML_CACHE.delete(oldestKey);
}

function renderMarkdownToHtml(prepared: string, allowEmbeds: boolean): string {
  // Prefix embed-mode keys so the same source never collides across render modes.
  const cacheKey = allowEmbeds ? '\x00E\x00' + prepared : prepared;
  const now = Date.now();
  const cached = HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    // Update access time on hit so LRU eviction preserves frequently-used entries.
    cached.accessedAt = now;
    return cached.html;
  }

  const rehypePlugins = allowEmbeds ? EMBED_REHYPE_PLUGINS : REHYPE_PLUGINS;

  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={rehypePlugins}>
      {prepared}
    </ReactMarkdown>,
  );

  if (HTML_CACHE.size >= cacheLimit) {
    evictStaleEntries(now);
  }
  if (HTML_CACHE.size >= cacheLimit) {
    evictLru();
  }
  HTML_CACHE.set(cacheKey, { html, accessedAt: now });
  return html;
}

/**
 * Renders Markdown with GitHub-flavoured extensions, KaTeX maths, syntax-highlighted
 * code, embedded base64 images, and optional cloze transformation. Raw HTML is enabled
 * so the cloze highlight spans render, then passed through rehype-sanitize to strip any
 * dangerous elements or attributes introduced by user content (e.g. from imported shared decks).
 *
 * Memoised, and backed by a parse cache (see `renderMarkdownToHtml`), so re-renders and
 * remounts are cheap — the heavy markdown pipeline runs at most once per unique source.
 */
export const MarkdownView = memo(function MarkdownView({
  source,
  clozeMode = 'none',
  className,
  allowEmbeds = false,
}: MarkdownViewProps) {
  const [resolved, setResolved] = useState(source);

  // Track the source we have already resolved so the effect can distinguish
  // "source prop changed" (do work) from "effect re-fired with the same source"
  // (do nothing). This preserves the user's text selection across re-renders
  // and avoids re-parsing the HTML when nothing actually changed.
  const lastResolvedSource = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Same source we already resolved for — nothing to do.
    if (lastResolvedSource.current === source) {
      return () => {};
    }

    if (!source.includes(ASSET_PROTOCOL)) {
      // No assets to resolve. Sync resolved to the new source and remember it
      // so subsequent effect re-fires (e.g. parent re-renders) become no-ops.
      lastResolvedSource.current = source;
      setResolved((prev) => (prev === source ? prev : source));
      return () => {};
    }

    void resolveAssetMarkdownCached(source).then((markdown) => {
      if (cancelled) return;
      lastResolvedSource.current = source;
      setResolved((prev) => (prev === markdown ? prev : markdown));
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  const html = useMemo(() => {
    const prepared =
      clozeMode === 'front'
        ? renderClozeFront(resolved)
        : clozeMode === 'back'
          ? renderClozeBack(resolved)
          : resolved;
    return renderMarkdownToHtml(prepared, allowEmbeds);
  }, [resolved, clozeMode, allowEmbeds]);

  return (
    <div
      className={cn('prose-lacuna', className)}
      dangerouslySetInnerHTML={{ __html: html }}
      tabIndex={-1}
    />
  );
});
