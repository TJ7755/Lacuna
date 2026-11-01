import type { RefObject } from 'react';
import { SEQUENCE_PRESETS, type getPreset } from '../db/sequencePresets';
import type { SequencePresetId } from '@lacuna/core/db/types';
import { SequenceOutlineEditor } from '../components/sequences/SequenceOutlineEditor';
import type { generateCards } from '../db/sequenceGeneration';
import type { ReactNode } from 'react';
import type { Outline } from '../components/sequences/sequenceOutline';
import { AnimatedDisclosure } from '../components/ui/AnimatedDisclosure';
import {
  Input,
  fieldHintClassName,
  fieldLabelClassName,
  inputFrameClassName,
} from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { choiceChipClass } from '../components/ui/choiceChip';
import { cn } from '../components/ui/cn';
import { ChevronDownIcon } from '../components/ui/icons';
import type { Sequence } from '@lacuna/core/db/types';
import {
  MAX_RECITATION_CHUNK_SIZE,
  MIN_RECITATION_CHUNK_SIZE,
  hasStanzas,
} from './learn/recitation/recitationFlow';

export function SequenceOptions({
  description,
  setDescription,
  cueWindow,
  setCueWindow,
  saved,
  itemTerm,
  itemPlural,
  mode,
  chunkChoice,
  setRecitationChunkSize,
  chunkLabel,
  generateLabelCards,
  setGenerateLabelCards,
}: {
  description: string;
  setDescription: (value: string) => void;
  cueWindow: number;
  setCueWindow: (value: number) => void;
  saved: Outline;
  itemTerm: string;
  itemPlural: string;
  mode: Sequence['mode'];
  chunkChoice: string;
  setRecitationChunkSize: (value: number | undefined) => void;
  chunkLabel: string;
  generateLabelCards: boolean;
  setGenerateLabelCards: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <label className={fieldLabelClassName}>
        Description
        <Input
          aria-label="Sequence description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this sequence covers"
        />
      </label>
      <label className={fieldLabelClassName}>
        Cue
        <span className="mt-2 flex flex-wrap items-center gap-2 font-normal text-ink-soft">
          Show the previous
          <input
            type="number"
            aria-label="Cue window"
            min={1}
            max={Math.max(1, saved.items.length - 1)}
            value={cueWindow}
            onChange={(e) => setCueWindow(Math.max(1, Number(e.target.value) || 1))}
            className={cn(inputFrameClassName, 'min-h-11 w-20 text-center tabular-nums')}
          />
          {cueWindow === 1 ? itemTerm : itemPlural.toLowerCase()} before each card
        </span>
      </label>
      {mode === 'lines' && (
        <label className={fieldLabelClassName}>
          Learn in
          <Select
            aria-label="Learn in"
            aria-describedby="sequence-learn-in-hint"
            value={chunkChoice}
            onChange={(e) =>
              setRecitationChunkSize(
                e.target.value === 'stanza' ? undefined : Number(e.target.value),
              )
            }
            className="mt-2 block font-normal"
          >
            {hasStanzas(saved) && <option value="stanza">{chunkLabel.toLowerCase()}s</option>}
            {Array.from(
              { length: MAX_RECITATION_CHUNK_SIZE - MIN_RECITATION_CHUNK_SIZE + 1 },
              (_, i) => MIN_RECITATION_CHUNK_SIZE + i,
            ).map((size) => (
              <option key={size} value={size}>
                {size} {itemPlural.toLowerCase()}
              </option>
            ))}
          </Select>
          <span id="sequence-learn-in-hint" className={fieldHintClassName}>
            How many lines to practise together, or your named sections.
          </span>
        </label>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className={fieldLabelClassName}>Label cards</div>
          <p className={fieldHintClassName}>
            Give {itemPlural.toLowerCase()} a label, such as 11 for sodium, and recall each from its
            label too.
          </p>
        </div>
        <Toggle
          checked={generateLabelCards}
          onChange={setGenerateLabelCards}
          ariaLabel="Also generate label to value cards"
        />
      </div>
    </div>
  );
}
/** A labelled row of chips backed by native radios, so arrow keys choose. */
export function ChipChoice({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
  invalid,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: ReactNode;
  invalid?: boolean;
}) {
  return (
    <fieldset aria-invalid={invalid || undefined}>
      <legend className={fieldLabelClassName}>{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              choiceChipClass(option.value === value),
              'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-ink',
              invalid && 'ring-1 ring-negative/60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && <p className={fieldHintClassName}>{hint}</p>}
    </fieldset>
  );
}

/** A compact card whose heading opens its body, with a one-line summary when shut. */
export function Disclosure({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <SectionCard compact className="py-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center gap-3 text-left"
        >
          <span className="font-display text-lg font-semibold tracking-tight">{title}</span>
          <span className="text-sm tabular-nums text-ink-faint">{summary}</span>
          <ChevronDownIcon
            width={16}
            height={16}
            className={cn('ml-auto text-ink-faint transition-transform', open && 'rotate-180')}
          />
        </button>
      </h2>
      <AnimatedDisclosure open={open} innerClassName="pb-4 pt-3">
        {children}
      </AnimatedDisclosure>
    </SectionCard>
  );
}

export function SequenceIdentity({
  preset,
  presetId,
  selectPreset,
  editing,
  name,
  setName,
  nameError,
  setNameError,
}: {
  preset: ReturnType<typeof getPreset>;
  presetId: SequencePresetId;
  selectPreset: (id: SequencePresetId) => void;
  editing: boolean;
  name: string;
  setName: (value: string) => void;
  nameError: string | null;
  setNameError: (value: string | null) => void;
}) {
  return (
    <SectionCard className="flex flex-col gap-5">
      <label className={fieldLabelClassName}>
        Name
        <Input
          id="sequence-name"
          aria-label="Sequence name"
          autoFocus
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(null);
          }}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? 'sequence-name-error' : undefined}
          placeholder="e.g. The Krebs cycle"
        />
        {nameError && (
          <span
            id="sequence-name-error"
            role="alert"
            className="mt-1 block text-xs font-normal text-negative"
          >
            {nameError}
          </span>
        )}
      </label>

      {!editing ? (
        <ChipChoice
          legend="Type"
          name="sequence-type"
          value={presetId}
          options={SEQUENCE_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => selectPreset(id as SequencePresetId)}
          hint={preset.description}
        />
      ) : (
        <div>
          <div className={fieldLabelClassName}>Type</div>
          <p className="mt-1 text-sm text-ink-soft">{preset.name}</p>
        </div>
      )}
    </SectionCard>
  );
}

