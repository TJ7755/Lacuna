import type { CSSProperties } from 'react';
import './RevisionIllustrations.css';

const glyphs = [
  'cards',
  'book',
  'calendar',
  'pencil',
  'clock',
  'target',
  'flask',
  'bookmark',
  'bulb',
  'ruler',
  'headphones',
  'flag',
] as const;

type RevisionGlyphKind = (typeof glyphs)[number];

export function RevisionGlyph({ kind }: { kind: RevisionGlyphKind }) {
  return (
    <svg
      className={`revision-glyph revision-glyph-${kind}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      {kind === 'cards' && (
        <>
          <rect x="13" y="25" width="62" height="58" rx="9" fill="var(--ivory)" />
          <rect x="26" y="15" width="62" height="58" rx="9" fill="currentColor" />
          <path
            d="m43 44 10 10 18-21"
            stroke="var(--cinema)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'book' && (
        <>
          <path
            d="M12 22c14-5 25-2 38 5 13-7 24-10 38-5v56c-14-5-25-2-38 5-13-7-24-10-38-5Z"
            fill="currentColor"
          />
          <path d="M50 29v49" stroke="var(--cinema)" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      {kind === 'calendar' && (
        <>
          <rect x="15" y="20" width="70" height="66" rx="10" fill="currentColor" />
          <path
            d="M32 14v15m36-15v15"
            stroke="var(--ivory)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="m34 57 11 11 21-23"
            stroke="var(--cinema)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'pencil' && (
        <>
          <path
            d="m20 67 44-49a10 10 0 0 1 14 0l5 5a10 10 0 0 1 0 14L39 86l-24 3Z"
            fill="currentColor"
          />
          <path d="m20 67 19 19-24 3Z" fill="var(--ivory)" />
          <path d="m61 23 17 17" stroke="var(--cinema)" strokeWidth="5" />
        </>
      )}
      {kind === 'clock' && (
        <>
          <circle cx="50" cy="52" r="35" fill="currentColor" />
          <path
            d="M50 30v24l17 10"
            stroke="var(--cinema)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'target' && (
        <>
          <circle cx="48" cy="54" r="34" fill="currentColor" />
          <circle cx="48" cy="54" r="20" stroke="var(--cinema)" strokeWidth="6" />
          <path
            d="m48 54 33-35m-17 0h17v17"
            stroke="var(--ivory)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'flask' && (
        <>
          <path
            d="M36 15h28v29l22 33a7 7 0 0 1-6 11H20a7 7 0 0 1-6-11l22-33Z"
            fill="currentColor"
          />
          <path d="M34 15h32" stroke="var(--ivory)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="43" cy="64" r="6" fill="var(--cinema)" />
          <circle cx="61" cy="75" r="4" fill="var(--cinema)" />
        </>
      )}
      {kind === 'bookmark' && (
        <>
          <path d="M27 13h46v75L50 73 27 88Z" fill="currentColor" />
          <path
            d="m39 43 8 8 15-17"
            stroke="var(--cinema)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'bulb' && (
        <>
          <path
            d="M50 13a28 28 0 0 1 20 48c-5 5-7 10-7 15H37c0-5-2-10-7-15a28 28 0 0 1 20-48Z"
            fill="currentColor"
          />
          <path d="M39 86h22" stroke="var(--ivory)" strokeWidth="7" strokeLinecap="round" />
          <path
            d="m42 43 8 9 8-9m-8 9v19"
            stroke="var(--cinema)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'ruler' && (
        <>
          <rect x="14" y="31" width="74" height="38" rx="6" fill="currentColor" />
          <path d="M29 31v14m15-14v23m15-23v14m15-14v23" stroke="var(--cinema)" strokeWidth="5" />
        </>
      )}
      {kind === 'headphones' && (
        <>
          <path
            d="M21 60V45a29 29 0 0 1 58 0v15"
            stroke="currentColor"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <rect x="13" y="49" width="22" height="35" rx="9" fill="currentColor" />
          <rect x="65" y="49" width="22" height="35" rx="9" fill="currentColor" />
        </>
      )}
      {kind === 'flag' && (
        <>
          <path d="M28 17h55L72 36l11 19H28Z" fill="currentColor" />
          <path d="M28 17v70" stroke="var(--ivory)" strokeWidth="7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function RevisionIllustrations() {
  return (
    <span className="revision-reel" aria-hidden="true">
      {glyphs.map((kind, index) => (
        <span
          key={kind}
          className="revision-object"
          style={{ '--object-index': index } as CSSProperties}
        >
          <RevisionGlyph kind={kind} />
        </span>
      ))}
    </span>
  );
}
