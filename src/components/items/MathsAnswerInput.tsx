import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { MarkdownView } from '../markdown/MarkdownView';
import { cn } from '../ui/cn';
import { expressionToTex, parseExpression } from '../../items/verify';

interface MathsAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface PaletteTemplate {
  label: string;
  symbol: string;
  before: string;
  after?: string;
  wrapSelection?: boolean;
}

const PALETTE: PaletteTemplate[] = [
  { label: 'Power', symbol: 'x²', before: '^(', after: ')' },
  { label: 'Fraction', symbol: 'a/b', before: '(', after: ')/()', wrapSelection: true },
  { label: 'Multiply', symbol: '×', before: '*' },
  { label: 'Divide', symbol: '÷', before: '/' },
  { label: 'Brackets', symbol: '( )', before: '(', after: ')' },
];

export const MathsAnswerInput = forwardRef<HTMLInputElement, MathsAnswerInputProps>(
  function MathsAnswerInput(
    {
      value,
      onChange,
      label = 'Answer',
      placeholder = 'Type an expression',
      disabled = false,
      className,
    },
    forwardedRef,
  ) {
    const generatedId = useId();
    const inputId = `maths-answer-${generatedId}`;
    const messageId = `${inputId}-message`;
    const inputRef = useRef<HTMLInputElement | null>(null);
    const parsed = useMemo(() => (value.trim() ? parseExpression(value) : null), [value]);

    const setInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    };

    const insertTemplate = (template: PaletteTemplate) => {
      const input = inputRef.current;
      if (!input) return;

      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? start;
      const selected = value.slice(start, end);
      const after = template.after ?? '';
      const insertion = template.wrapSelection
        ? `${template.before}${selected}${after}`
        : `${selected}${template.before}${after}`;
      const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
      const caret = template.wrapSelection
        ? start + template.before.length + selected.length + (selected ? after.length : 0)
        : start + selected.length + template.before.length;

      onChange(next);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(caret, caret);
      });
    };

    const preserveInputSelection = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    };

    return (
      <div className={cn('space-y-3', className)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={inputId} className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              {label}
            </label>
            <input
              ref={setInputRef}
              id={inputId}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={parsed?.ok === false || undefined}
              aria-describedby={messageId}
              className={cn(
                'min-h-11 w-full rounded-lg border bg-surface px-3 py-2.5 font-mono text-base text-ink outline-none transition-colors',
                parsed?.ok === false
                  ? 'border-negative focus:border-negative focus:ring-2 focus:ring-negative/20'
                  : 'border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20',
              )}
            />
            <p
              id={messageId}
              className={cn('mt-2 min-h-5 text-sm', parsed?.ok === false ? 'text-negative' : 'text-ink-faint')}
            >
              {parsed?.ok === false
                ? parsed.error.message
                : 'Use ordinary notation, such as 3/4, x^2 or sqrt(16).'}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Preview</div>
            {parsed?.ok ? (
              <MarkdownView
                source={`$$${expressionToTex(parsed.expression)}$$`}
                className="flex min-h-11 items-center overflow-x-auto text-ink"
              />
            ) : (
              <div className="flex min-h-11 items-center text-sm text-ink-faint">
                {value.trim() ? 'Fix the expression to preview it.' : 'Your expression will appear here.'}
              </div>
            )}
          </div>
        </div>

        <div role="toolbar" aria-label="Maths symbols" className="flex flex-wrap gap-2">
          {PALETTE.map((template) => (
            <button
              key={template.label}
              type="button"
              aria-label={`Insert ${template.label.toLocaleLowerCase()}`}
              title={`Insert ${template.label.toLocaleLowerCase()}`}
              disabled={disabled}
              onMouseDown={preserveInputSelection}
              onClick={() => insertTemplate(template)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent active:bg-accent-soft disabled:pointer-events-none disabled:opacity-40"
            >
              {template.symbol}
            </button>
          ))}
        </div>
      </div>
    );
  },
);
