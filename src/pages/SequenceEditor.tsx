// Full-page composer for creating and editing a Sequence (an overlapping-cloze
// source document that derives ordinary front/back FSRS cards). Mirrors
// CardEditor's shape: the route decides create vs edit mode, a sticky action
// bar drives save/cancel, and deletion (edit mode only) uses the app's
// undo-toast idiom via DangerZoneSection. Items are written in a keyboard-first
// outline (SequenceOutlineEditor); settings with good defaults wait under Options.
// Route: course/:courseId/sequence/new, course/:courseId/sequence/:sequenceId/edit,
// and the lesson-scoped course/:courseId/lesson/:lessonId/sequence/new variant.

import {
  Disclosure,
  SequenceEditorSkeleton,
  SequenceOptions,
  SequenceIdentity,
  SequenceItems,
  SequencePreview,
} from './SequenceEditorViews';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { compactSections, type Outline } from '../components/sequences/sequenceOutline';
import { AppLink as Link } from '../components/ui/AppLink';
import { Button } from '../components/ui/Button';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useToast } from '../components/ui/Toast';
import { ChevronLeftIcon } from '../components/ui/icons';
import { canEditLessons } from '../course/lessonViewMode';
import { makeId } from '../db/schema';
import { generateCards } from '../db/sequenceGeneration';
import { getPreset, presetForSequence } from '../db/sequencePresets';
import {
  createSequence,
  deleteSequence,
  restoreSequence,
  snapshotSequence,
  updateSequence,
  type SequenceSnapshot,
} from '../db/sequenceRepository';
import type { SequencePresetId } from '../db/types';
import { useEditorKeys } from '../hooks/dialogKeys';
import { useIsTouchMode } from '../state/inputMode';
import { useCourse, useLesson, useSequence } from '../state/useCourseData';
import { useReturn } from '../utils/editorOrigin';
import { DEFAULT_RECITATION_CHUNK_SIZE, hasStanzas } from './learn/recitation/recitationFlow';
import { DangerZoneSection } from './settings/DangerZoneSection';

/** Empty items are scaffolding, never content: they are not previewed or saved. */
function withoutEmptyItems(outline: Outline): Outline {
  return compactSections({
    items: outline.items.filter((item) => item.value.trim()),
    chunkLabels: outline.chunkLabels,
  });
}

