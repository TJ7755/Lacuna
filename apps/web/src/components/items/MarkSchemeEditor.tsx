import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { MeasuredHeight } from '../ui/MeasuredHeight';
import { StepSwap } from '../ui/StepSwap';
import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { useId, useMemo, useRef, useState, type Ref, type KeyboardEvent } from 'react';
import type { ItemFixture, MarkSchemeLine } from '@lacuna/core/db/types';
import {
  compileMarkScheme,
  renderLineAsEnglish,
  suggestMarkSchemePredicates,
  type MarkSchemeCompileError,
  type PredicateName,
} from '../../items/markSchemeCompiler';
import { verifyWorkingLines } from '../../items/verify';
import { runWorkingFixtures } from '../../items/fixtureRunner';
import { makeId } from '../../utils/id';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';

interface MarkSchemeEditorProps {
  value: string;
  onChange: (value: string) => void;
  fixtures?: ItemFixture[];
  onFixturesChange?: (fixtures: ItemFixture[]) => void;
  onDraftMarkScheme?: () => void;
  draftDisabled?: boolean;
  invalid?: boolean;
  sourceRef?: Ref<HTMLTextAreaElement>;
  onTabForward?: () => void;
  onTabBackward?: () => void;
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

export function MarkSchemeEditor({
  value,
  onChange,
  fixtures = [],
  onFixturesChange,
  onDraftMarkScheme,
  draftDisabled = false,
  invalid = false,
  sourceRef,
  onTabForward,
  onTabBackward,
}: MarkSchemeEditorProps) {
  const generatedId = useId();
  const sourceId = `mark-scheme-source-${generatedId}`;
  const suggestionsId = `${sourceId}-suggestions`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [testAnswer, setTestAnswer] = useState('');
  const compilation = useMemo(() => compileMarkScheme(value), [value]);
  const suggestions = useMemo(() => suggestionsAt(value, cursor), [value, cursor]);
  const scheme = useMemo(
    () => compilation.lines.flatMap((line) => (line.kind === 'compiled' ? [line.value] : [])),
    [compilation],
  );
  const schemeValid =
    scheme.length > 0 && compilation.lines.every((line) => line.kind === 'compiled');
  const testLines = useMemo(() => answerLines(testAnswer), [testAnswer]);
  const testResult = useMemo(
    () => (schemeValid ? verifyWorkingLines(testLines, scheme, 'authoring-preview') : null),
    [scheme, schemeValid, testLines],
  );

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
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    if (suggestions.length === 0 || (event.key === 'Tab' && event.shiftKey)) {
      if (event.key === 'Tab') {
        const moveFocus = event.shiftKey ? onTabBackward : onTabForward;
        if (moveFocus) {
          moveFocus();
          if (document.activeElement !== event.currentTarget) event.preventDefault();
        }
      }
      return;
    }
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
        'rounded-3xl border bg-surface p-5 md:p-6',
        invalid ? 'border-negative/60' : 'border-line',
      )}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Mark scheme</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDraftMarkScheme && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={draftDisabled}
              onClick={onDraftMarkScheme}
            >
              Draft mark scheme
            </Button>
          )}
          <div className="rounded-full bg-ink/5 px-3 py-1.5 text-sm tabular-nums text-ink-soft">
            {compilation.totalMarks} {compilation.totalMarks === 1 ? 'mark' : 'marks'} total
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative">
          <label htmlFor={sourceId} className={`${fieldLabelClassName} mb-2`}>
            Scheme source
          </label>
          <textarea
            ref={(node) => {
              inputRef.current = node;
              if (typeof sourceRef === 'function') sourceRef(node);
              else if (sourceRef) sourceRef.current = node;
            }}
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
            className={`${inputFrameClassName} w-full resize-y font-mono text-sm leading-7 transition-colors`}
          />
          {suggestions.length > 0 && (
            <div
              id={suggestionsId}
              role="listbox"
              aria-label="Mark scheme suggestions"
              className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-3xl bg-surface card-surface"
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
                    'flex min-h-11 w-full flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink',
                    index === activeSuggestion
                      ? 'bg-accent-soft text-accent-ink'
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
          <h3 className="mb-2 font-display text-lg text-ink">Compiled preview</h3>
          <div className="min-h-[19rem] space-y-2 rounded-2xl bg-ink/[0.04] p-3">
            {compilation.lines.length === 0 ? (
              <div className="grid min-h-[17rem] place-items-center px-6 text-center text-sm text-ink-faint">
                Compiled criteria will appear here.
              </div>
            ) : (
              compilation.lines.map((line) =>
                line.kind === 'compiled' ? (
                  <div
                    key={line.lineNumber}
                    className="flex gap-3 rounded-2xl bg-surface px-4 py-3"
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

      <div className="mt-5 border-t border-line pt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-ink">Test answer</h3>
          </div>
          {testResult && (
            <div className="rounded-full bg-ink/5 px-3 py-1.5 text-sm tabular-nums text-ink-soft">
              {testResult.marksEarned} / {testResult.marksAvailable} marks
            </div>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]">
          <div>
            <label htmlFor={`${sourceId}-test`} className="sr-only">
              Test student answer
            </label>
            <textarea
              id={`${sourceId}-test`}
              value={testAnswer}
              onChange={(event) => setTestAnswer(event.target.value)}
              rows={6}
              placeholder="2x = 8\nx = 4"
              className={`${inputFrameClassName} w-full resize-y font-mono text-sm leading-7 transition-colors`}
            />
            {!schemeValid && (
              <p className="mt-2 text-xs text-negative">
                Fix every scheme error before testing answers.
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-ink/[0.04] p-3">
            <MeasuredHeight>
              <StepSwap stepKey={!testResult || testLines.length === 0 ? 'empty' : 'result'}>
                {!testResult || testLines.length === 0 ? (
                  <div className="grid min-h-32 place-items-center px-4 text-center text-sm text-ink-faint">
                    Line-by-line verdicts will appear here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {testResult.lineVerdicts.map((verdict, index) => (
                      <div
                        key={`${index}-${verdict.studentLine}`}
                        className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3"
                      >
                        <span
                          className={cn(
                            'mt-0.5 rounded-full px-2 py-0.5 text-xs tabular-nums',
                            verdict.matchedLineIndex === null
                              ? 'bg-negative/10 text-negative'
                              : 'bg-positive/10 text-positive',
                          )}
                        >
                          {verdict.marksEarned}
                        </span>
                        <span className="min-w-0 break-words font-mono text-sm text-ink">
                          {verdict.studentLine}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </StepSwap>
            </MeasuredHeight>
          </div>
        </div>
        {onFixturesChange && (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!testResult || testLines.length === 0}
              onClick={() => {
                if (!testResult) return;
                onFixturesChange([
                  ...fixtures,
                  {
                    id: makeId(),
                    studentAnswer: testLines,
                    expectedMarks: testResult.marksEarned,
                  },
                ]);
              }}
            >
              Pin as fixture
            </Button>
          </div>
        )}
      </div>

      <AnimatedDisclosure open={Boolean(onFixturesChange && fixtures.length > 0)}>
        {onFixturesChange && fixtures.length > 0 && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg text-ink">Pinned fixtures</h3>
            </div>
            <div className="space-y-2">
              {fixtures.map((fixture, index) => (
                <FixtureRow
                  key={fixture.id}
                  fixture={fixture}
                  scheme={schemeValid ? scheme : null}
                  onRemove={() =>
                    onFixturesChange(fixtures.filter((entry) => entry.id !== fixture.id))
                  }
                  index={index}
                />
              ))}
            </div>
          </div>
        )}
      </AnimatedDisclosure>
    </section>
  );
}

function FixtureRow({
  fixture,
  scheme,
  onRemove,
  index,
}: {
  fixture: ItemFixture;
  scheme: MarkSchemeLine[] | null;
  onRemove: () => void;
  index: number;
}) {
  const lines = Array.isArray(fixture.studentAnswer)
    ? fixture.studentAnswer
    : answerLines(fixture.studentAnswer);
  const result = scheme ? runWorkingFixtures(scheme, [fixture])[0] : null;
  const matches = result?.passes ?? false;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink-soft">Fixture {index + 1}</div>
        <div className="mt-1 truncate font-mono text-sm text-ink">{lines.join(' · ')}</div>
      </div>
      <span className="text-sm tabular-nums text-ink-soft">
        Expected {fixture.expectedMarks}, got {result?.marksEarned ?? '—'}
      </span>
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-semibold',
          matches ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative',
        )}
      >
        {matches ? 'Pass' : 'Mismatch'}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="hit-target rounded-full px-2 py-1 text-xs text-ink-faint hover:bg-ink/5 hover:text-ink"
      >
        Remove
      </button>
    </div>
  );
}

function answerLines(answer: string): string[] {
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function SchemeError({ error }: { error: MarkSchemeCompileError }) {
  const start = Math.max(0, error.column - 1);
  const end = Math.min(error.source.length, start + error.length);
  return (
    <div className="rounded-2xl bg-negative/5 px-4 py-3">
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
