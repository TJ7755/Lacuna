import { typedAnswerFeedbackHtml, type TypedAnswerFeedback } from './typedAnswerFeedback';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderClozeBack, renderClozeFront } from '../../utils/cloze';
import { renderMermaidDiagrams, updateMermaidTheme } from './mermaid';
import { cn } from '../ui/cn';
import { ASSET_PROTOCOL } from '../../db/assets';
import { resolveAssetMarkdownCached, resolveCachedAssetMarkdown } from '../../db/assetCache';
import { readAudioSettings } from '../../state/audioSettings';
import { useOptionalMarkdown } from './optionalMarkdown';
import { MarkdownImageViewer } from './MarkdownImageViewer';
import { ContentDisclosure } from '../ui/ContentDisclosure';
import { prepareNumericAnswer, renderMarkdownToHtml } from './markdownRenderer';

export { markdownAnswerCorrect, markdownPlainText, markdownAnswerShape } from './markdownAnswers';

type ClozeMode = 'front' | 'back' | 'none';

interface MarkdownViewProps {
  source: string;
  /** Treat a whole card answer such as `1871.` as text rather than an empty list. */
  literalNumericAnswer?: boolean;
  /** For cloze cards: render blanks (front) or reveal highlighted answers (back). */
  clozeMode?: ClozeMode;
  className?: string;
  /**
   * Opt-in to embed-aware rendering: collapsible `<details>` blocks and YouTube /
   * Vimeo video embeds. Lesson notes use this path, including notes imported from
   * shared courses, so its iframe sanitisation must remain strict. Card rendering
   * uses the default (false).
   */
  allowEmbeds?: boolean;
  /** Play embedded card audio when this rendered face is mounted in Learn mode. */
  audioAutoplay?: boolean;
  /** Open diagrams without leaving the current response. */
  enlargeImages?: boolean;
  typedAnswerFeedback?: TypedAnswerFeedback;
}

/**
 * Renders Markdown with GitHub-flavoured extensions, KaTeX maths, syntax-highlighted
 * code, Mermaid diagrams, wikilink pills, embedded base64 images, and optional
 * cloze transformation. Raw HTML is enabled so the cloze highlight spans render,
 * then passed through rehype-sanitize to strip any dangerous elements or
 * attributes introduced by user content (e.g. from imported shared decks).
 * Mermaid blocks render client-side to theme-aware SVG; failures keep the
 * source code readable.
 *
 * Memoised, and backed by a parse cache (see `renderMarkdownToHtml`), so re-renders and
 * remounts are cheap — the heavy markdown pipeline runs at most once per unique source.
 */
export const MarkdownView = memo(function MarkdownView({
  source,
  literalNumericAnswer = false,
  clozeMode = 'none',
  className,
  allowEmbeds = false,
  audioAutoplay = false,
  enlargeImages = false,
  typedAnswerFeedback,
}: MarkdownViewProps) {
  const [resolved, setResolved] = useState(() =>
    source.includes(ASSET_PROTOCOL) ? resolveCachedAssetMarkdown(source) : source,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagramSources, setDiagramSources] = useState<{
    html: string;
    sources: { host: HTMLElement; source: string }[];
  } | null>(null);

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

  const optionalPlugins = useOptionalMarkdown(resolved);

  const html = useMemo(() => {
    let prepared =
      clozeMode === 'front'
        ? renderClozeFront(resolved)
        : clozeMode === 'back'
          ? renderClozeBack(resolved)
          : resolved;
    if (literalNumericAnswer) prepared = prepareNumericAnswer(prepared);
    const rendered = renderMarkdownToHtml(prepared, allowEmbeds, enlargeImages, optionalPlugins);
    return typedAnswerFeedback
      ? typedAnswerFeedbackHtml(rendered, typedAnswerFeedback, clozeMode === 'back')
      : rendered;
  }, [
    resolved,
    clozeMode,
    literalNumericAnswer,
    allowEmbeds,
    enlargeImages,
    typedAnswerFeedback,
    optionalPlugins,
  ]);

  useEffect(() => {
    const players = containerRef.current?.querySelectorAll('audio') ?? [];
    if (players.length === 0) return;
    const settings = readAudioSettings();
    players.forEach((player) => {
      player.playbackRate = settings.playbackSpeed;
      if (audioAutoplay && settings.autoplay) void player.play().catch(() => {});
    });
  }, [html, audioAutoplay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!container.querySelector('pre.lacuna-mermaid')) return;
    let cancelled = false;
    void renderMermaidDiagrams(container)
      .then(() => {
        if (cancelled) return;
        // Cached Markdown stays static HTML; React owns each interactive source disclosure
        // through a separate host without rebuilding the rendered document.
        const sources = Array.from(container.querySelectorAll('.lacuna-mermaid-source')).map(
          (fallback) => {
            const source = fallback.querySelector('code')?.textContent ?? '';
            const host = document.createElement('div');
            host.className = 'lacuna-mermaid-source';
            fallback.replaceWith(host);
            return { host, source };
          },
        );
        setDiagramSources({ html, sources });
      })
      .catch(() => {
        if (!cancelled) container.setAttribute('data-mermaid-failed', 'true');
      });
    // Diagrams bake resolved tokens into their SVG, including the selected accent.
    const observer = new MutationObserver(() => {
      if (cancelled) return;
      void updateMermaidTheme(container).catch(() => {});
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent', 'style'],
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [html]);

  const content = (
    <>
      <div
        ref={containerRef}
        className={cn('prose-lacuna', className)}
        dangerouslySetInnerHTML={{ __html: html }}
        tabIndex={-1}
      />
      {diagramSources?.html === html &&
        diagramSources.sources.map(({ host, source }, index) =>
          createPortal(
            <ContentDisclosure label="Diagram source">
              <pre>
                <code>{source}</code>
              </pre>
            </ContentDisclosure>,
            host,
            String(index),
          ),
        )}
    </>
  );
  return enlargeImages ? (
    <MarkdownImageViewer key={source}>{content}</MarkdownImageViewer>
  ) : (
    content
  );
});
