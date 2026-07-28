import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  compileMarkScheme,
  renderLineAsEnglish,
  suggestMarkSchemePredicates,
  type MarkSchemeCompileError,
  type PredicateName,
} from '../../items/markSchemeCompiler';
import { cn } from '../ui/cn';

interface MarkSchemeEditorProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

interface Suggestion {
  label: string;
  detail: string;
  replacement: string;
  start: number;
  end: number;
}

const PREDICATE_TEMPLATES: Record<PredicateName, string> = {
  equals: 'equals :: expression',
  within: 'within 0.01 :: value',
  'matches-one-of': 'matches-one-of :: value :: alternative',
  contains: 'contains :: text',
};

export function MarkSchemeEditor({ value, onChange, invalid = false }: MarkSchemeEditorProps) {
  const generatedId = useId();
  const sourceId = `mark-scheme-source-${generatedId}`;
  const suggestionsId = `${sourceId}-suggestions`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const compilation = useMemo(() => compileMarkScheme(value), [value]);
  const suggestions = useMemo(() => suggestionsAt(value, cursor), [value, cursor]);

  const refreshCursor = () => {
    const next = inputRef.current?.selectionStart ?? 0;
    setCursor(next);
    setActiveSuggestion(0);
  };

  const chooseSuggestion = (suggestion: Suggestion) => {
    const next = `${value.slice(0, suggestion.start)}${suggestion.replacement}${value.slice(
      suggestion.end,
    )}`;
    const nextCursor = suggestion.start + suggestion.replacement.length;
    onChange(next);
    setCursor(nextCursor);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveSuggestion((index) => (index + delta + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setCursor(-1);
    }
  };

  return (
    <section
      aria-label="Mark scheme"
      className={cn(
        'rounded-2xl border bg-surface p-5 md:p-6',
        invalid ? 'border-negative/60' : 'border-line',
      )}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Mark scheme</h2>
          <p className="mt-1 text-sm text-ink-faint">
            One criterion per line. Start with marks, then a label and check.
          </p>
        </div>
        <div className="rounded-full border border-line-strong bg-surface-raised px-3 py-1 text-sm tabular-nums text-ink-soft">
          {compilation.totalMarks} {compilation.totalMarks === 1 ? 'mark' : 'marks'} total
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative">
          <label
            htmlFor={sourceId}
            className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint"
          >
            Scheme source
          </label>
          <textarea
            ref={inputRef}
            id={sourceId}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setCursor(event.target.selectionStart);
              setActiveSuggestion(0);
            }}
            onClick={refreshCursor}
            onSelect={refreshCursor}
            onKeyDown={handleKeyDown}
            rows={12}
            spellCheck={false}
            placeholder="[1] substitution :: 2x = 8"
            aria-controls={suggestions.length > 0 ? suggestionsId : undefined}
            aria-expanded={suggestions.length > 0}
            className="w-full resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-sm leading-7 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {suggestions.length > 0 && (
            <div
              id={suggestionsId}
              role="listbox"
              aria-label="Mark scheme suggestions"
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xl shadow-black/10"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.label}-${suggestion.replacement}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestion}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  className={cn(
                    'flex w-full items-baseline gap-3 px-4 py-2.5 text-left text-sm',
                    index === activeSuggestion
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink hover:bg-ink/5',
                  )}
                >
                  <span className="font-mono font-medium">{suggestion.label}</span>
                  <span className="ml-auto text-xs text-ink-faint">{suggestion.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
            Compiled preview
          </div>
          <div className="min-h-[19rem] space-y-2 rounded-xl border border-line bg-surface-raised p-3">
            {compilation.lines.length === 0 ? (
              <div className="grid min-h-[17rem] place-items-center px-6 text-center text-sm text-ink-faint">
                Compiled criteria will appear here.
              </div>
            ) : (
              compilation.lines.map((line) =>
                line.kind === 'compiled' ? (
                  <div
                    key={line.lineNumber}
                    className="flex gap-3 rounded-lg border border-positive/20 bg-positive/5 px-3 py-2.5"
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-faint">
                      {line.lineNumber}
                    </span>
                    <p className="text-sm leading-6 text-ink">{renderLineAsEnglish(line.value)}</p>
                  </div>
                ) : (
                  <SchemeError key={line.lineNumber} error={line} />
                ),
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SchemeError({ error }: { error: MarkSchemeCompileError }) {
  const start = Math.max(0, error.column - 1);
  const end = Math.min(error.source.length, start + error.length);
  return (
    <div className="rounded-lg border border-negative/25 bg-negative/5 px-3 py-2.5">
      <div className="flex gap-3 font-mono text-sm leading-6 text-ink-soft">
        <span className="w-5 shrink-0 text-right text-xs text-negative">{error.lineNumber}</span>
        <code className="min-w-0 whitespace-pre-wrap break-words">
          {error.source.slice(0, start)}
          <span className="text-negative underline decoration-negative decoration-wavy underline-offset-4">
            {error.source.slice(start, end) || ' '}
          </span>
          {error.source.slice(end)}
        </code>
      </div>
      <p className="ml-8 mt-1 text-xs text-negative">{error.message}</p>
    </div>
  );
}

function suggestionsAt(source: string, cursor: number): Suggestion[] {
  if (cursor < 0) return [];
  const lineStart = source.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const beforeCursor = source.slice(lineStart, cursor);
  if (beforeCursor.trim() === '[') {
    return [1, 2, 3].map((marks) => ({
      label: `[${marks}]`,
      detail: `${marks} ${marks === 1 ? 'mark' : 'marks'}`,
      replacement: `[${marks}] `,
      start: lineStart + beforeCursor.indexOf('['),
      end: cursor,
    }));
  }

  const separator = beforeCursor.indexOf('::');
  if (separator === -1) return [];
  const body = beforeCursor.slice(separator + 2);
  const tokenMatch = body.match(/^\s*([a-z-]*)$/i);
  if (!tokenMatch) return [];
  const candidate = tokenMatch[1];
  const tokenStart = cursor - candidate.length;
  return suggestMarkSchemePredicates(candidate).map((predicate) => ({
    label: predicate,
    detail: PREDICATE_TEMPLATES[predicate],
    replacement: PREDICATE_TEMPLATES[predicate],
    start: tokenStart,
    end: cursor,
  }));
}
