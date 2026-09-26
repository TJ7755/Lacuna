import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

const plugins = [rehypeRaw, rehypeSanitize];
const elements = [
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'br',
  'a',
];

/** GitHub's Atom feed supplies HTML; release metadata may instead contain Markdown. */
export function UpdateReleaseNotes({ source }: { source: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={plugins}
      allowedElements={elements}
      components={{
        a: ({ href, children }) =>
          href && /^https?:\/\//i.test(href) ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
