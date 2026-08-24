import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
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
  autoFocus?: boolean;
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
      autoFocus = false,
      className,
    },
    forwardedRef,
  ) {
    const generatedId = useId();
    const inputId = `maths-answer-${generatedId}`;
    const labelId = `${inputId}-label`;
    const messageId = `${inputId}-message`;
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [renderActivated, setRenderActivated] = useState(false);
    const parsed = useMemo(() => (value.trim() ? parseExpression(value) : null), [value]);

    useEffect(() => {
      if (!value.trim()) setRenderActivated(false);
    }, [value]);

    const setInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        event.key === ' ' &&
        event.currentTarget.selectionStart === value.length &&
        event.currentTarget.selectionEnd === value.length &&
        parsed?.ok
      ) {
        setRenderActivated(true);
      }
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
        <div>
          <label
            id={labelId}
            htmlFor={inputId}
            className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint"
          >
            {label}
          </label>
          <div
            className={cn(
              'flex min-h-12 w-full items-stretch overflow-hidden rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow]',
              parsed?.ok === false
                ? 'border-negative focus-within:border-negative focus-within:ring-2 focus-within:ring-negative/20'
                : 'border-line-strong focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20',
            )}
          >
            <input
              ref={setInputRef}
              id={inputId}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              aria-invalid={parsed?.ok === false || undefined}
              aria-describedby={messageId}
              className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-base text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            {renderActivated && parsed?.ok ? (
              <output
                role="status"
                aria-label={`Rendered answer: ${parsed.expression.source}`}
                className="flex min-w-0 flex-1 items-center border-l border-line bg-surface-raised/70 px-4 py-2"
              >
                <MarkdownView
                  source={`$$${expressionToTex(parsed.expression)}$$`}
                  className="flex min-h-11 min-w-0 flex-1 items-center overflow-x-auto text-ink [&>p]:my-0"
                />
              </output>
            ) : null}
          </div>
          <p
            id={messageId}
            className={cn(
              'mt-2 min-h-5 text-sm',
              parsed?.ok === false ? 'text-negative' : 'text-ink-faint',
            )}
          >
            {parsed?.ok === false
              ? parsed.error.message
              : 'Use ordinary notation, such as 3/4, x^2 or sqrt(16).'}
          </p>
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