export function SequenceEditor() {
  const { sequenceId, courseId, lessonId } = useParams<{
    sequenceId?: string;
    courseId?: string;
    lessonId?: string;
  }>();
  const lessonMode = Boolean(lessonId);
  const { notify } = useToast();
  const touch = useIsTouchMode();

  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  const editing = Boolean(sequenceId);
  const sequence = useSequence(sequenceId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outline, setOutline] = useState<Outline>({ items: [], chunkLabels: [] });
  const [cueWindow, setCueWindow] = useState(2);
  const [generateLabelCards, setGenerateLabelCards] = useState(false);
  const [presetId, setPresetId] = useState<SequencePresetId>('list');
  const [mySpeaker, setMySpeaker] = useState('');
  const [recitationChunkSize, setRecitationChunkSize] = useState<number | undefined>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [speakerError, setSpeakerError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const preset = getPreset(presetId);
  const mode = preset.mode;
  const usesSpeakers = preset.usesSpeakers;
  const { item: itemTerm, itemPlural, chunkLabel } = preset.terminology;
  const partRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  // Seed the form from the sequence being edited once it has loaded (new sequences start
  // with one blank item to type into).
  useEffect(() => {
    if (loaded) return;
    if (!editing) {
      setOutline({ items: [{ id: makeId(), value: '' }], chunkLabels: [] });
      setLoaded(true);
      return;
    }
    if (sequence) {
      setName(sequence.name);
      setDescription(sequence.description ?? '');
      setOutline({ items: sequence.items, chunkLabels: sequence.chunkLabels ?? [] });
      setCueWindow(sequence.cueWindow);
      setGenerateLabelCards(sequence.generateLabelCards ?? false);
      setPresetId(presetForSequence(sequence).id);
      setMySpeaker(sequence.mySpeaker ?? '');
      setRecitationChunkSize(sequence.recitationChunkSize);
      setLoaded(true);
    }
  }, [editing, sequence, loaded]);

  const lessonPath = `/course/${courseId}/lesson/${lessonId}`;
  const bankPath = `/course/${courseId}/cards`;
  // Where the caller navigated from, when that differs from what the route alone
  // implies. Sequence editing has no lesson-scoped edit route (only "new" does),
  // so origin state is the only signal that an edit was opened from a lesson —
  // absent on direct loads and hard refreshes, which fall back to the bank.
  const returnTo = useReturn({
    path: lessonMode ? lessonPath : bankPath,
    label: (lessonMode ? lesson?.name : 'Cards') ?? 'Back',
  });
  const backPath = returnTo.to;
  const backLabel = returnTo.label;

  const saved = useMemo(() => withoutEmptyItems(outline), [outline]);

  // Distinct speakers seen across items, in order of first appearance, for the
  // "your part" choice and the speaker suggestions.
  const speakers = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of outline.items) {
      const speaker = item.speaker?.trim();
      if (speaker && !seen.has(speaker)) {
        seen.add(speaker);
        order.push(speaker);
      }
    }
    return order;
  }, [outline.items]);

  const preview = useMemo(() => {
    if (!loaded) return [];
    return generateCards({
      id: sequence?.id ?? 'preview',
      courseId: courseId ?? '',
      primaryLessonId: lessonId ?? null,
      name: name.trim() || 'Untitled sequence',
      description,
      mode,
      items: saved.items,
      cueWindow,
      chunkLabels: saved.chunkLabels,
      generateLabelCards,
      mySpeaker: usesSpeakers ? mySpeaker || undefined : undefined,
      createdAt: sequence?.createdAt ?? 0,
      updatedAt: sequence?.updatedAt ?? sequence?.createdAt ?? 0,
    });
  }, [
    loaded,
    sequence,
    courseId,
    lessonId,
    name,
    description,
    mode,
    saved,
    cueWindow,
    generateLabelCards,
    mySpeaker,
    usesSpeakers,
  ]);

  // Selecting a preset (new sequences only) seeds its default cue window so the field
  // isn't left at whatever an earlier preset choice happened to leave it at.
  function selectPreset(id: SequencePresetId) {
    const nextPreset = getPreset(id);
    setPresetId(id);
    setCueWindow(nextPreset.defaultCueWindow);
    // Sections still carrying their automatic name ("Verse 2") follow the new type's term.
    const automatic = new RegExp(`^${preset.terminology.chunkLabel} (\\d+)$`);
    setOutline((prev) => ({
      ...prev,
      chunkLabels: prev.chunkLabels.map((label) =>
        label.replace(automatic, `${nextPreset.terminology.chunkLabel} $1`),
      ),
    }));
    if (!nextPreset.usesSpeakers) {
      setOutline((prev) => ({
        ...prev,
        items: prev.items.map(({ speaker: _speaker, ...item }) => item),
      }));
      setMySpeaker('');
    }
  }

  const editorKeys = useEditorKeys({
    onCancel: returnTo.goBack,
    onSubmit: () => void handleSave(),
  });

  if (
    (lessonMode ? course === undefined || lesson === undefined : course === undefined) ||
    (editing && sequence === undefined && !loaded)
  ) {
    return (
      <DelayedFallback>
        <SequenceEditorSkeleton />
      </DelayedFallback>
    );
  }
  if (course === null) {
    return (
      <div className={`${COURSE_PAGE_FRAME} py-10`}>
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center text-sm text-ink-faint transition-colors hover:text-ink"
        >
          Back to Today
        </Link>
      </div>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <div className={`${COURSE_PAGE_FRAME} py-10`}>
        <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
        <Link
          to={courseId ? `/course/${courseId}` : '/'}
          className="inline-flex min-h-11 items-center text-sm text-ink-faint transition-colors hover:text-ink"
        >
          {courseId ? 'Back to course' : 'Back to Today'}
        </Link>
      </div>
    );
  }
  if (editing && sequence === null) {
    return (
      <div className={`${COURSE_PAGE_FRAME} py-10`}>
        <p className="mb-4 text-ink-soft">This sequence could not be found.</p>
        <Link
          to={backPath}
          className="inline-flex min-h-11 items-center text-sm text-ink-faint transition-colors hover:text-ink"
        >
          Back to {backLabel}
        </Link>
      </div>
    );
  }

  const editable = Boolean(course && canEditLessons(course));

  async function handleSave() {
    if (!editable || saving || !courseId) return;

    const missingName = name.trim().length === 0;
    const missingSpeaker = usesSpeakers && mySpeaker.trim().length === 0;
    const missingCards = !missingSpeaker && preview.length === 0;

    setNameError(missingName ? 'Enter a name before saving.' : null);
    setSpeakerError(missingSpeaker);
    setSaveError(
      missingSpeaker
        ? 'Choose your part before saving.'
        : missingCards
          ? usesSpeakers && saved.items.length > 0
            ? `None of the ${itemPlural.toLowerCase()} are ${mySpeaker}’s.`
            : `Add your first ${itemTerm} to make cards.`
          : null,
    );

    if (missingName) {
      document.getElementById('sequence-name')?.focus();
      return;
    }
    if (missingSpeaker) {
      partRef.current?.querySelector('input')?.focus();
      return;
    }
    if (missingCards) return;

    setSaving(true);
    try {
      const opts = {
        description: description.trim() || undefined,
        mode,
        presetId,
        cueWindow,
        chunkLabels: saved.chunkLabels.length > 0 ? saved.chunkLabels : undefined,
        generateLabelCards,
        mySpeaker: usesSpeakers ? mySpeaker.trim() : undefined,
        recitationChunkSize: mode === 'lines' ? recitationChunkSize : undefined,
      };
      if (editing && sequence) {
        await updateSequence({ ...sequence, name: name.trim(), items: saved.items, ...opts });
        notify('Sequence updated.', 'positive');
      } else {
        await createSequence(courseId, lessonId ?? null, name, saved.items, opts);
        notify('Sequence added.', 'positive');
      }
      returnTo.goBack();
    } finally {
      setSaving(false);
    }
  }

  const cardCount = `${preview.length} card${preview.length === 1 ? '' : 's'}`;
  const chunkChoice =
    recitationChunkSize !== undefined
      ? String(recitationChunkSize)
      : hasStanzas(saved)
        ? 'stanza'
        : String(DEFAULT_RECITATION_CHUNK_SIZE);

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-10 pt-8`} {...editorKeys}>
      <header className="mb-8">
        <Link
          {...returnTo.linkProps}
          className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          Back to {backLabel}
        </Link>
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          {editing ? 'Edit sequence' : 'New sequence'}
        </h1>
      </header>

      <div className="flex flex-col gap-5">
        <SequenceIdentity
          preset={preset}
          presetId={presetId}
          selectPreset={selectPreset}
          editing={editing}
          name={name}
          setName={setName}
          nameError={nameError}
          setNameError={setNameError}
        />

        <SequenceItems
          itemPlural={itemPlural}
          itemTerm={itemTerm}
          chunkLabel={chunkLabel}
          saved={saved}
          touch={touch}
          usesSpeakers={usesSpeakers}
          partRef={partRef}
          speakers={speakers}
          mySpeaker={mySpeaker}
          setMySpeaker={setMySpeaker}
          setSpeakerError={setSpeakerError}
          setSaveError={setSaveError}
          speakerError={speakerError}
          outline={outline}
          setOutline={setOutline}
          preset={preset}
          generateLabelCards={generateLabelCards}
          saveRef={saveRef}
        />

        <Disclosure
          title="Options"
          summary={`Cue: ${cueWindow} ${cueWindow === 1 ? itemTerm : itemPlural.toLowerCase()}`}
          open={optionsOpen}
          onToggle={() => setOptionsOpen((open) => !open)}
        >
          <SequenceOptions
            description={description}
            setDescription={setDescription}
            cueWindow={cueWindow}
            setCueWindow={setCueWindow}
            saved={saved}
            itemTerm={itemTerm}
            itemPlural={itemPlural}
            mode={mode}
            chunkChoice={chunkChoice}
            setRecitationChunkSize={setRecitationChunkSize}
            chunkLabel={chunkLabel}
            generateLabelCards={generateLabelCards}
            setGenerateLabelCards={setGenerateLabelCards}
          />
        </Disclosure>

        <Disclosure
          title="Preview"
          summary={cardCount}
          open={previewOpen}
          onToggle={() => setPreviewOpen((open) => !open)}
        >
          <SequencePreview preview={preview} itemPlural={itemPlural} />
        </Disclosure>

        {editable && editing && sequence && (
          <DangerZoneSection
            entityLabel="sequence"
            entityName={sequence.name}
            description="Deletes this sequence and every card it generated."
            snapshot={() => snapshotSequence(sequence.id)}
            onDelete={() => deleteSequence(sequence.id)}
            onRestore={(snap) => restoreSequence(snap as SequenceSnapshot)}
            onDeleted={returnTo.goBack}
          />
        )}
      </div>

      {/* Sticky action bar */}
      <div
        role="region"
        aria-label="Sequence editor actions"
        // Bleeds to exactly the page frame's padding at each width (PAGE_FRAME), so it never
        // overhangs the page when that padding is fixed and the text is enlarged.
        className="pointer-events-none sticky bottom-0 z-30 -mx-[18px] mt-8 bg-gradient-to-t from-paper via-paper to-transparent px-[18px] pb-5 pt-12 min-[481px]:-mx-6 min-[481px]:px-6 md:-mx-10 md:px-10"
      >
        <div className="pointer-events-auto ml-auto flex w-fit max-w-full flex-wrap items-center justify-end gap-3">
          {saveError ? (
            <p role="alert" className="max-w-xs text-right text-sm text-negative">
              {saveError}
            </p>
          ) : (
            <p aria-live="polite" className="text-sm tabular-nums text-ink-faint">
              {cardCount}
            </p>
          )}
          <Button variant="ghost" onClick={returnTo.goBack}>
            Cancel
          </Button>
          <Button
            ref={saveRef}
            variant="primary"
            onClick={handleSave}
            disabled={!editable || saving}
            className="whitespace-nowrap"
          >
            {editing ? 'Save changes' : 'Add sequence'}
          </Button>
        </div>
      </div>
    </div>
  );
}
