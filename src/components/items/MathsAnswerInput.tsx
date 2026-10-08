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
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

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
    const [motionSpeed] = useMotionSpeed();
    const multiplier = speedMultiplier(motionSpeed);
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
      <div className={cn('group', className)}>
        <label id={labelId} htmlFor={inputId} className="mb-2 block text-sm font-medium text-ink-soft">
          {label}
        </label>
        <div
          className={cn(
            'flex min-h-16 w-full items-stretch overflow-hidden rounded-2xl bg-ink/[0.04] transition-shadow focus-within:bg-ink/[0.06] focus-within:ring-2',
            parsed?.ok === false ? 'focus-within:ring-negative/60' : 'focus-within:ring-accent/60',
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
            aria-describedby={parsed?.ok === false ? messageId : undefined}
            className="min-h-14 min-w-0 flex-1 border-0 bg-transparent px-5 py-3 font-display text-2xl font-medium tabular-nums tracking-tight text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50"
          />
          {renderActivated && parsed?.ok ? (
            <output
              role="status"
              aria-label={`Rendered answer: ${parsed.expression.source}`}
              className="flex min-w-0 flex-1 items-center bg-ink/[0.04] px-5 py-2"
            >
              <MarkdownView
                source={`$$${expressionToTex(parsed.expression)}$$`}
                className="flex min-h-11 min-w-0 flex-1 items-center overflow-x-auto text-ink [&>p]:my-0"
              />
            </output>
          ) : null}
        </div>
        {parsed?.ok === false && (
          <p id={messageId} className="mt-2 px-1 text-sm text-negative">
            {parsed.error.message}
          </p>
        )}

        {/* The chips are always in the DOM so keyboard users can reach them; they only
            become visible (and clickable) while focus is inside the field or the palette. */}
        <div
          role="toolbar"
          aria-label="Maths symbols"
          className="pointer-events-none mt-3 flex -translate-y-1 flex-wrap gap-2 opacity-0 transition-[opacity,transform] group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100"
          style={{
            transitionDuration: `${0.2 * multiplier}s`,
          }}
        >
          {PALETTE.map((template) => (
            <button
              key={template.label}
              type="button"
              aria-label={`Insert ${template.label.toLocaleLowerCase()}`}
              title={`Insert ${template.label.toLocaleLowerCase()}`}
              disabled={disabled}
              onMouseDown={preserveInputSelection}
              onClick={() => insertTemplate(template)}
              className="relative inline-flex h-9 min-w-11 items-center justify-center rounded-full bg-ink/[0.06] px-3.5 font-display text-sm font-medium text-ink transition-colors after:absolute after:-inset-y-1 after:inset-x-0 hover:bg-ink hover:text-paper active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40"
            >
              {template.symbol}
            </button>
          ))}
        </div>
      </div>
    );
  },
);