export function SequenceItems({
  itemPlural,
  itemTerm,
  chunkLabel,
  saved,
  touch,
  usesSpeakers,
  partRef,
  speakers,
  mySpeaker,
  setMySpeaker,
  setSpeakerError,
  setSaveError,
  speakerError,
  outline,
  setOutline,
  preset,
  generateLabelCards,
  saveRef,
}: {
  itemPlural: string;
  itemTerm: string;
  chunkLabel: string;
  saved: Outline;
  touch: boolean;
  usesSpeakers: boolean;
  partRef: RefObject<HTMLDivElement | null>;
  speakers: string[];
  mySpeaker: string;
  setMySpeaker: (value: string) => void;
  setSpeakerError: (value: boolean) => void;
  setSaveError: (value: string | null) => void;
  speakerError: boolean;
  outline: Outline;
  setOutline: (value: Outline) => void;
  preset: ReturnType<typeof getPreset>;
  generateLabelCards: boolean;
  saveRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <SectionCard aria-labelledby="sequence-items-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="sequence-items-heading"
          className="font-display text-xl font-semibold tracking-tight"
        >
          {itemPlural}{' '}
          <span className="font-body text-sm font-normal tabular-nums text-ink-faint">
            {saved.items.length}
          </span>
        </h2>
        {!touch && (
          <p className="text-xs text-ink-faint">
            Enter for the next {itemTerm}, twice for a new {chunkLabel.toLowerCase()}. Shift+Enter
            breaks a {itemTerm}.
          </p>
        )}
      </div>

      {usesSpeakers && (
        <div ref={partRef} className="mb-4">
          {speakers.length > 0 ? (
            <ChipChoice
              legend="Your part"
              name="sequence-part"
              value={mySpeaker}
              options={speakers.map((speaker) => ({ value: speaker, label: speaker }))}
              onChange={(speaker) => {
                setMySpeaker(speaker);
                setSpeakerError(false);
                setSaveError(null);
              }}
              hint="Only your lines become cards; the others cue them."
              invalid={speakerError}
            />
          ) : (
            <p className={fieldHintClassName}>
              Type “NAME: line”, or paste a script, and choose your part here.
            </p>
          )}
        </div>
      )}

      <SequenceOutlineEditor
        outline={outline}
        onChange={setOutline}
        preset={preset}
        mySpeaker={usesSpeakers ? mySpeaker : undefined}
        speakers={speakers}
        showLabels={generateLabelCards}
        onTabForward={() => saveRef.current?.focus()}
      />
    </SectionCard>
  );
}

export function SequencePreview({
  preview,
  itemPlural,
}: {
  preview: ReturnType<typeof generateCards>;
  itemPlural: string;
}) {
  return (
    <>
      {preview.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Cards appear here as you add {itemPlural.toLowerCase()}.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {preview.map((payload, i) => (
            <li key={i} className="rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
              <div className="whitespace-pre-wrap text-ink-soft">{payload.front}</div>
              <div className="mt-2 font-medium text-ink">{payload.back}</div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
