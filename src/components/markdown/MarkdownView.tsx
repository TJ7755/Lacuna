import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { renderClozeBack, renderClozeFront } from './cloze';
import { cn } from '../ui/cn';

type ClozeMode = 'front' | 'back' | 'none';

interface MarkdownViewProps {
  source: string;
  /** For cloze cards: render blanks (front) or reveal highlighted answers (back). */
  clozeMode?: ClozeMode;
  className?: string;
}

/**
 * Renders Markdown with GitHub-flavoured extensions, KaTeX maths, syntax-highlighted
 * code, embedded base64 images, and optional cloze transformation. Raw HTML is enabled
 * so the cloze highlight spans render; this is safe for a local, single-user app.
 */
export function MarkdownView({ source, clozeMode = 'none', className }: MarkdownViewProps) {
  const prepared = useMemo(() => {
    if (clozeMode === 'front') return renderClozeFront(source);
    if (clozeMode === 'back') return renderClozeBack(source);
    return source;
  }, [source, clozeMode]);

  return (
    <div className={cn('prose-lacuna', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
