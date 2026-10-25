import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { cachedAssetImageSize } from '../../db/assetCache';
import { REMARK_PLUGINS, REHYPE_PLUGINS, EMBED_REHYPE_PLUGINS } from './markdownPipeline';

type MarkdownProps = ComponentProps<typeof ReactMarkdown>;

/**
 * Authors often leave alt text out, and raw HTML images may omit the attribute entirely,
 * which makes a screen reader read the file name and leaves a linked image's link unnamed.
 */
const IMAGE_FALLBACK_ALT = 'Image';

function imageDimensions(props: Pick<ComponentProps<'img'>, 'src' | 'width' | 'height'>) {
  if (
    props.width !== undefined ||
    props.height !== undefined ||
    typeof props.src !== 'string' ||
    !props.src.startsWith('blob:')
  )
    return undefined;
  return cachedAssetImageSize(props.src);
}

const MARKDOWN_COMPONENTS: MarkdownProps['components'] = {
  img: ({ node: _node, ...props }) => (
    <img
      {...imageDimensions(props)}
      {...props}
      alt={props.alt || IMAGE_FALLBACK_ALT}
      loading="lazy"
      decoding="async"
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="lacuna-table-wrap">
      <table {...props} />
    </div>
  ),
};

const ENLARGE_COMPONENTS: MarkdownProps['components'] = {
  ...MARKDOWN_COMPONENTS,
  img: ({ node, ...props }) =>
    (node?.data as { linkedImage?: boolean } | undefined)?.linkedImage ? (
      <img
        {...imageDimensions(props)}
        {...props}
        alt={props.alt || IMAGE_FALLBACK_ALT}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <button
        type="button"
        data-enlarge-image=""
        aria-label={props.alt ? `Enlarge image: ${props.alt}` : 'Enlarge image'}
      >
        {/* The button names the image, so an absent alt stays empty rather than a file name. */}
        <img
          {...imageDimensions(props)}
          {...props}
          alt={props.alt ?? ''}
          loading="lazy"
          decoding="async"
        />
      </button>
    ),
};

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

export function prepareNumericAnswer(source: string): string {
  // Four leading spaces start a code block; up to three still allow a list marker.
  return /^(?:[ \t]*\r?\n)* {0,3}\d+\.[ \t]*(?:\r?\n[ \t]*)*$/.test(source)
    ? source.replace('.', '\\.')
    : source;
}

export function renderMarkdownToHtml(
  prepared: string,
  allowEmbeds: boolean,
  enlargeImages: boolean,
): string {
  // Prefix embed-mode keys so the same source never collides across render modes.
  const cacheKey = `${enlargeImages ? '\x00I\x00' : ''}${allowEmbeds ? '\x00E\x00' : ''}${prepared}`;
  const now = Date.now();
  const cached = HTML_CACHE.get(cacheKey);
  if (cached !== undefined) {
    // Update access time on hit so LRU eviction preserves frequently-used entries.
    cached.accessedAt = now;
    return cached.html;
  }

  const rehypePlugins = allowEmbeds ? EMBED_REHYPE_PLUGINS : REHYPE_PLUGINS;

  const html = renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={rehypePlugins}
      components={enlargeImages ? ENLARGE_COMPONENTS : MARKDOWN_COMPONENTS}
      urlTransform={(url) => (url.startsWith('blob:') ? url : defaultUrlTransform(url))}
    >
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
