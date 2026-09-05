import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { useCard } from '../state/useData';
import {
  useCourse,
  useCourseCards,
  useLesson,
  useLessonCards,
  useLessonBackingDeck,
  useCourseBankBackingDeck,
  useOcclusions,
  useSequences,
} from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import { TagInput } from '../components/ui/TagInput';
import { useToast } from '../components/ui/Toast';
import {
  checkDuplicate,
  createLessonCard,
  createLessonCardWithReverse,
  createLessonBasicReversedPair,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  updateCard,
} from '../db/repository';
import { hasCloze } from '../components/markdown/cloze';
import { sequenceForItemId } from '../db/sequenceGeneration';
import { occlusionForRegionId } from '../db/occlusionGeneration';
import { CardContent } from '../components/cards/CardContent';
import {
  NumericAnswerEditor,
  numericAnswerSpecIsValid,
} from '../components/items/NumericAnswerEditor';
import { MarkSchemeEditor } from '../components/items/MarkSchemeEditor';
import { compileMarkScheme, serialiseMarkScheme } from '../items/markSchemeCompiler';
import { buildMarkSchemeDraftPrompt } from '../items/prompts';
import { GeneratedCardBadge } from '../components/cards/GeneratedCardBadge';
import { AudioCardEditor } from '../components/cards/AudioCardEditor';
import { ChevronLeftIcon, CheckIcon } from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useIsTouchMode } from '../state/inputMode';
import { saveDraft, loadDraft, clearDraft, draftKey } from '../utils/drafts';
import type { EditorOriginState } from '../utils/editorOrigin';
import type { Card, CardType, ItemFixture, ItemPayload, NumericAnswerSpec } from '../db/types';
import { isAudioCardFront } from '../media/audio';

type EditorCardType = CardType | 'numeric' | 'working' | 'audio';

const EMPTY_NUMERIC_ANSWER: NumericAnswerSpec = { kind: 'exact', value: '' };

/**
 * Full-page card composer for both creating and editing a card. Replaces the old
 * cramped modal with a spacious editing surface: a roomy Markdown editor with a live
 * preview and a sticky action bar. The route shape (.../cards/new vs .../cards/:id/edit)
 * decides the mode.
 */
export function CardEditor() {
  const { cardId, courseId, lessonId } = useParams<{
    cardId?: string;
    courseId?: string;
    lessonId?: string;
  }>();
  // Lesson-scoped route (course/:courseId/lesson/:lessonId/cards/...) vs the
  // course-scoped Cards route (course/:courseId/cards/..., no lessonId).
  const lessonMode = Boolean(lessonId);
  const bankMode = !lessonMode;
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  const lessonCards = useLessonCards(lessonId);
  // Resolve the hidden scheduling deck through the Course/Lesson boundary.
  const lessonDeck = useLessonBackingDeck(courseId, lessonId);
  // Course Cards with no lesson share one backing scheduling unit (Cards mode only).
  const courseCards = useCourseCards(bankMode ? courseId : undefined);
  const bankCards = useMemo(
    () => courseCards?.filter((c) => !c.primaryLessonId) ?? [],
    [courseCards],
  );
  const bankDeck = useCourseBankBackingDeck(bankMode ? courseId : undefined);
  const editing = Boolean(cardId);
  const card = useCard(cardId);
  // Only fetched for the read-only branch below (a generated card resolves its owning
  // sequence/occlusion here to link back to the owning editor). Harmless to call
  // unconditionally.
  const sequences = useSequences(courseId);
  const occlusions = useOcclusions(courseId);

  const [type, setType] = useState<EditorCardType>('front_back');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [numericAnswer, setNumericAnswer] = useState<NumericAnswerSpec>(EMPTY_NUMERIC_ANSWER);
  const [workingSource, setWorkingSource] = useState('');
  const [workingFixtures, setWorkingFixtures] = useState<ItemFixture[]>([]);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const [tags, setTags] = useState<string[]>([]);
  const [showBackCloze, setShowBackCloze] = useState(false);
  // When set (new front/back cards only), saving also creates an independent reverse card.
  const [alsoReverse, setAlsoReverse] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Autosave begins only after an author changes a seeded field. Without this latch,
  // mounting an existing card fabricates a draft and mounting over a real draft can erase it.
  const [draftDirty, setDraftDirty] = useState(false);
  // Whether a stored draft was found and is offered for restoration.
  const [draftPrompt, setDraftPrompt] = useState(false);
  const currentDraftKey = draftKey(lessonId ?? `bank:${courseId}`, cardId ?? 'new');
  const draftKeyRef = useRef(currentDraftKey);
  const draftTimer = useRef<number>();

  // Persist the current form state under the key in draftKeyRef. Shared by the
  // debounced autosave and the route-change flush below.
  function persistDraft() {
    saveDraft(draftKeyRef.current, {
      type: type === 'numeric' || type === 'working' || type === 'audio' ? 'front_back' : type,
      itemKind: type === 'numeric' || type === 'working' || type === 'audio' ? type : undefined,
      front,
      back,
      tags,
      alsoReverse,
      payload:
        type === 'numeric'
          ? { v: 1, kind: 'numeric', answer: numericAnswer }
          : type === 'working'
            ? {
                v: 1,
                kind: 'working',
                scheme: workingCompilation.lines.flatMap((line) =>
                  line.kind === 'compiled' ? [line.value] : [],
                ),
                ...(workingFixtures.length > 0 ? { fixtures: workingFixtures } : {}),
              }
            : undefined,
      workingSource: type === 'working' ? workingSource : undefined,
      timestamp: Date.now(),
    });
  }
  // Effects that must not re-run on every keystroke reach the latest persistDraft
  // through this stable handle rather than a dependency.
  const persistDraftRef = useRef(persistDraft);
  persistDraftRef.current = persistDraft;

  // Re-arm the loaded latch whenever the card being edited changes so direct
  // navigation between cards (same route, different param) re-seeds the form.
  // Flush the outgoing card first: the route change cancels the only pending
  // autosave timer, and the un-debounced edit would otherwise be lost with the
  // source draft key.
  useEffect(() => {
    if (loaded && draftDirty && !draftPrompt) persistDraftRef.current();
    window.clearTimeout(draftTimer.current);
    draftKeyRef.current = currentDraftKey;
    setLoaded(false);
    setDraftDirty(false);
    setDraftPrompt(false);
    // Deliberately keyed on the draft key alone; form state is read through persistDraftRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDraftKey]);

  // Quick-capture bookkeeping: how many cards added without leaving the page, and a
  // remount key that refocuses the first field after each "Save & add another".
  const [addedCount, setAddedCount] = useState(0);
  const [formKey, setFormKey] = useState(0);

  // Refs that drive a seamless Tab order through the quick-capture flow:
  // Front → Back → Save & add another → Add card, skipping the toolbars and tag input.
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const saveAddRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Where Tab off the last text field should land: the "add another" button when it
  // exists (new cards), otherwise the primary save button.
  const focusSaveButton = () => (saveAddRef.current ?? saveRef.current)?.focus();

  // Brief "Saved" flourish shown in the action bar after each quick-capture save.
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<number>();
  const [shakeField, setShakeField] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const shakeTimer = useRef<number>();
  const [duplicateWarning, setDuplicateWarning] = useState<Card | null>(null);
  const duplicateTimer = useRef<number>();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  function modifyDraftField<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDraftDirty(true);
  }

  function flashSaved() {
    window.clearTimeout(savedTimer.current);
    setShowSaved(true);
    savedTimer.current = window.setTimeout(() => setShowSaved(false), 1200);
  }

  async function copyMarkSchemePrompt() {
    if (!front.trim()) return;
    try {
      await navigator.clipboard.writeText(buildMarkSchemeDraftPrompt(front));
      notify('Mark-scheme prompt copied to the clipboard.', 'positive');
    } catch {
      notify('Could not copy the mark-scheme prompt.', 'negative');
    }
  }
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  // Existing tags across the lesson or bank, offered as suggestions in the tag input.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    const source = lessonMode ? lessonCards : bankCards;
    for (const c of source ?? []) {
      for (const t of c.tags ?? []) set.add(t);
    }
    return [...set].sort();
  }, [lessonMode, lessonCards, bankCards]);

  // Seed the form from the card being edited once it has loaded (new cards start blank).
  // If a draft exists, offer it instead of the persisted state.
  useEffect(() => {
    if (loaded) return;
    if (!editing) {
      // New card: check for a draft from a previous abandoned session.
      const draft = loadDraft(draftKeyRef.current);
      if (draft && draft.front.trim()) {
        setDraftPrompt(true);
      }
      setLoaded(true);
      return;
    }
    if (card) {
      const draft = loadDraft(draftKeyRef.current);
      if (draft && draft.timestamp > 0) {
        setDraftPrompt(true);
      } else {
        setType(
          card.payload?.kind === 'numeric'
            ? 'numeric'
            : card.payload?.kind === 'working'
              ? 'working'
              : isAudioCardFront(card.front)
                ? 'audio'
                : card.type,
        );
        setFront(card.front);
        setBack(card.back);
        if (card.payload?.kind === 'numeric') setNumericAnswer(card.payload.answer);
        if (card.payload?.kind === 'working') {
          setWorkingSource(serialiseMarkScheme(card.payload.scheme));
          setWorkingFixtures(card.payload.fixtures ?? []);
        }
        setTags(card.tags ?? []);
      }
      setLoaded(true);
    }
  }, [editing, card, loaded]);

  const applyDraft = () => {
    const draft = loadDraft(draftKeyRef.current);
    if (!draft) return;
    setType(
      draft.itemKind === 'numeric' || draft.itemKind === 'working' || draft.itemKind === 'audio'
        ? draft.itemKind
        : draft.type,
    );
    setFront(draft.front);
    setBack(draft.back);
    setTags(draft.tags);
    if (draft.payload?.kind === 'numeric') setNumericAnswer(draft.payload.answer);
    if (draft.itemKind === 'working') {
      setWorkingSource(
        draft.workingSource ??
          (draft.payload?.kind === 'working' ? serialiseMarkScheme(draft.payload.scheme) : ''),
      );
      setWorkingFixtures(draft.payload?.kind === 'working' ? (draft.payload.fixtures ?? []) : []);
    }
    if (draft.alsoReverse !== undefined) setAlsoReverse(draft.alsoReverse);
    setDraftDirty(false);
    setDraftPrompt(false);
  };

  const discardDraft = () => {
    clearDraft(draftKeyRef.current);
    setDraftDirty(false);
    setDraftPrompt(false);
    if (editing && card) {
      setType(
        card.payload?.kind === 'numeric'
          ? 'numeric'
          : card.payload?.kind === 'working'
            ? 'working'
            : isAudioCardFront(card.front)
              ? 'audio'
              : card.type,
      );
      setFront(card.front);
      setBack(card.back);
      setTags(card.tags ?? []);
      if (card.payload?.kind === 'numeric') setNumericAnswer(card.payload.answer);
      if (card.payload?.kind === 'working') {
        setWorkingSource(serialiseMarkScheme(card.payload.scheme));
        setWorkingFixtures(card.payload.fixtures ?? []);
      }
    }
  };

  // Auto-save only author-initiated changes, and never while a stored draft is awaiting a
  // restore/discard decision. State seeding is deliberately excluded from the dirty boundary.
  useEffect(() => {
    if (!loaded || !draftDirty || draftPrompt) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => persistDraftRef.current(), 800);
    return () => window.clearTimeout(draftTimer.current);
  }, [
    loaded,
    draftDirty,
    draftPrompt,
    type,
    front,
    back,
    tags,
    alsoReverse,
    numericAnswer,
    workingCompilation,
    workingFixtures,
    workingSource,
  ]);

  // Check for duplicate cards whenever front/back/type changes. A fresh, empty lesson
  // or bank has no backing deck yet, so there is nothing to check against.
  const duplicateCheckDeckId = (lessonMode ? lessonDeck : bankDeck)?.id;
  useEffect(() => {
    if (!loaded || !duplicateCheckDeckId) return;
    if (editing && !card) return;
    window.clearTimeout(duplicateTimer.current);
    duplicateTimer.current = window.setTimeout(async () => {
      const structured = type === 'numeric' || type === 'working';
      const audio = type === 'audio';
      const storedType: CardType = structured || audio ? 'front_back' : type;
      const backValue = type === 'cloze' || structured ? '' : back;
      if (!front.trim() || (!backValue.trim() && type !== 'cloze' && !structured)) {
        setDuplicateWarning(null);
        return;
      }
      const dup = await checkDuplicate(
        duplicateCheckDeckId,
        storedType,
        front,
        backValue,
        card?.id,
      );
      setDuplicateWarning(dup ?? null);
    }, 600);
    return () => window.clearTimeout(duplicateTimer.current);
  }, [loaded, duplicateCheckDeckId, type, front, back, editing, card]);

  const lessonPath = `/course/${courseId}/lesson/${lessonId}`;
  const bankPath = `/course/${courseId}/cards`;
  // Where the caller navigated from, when that differs from what the route alone
  // implies (e.g. a lesson-owned card opened for editing from Cards).
  // Absent on direct loads and hard refreshes, which drop router state — the
  // route-derived default below covers that case.
  const origin = (location.state as EditorOriginState | null)?.origin;
  // Where Cancel, post-save navigation and the breadcrumb "back" target all point.
  const backPath = origin?.path ?? (lessonMode ? lessonPath : bankPath);
  const backLabel = origin?.label ?? (lessonMode ? lesson?.name : 'Cards');

  if (
    (lessonMode
      ? course === undefined || lesson === undefined || lessonCards === undefined
      : course === undefined) ||
    (editing && card === undefined && !loaded)
  ) {
    return (
      <DelayedFallback>
        <CardEditorSkeleton />
      </DelayedFallback>
    );
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
        <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent underline">
          {courseId ? 'Back to course' : 'Back to dashboard'}
        </Link>
      </div>
    );
  }
  if (editing && card === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This card could not be found.</p>
        <Link to={backPath} className="text-accent underline">
          Back to {backLabel}
        </Link>
      </div>
    );
  }

  // Generated cards are owned by their Sequence or Occlusion: content, front/back, and
  // deletion are all managed there (edits here would be silently reverted on the next
  // regeneration), so this page shows a static preview and a link back instead of a form.
  const isSequenceGenerated =
    editing && card && card.sequenceItemId !== null && card.sequenceItemId !== undefined;
  const isOcclusionGenerated =
    editing && card && card.occlusionRegionId !== null && card.occlusionRegionId !== undefined;
  if (isSequenceGenerated || isOcclusionGenerated) {
    const owningSequence =
      isSequenceGenerated && sequences
        ? sequenceForItemId(sequences, card!.sequenceItemId!)
        : undefined;
    const owningOcclusion =
      isOcclusionGenerated && occlusions
        ? occlusionForRegionId(occlusions, card!.occlusionRegionId!)
        : undefined;
    const editHref = owningSequence
      ? `/course/${courseId}/sequence/${owningSequence.id}/edit`
      : owningOcclusion
        ? `/course/${courseId}/occlusion/${owningOcclusion.id}/edit`
        : undefined;
    return (
      <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
          <Link to={`/course/${courseId}`} className="transition-colors hover:text-ink">
            {course?.name}
          </Link>
          <ChevronRight />
          <Link to={backPath} className="transition-colors hover:text-ink">
            {backLabel}
          </Link>
          <ChevronRight />
          <span className="text-ink-soft">Card</span>
        </nav>

        <div>
          <header className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
            <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
            <div className="relative">
              <Link
                to={backPath}
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
              >
                <ChevronLeftIcon width={16} height={16} />
                Back
              </Link>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl tracking-tight md:text-5xl">Card</h1>
                <GeneratedCardBadge kind={isSequenceGenerated ? 'sequence' : 'occlusion'} />
              </div>
            </div>
          </header>

          <div className="mb-5 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3">
            <span className="text-sm text-accent">
              This card is generated from{' '}
              {owningSequence
                ? `the sequence “${owningSequence.name}”`
                : owningOcclusion
                  ? `the occlusion “${owningOcclusion.name}”`
                  : isSequenceGenerated
                    ? 'a sequence'
                    : 'an occlusion'}
              . Edit its {isSequenceGenerated ? 'content, order or cue window' : 'regions'} there —
              changes here would be lost the next time it regenerates.
            </span>
            {editHref && (
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => navigate(editHref)}
              >
                {isSequenceGenerated ? 'Edit sequence' : 'Edit occlusion'}
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Front</div>
              <div className="text-ink-soft">
                <CardContent card={card} side="front" />
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Back</div>
              <div className="text-ink">
                <CardContent card={card} side="back" />
              </div>
            </div>
            {(card.tags ?? []).length > 0 && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {(card.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink-soft"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isCloze = type === 'cloze';
  const isBasicReversed = type === 'basic_reversed';
  const isNumeric = type === 'numeric';
  const isWorking = type === 'working';
  const isAudio = type === 'audio';
  const isStructured = isNumeric || isWorking;
  const workingValid =
    !isWorking ||
    (workingCompilation.lines.length > 0 &&
      workingCompilation.lines.every((line) => line.kind === 'compiled'));
  const clozeValid = !isCloze || hasCloze(front);
  const frontValid = front.trim().length > 0 && (!isAudio || isAudioCardFront(front));
  const backValid = isCloze || isStructured || back.trim().length > 0;
  const numericValid = !isNumeric || numericAnswerSpecIsValid(numericAnswer);
  const canSave = frontValid && backValid && clozeValid && numericValid && workingValid;

  async function handleSave(andAnother = false) {
    const missingOwner = lessonMode ? !courseId || !lessonId : !courseId;
    if (!canSave || missingOwner) {
      // Shake the first invalid field to give the user tactile feedback on why save is blocked.
      if (!frontValid) setShakeField('front');
      else if (!numericValid) setShakeField('answer');
      else if (!workingValid) setShakeField('scheme');
      else if (!backValid) setShakeField('back');
      else if (!clozeValid) setShakeField('cloze');
      setShakeNonce((n) => n + 1);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShakeField(null), 500);
      return;
    }
    const storedType: CardType = isStructured || isAudio ? 'front_back' : type;
    const backValue = isCloze || isStructured ? '' : back;
    const payload: ItemPayload | undefined = isNumeric
      ? { v: 1, kind: 'numeric', answer: numericAnswer }
      : isWorking
        ? {
            v: 1,
            kind: 'working',
            scheme: workingCompilation.lines.flatMap((line) =>
              line.kind === 'compiled' ? [line.value] : [],
            ),
            ...(workingFixtures.length > 0 ? { fixtures: workingFixtures } : {}),
          }
        : undefined;
    if (editing && card) {
      await updateCard(card.id, { type: storedType, front, back: backValue, tags, payload });
      // If this is a basic_reversed card, update its reverse partner too.
      if (card.type === 'basic_reversed' && card.reverseCardId) {
        await updateCard(card.reverseCardId, { front: backValue, back: front });
      }
      clearDraft(draftKeyRef.current);
      setDraftDirty(false);
      flashSaved();
      // Let the confirmation flourish play briefly before leaving the page.
      window.setTimeout(() => {
        notify('Card updated.', 'positive');
        navigate(backPath);
      }, 450);
      return;
    }

    const reversed = !isCloze && !isBasicReversed && !isStructured && !isAudio && alsoReverse;
    if (lessonMode) {
      if (isBasicReversed) {
        await createLessonBasicReversedPair(courseId!, lessonId!, front, backValue, tags);
      } else if (reversed) {
        await createLessonCardWithReverse(courseId!, lessonId!, front, backValue, tags);
      } else {
        await createLessonCard(courseId!, lessonId!, storedType, front, backValue, tags, payload);
      }
    } else if (isBasicReversed) {
      await createCourseBasicReversedPair(courseId!, front, backValue, tags);
    } else if (reversed) {
      await createCourseCardWithReverse(courseId!, front, backValue, tags);
    } else {
      await createCourseCard(courseId!, storedType, front, backValue, tags, payload);
    }
    clearDraft(draftKeyRef.current);
    setDraftDirty(false);
    if (andAnother) {
      // Stay on the page for rapid entry: clear the content, keep the type and tags
      // (usually shared across a batch), refocus the first field, and tally the count.
      setFront('');
      setBack('');
      if (isNumeric) setNumericAnswer(EMPTY_NUMERIC_ANSWER);
      if (isWorking) setWorkingSource('');
      if (isWorking) setWorkingFixtures([]);
      setAddedCount((n) => n + (reversed ? 2 : 1));
      setFormKey((k) => k + 1);
      flashSaved();
    } else {
      flashSaved();
      window.setTimeout(() => {
        notify(reversed ? 'Card and its reverse added.' : 'Card added.', 'positive');
        navigate(backPath);
      }, 450);
    }
  }

  return (
    <div
      className={cn('mx-auto max-w-4xl px-6 pt-8 md:px-10', isTouchMode ? 'pb-24' : 'pb-10')}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          // In new-card mode, Cmd/Ctrl+Enter saves and keeps going for fast capture.
          void handleSave(!editing);
        }
      }}
    >
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
        <Link to={`/course/${courseId}`} className="transition-colors hover:text-ink">
          {course?.name}
        </Link>
        <ChevronRight />
        <Link to={backPath} className="transition-colors hover:text-ink">
          {backLabel}
        </Link>
        <ChevronRight />
        <span className="text-ink-soft">{editing ? 'Edit card' : 'New card'}</span>
      </nav>

      <div>
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <Link
              to={backPath}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
            >
              <ChevronLeftIcon width={16} height={16} />
              Back
            </Link>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">
              {editing ? 'Edit card' : 'New card'}
            </h1>
          </div>
        </header>

        <AnimatePresence>
          {draftPrompt && (
            <motion.div
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3"
            >
              <span className="text-sm text-accent">
                A saved draft from a previous session was found.
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={applyDraft}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                >
                  Restore draft
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-5">
          {/* Duplicate warning */}
          <AnimatePresence>
            {duplicateWarning && (
              <motion.div
                initial={m > 0 ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={m > 0 ? { opacity: 0 } : undefined}
                transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3"
              >
                <span className="text-sm text-warning-fg">
                  A card with identical content already exists in this course.
                </span>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  Dismiss
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card type selector */}
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Card type</div>
            <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-3', isTouchMode && 'gap-3')}>
              {[
                { key: 'front_back' as const, label: 'Front / Back' },
                { key: 'cloze' as const, label: 'Cloze deletion' },
                { key: 'basic_reversed' as const, label: 'Basic (reversed)' },
                { key: 'numeric' as const, label: 'Numeric answer' },
                { key: 'working' as const, label: 'Working' },
                { key: 'audio' as const, label: 'Audio' },
              ].map((t) => (
                <motion.button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setType(t.key);
                    setDraftDirty(true);
                  }}
                  aria-pressed={type === t.key}
                  whileTap={{ scale: 0.96 }}
                  className={cn(
                    'flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors',
                    type === t.key
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-ink-soft hover:border-line-strong active:bg-ink/10',
                    isTouchMode && 'min-h-14 text-base',
                    !isTouchMode && 'min-h-11',
                  )}
                >
                  {t.label}
                </motion.button>
              ))}
            </div>
          </div>

          {isCloze ? (
            <>
              <div
                key={`front-shake-${shakeField === 'front' || shakeField === 'cloze' ? shakeNonce : 'stable'}`}
                className={cn(
                  shakeField === 'front' || shakeField === 'cloze' ? 'shake-field' : '',
                )}
              >
                <MarkdownEditor
                  key={`cloze-${formKey}`}
                  inputRef={frontRef}
                  autoFocus={!editing}
                  label="Text (use the Cloze button to hide answers)"
                  value={front}
                  onChange={(value) => modifyDraftField(setFront, value)}
                  minRows={8}
                  allowCloze
                  clozePreview={showBackCloze ? 'back' : 'front'}
                  placeholder="The chemical symbol for water is {{c1::H2O}}."
                  onError={(m) => notify(m, 'negative')}
                  onTabForward={focusSaveButton}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={showBackCloze}
                  onChange={(e) => setShowBackCloze(e.target.checked)}
                  className="accent-accent"
                />
                Preview revealed answer
              </label>
              {!clozeValid && front.trim().length > 0 && (
                <p className="text-sm text-negative">
                  Add at least one cloze deletion using the Cloze button, e.g.{' '}
                  <code className="font-mono">{'{{c1::answer}}'}</code>.
                </p>
              )}
            </>
          ) : isAudio ? (
            <div
              key={`audio-${formKey}`}
              className={cn(shakeField === 'front' || shakeField === 'back' ? 'shake-field' : '')}
            >
              <AudioCardEditor
                front={front}
                back={back}
                onFrontChange={(value) => modifyDraftField(setFront, value)}
                onBackChange={(value) => modifyDraftField(setBack, value)}
                onError={(message) => notify(message, 'negative')}
              />
            </div>
          ) : isNumeric || isWorking ? (
            <>
              <div
                key={`front-shake-${shakeField === 'front' ? shakeNonce : 'stable'}`}
                className={cn(shakeField === 'front' ? 'shake-field' : '')}
              >
                <MarkdownEditor
                  key={`structured-front-${formKey}`}
                  inputRef={frontRef}
                  autoFocus={!editing}
                  label="Question"
                  value={front}
                  onChange={(value) => modifyDraftField(setFront, value)}
                  minRows={8}
                  placeholder="Question or prompt. Markdown, maths and images are supported."
                  onError={(message) => notify(message, 'negative')}
                />
              </div>
              {isNumeric ? (
                <div
                  key={`answer-shake-${shakeField === 'answer' ? shakeNonce : 'stable'}`}
                  className={cn(shakeField === 'answer' ? 'shake-field' : '')}
                >
                  <NumericAnswerEditor
                    value={numericAnswer}
                    onChange={(value) => modifyDraftField(setNumericAnswer, value)}
                    invalid={shakeField === 'answer'}
                  />
                </div>
              ) : (
                <div
                  key={`scheme-shake-${shakeField === 'scheme' ? shakeNonce : 'stable'}`}
                  className={cn(shakeField === 'scheme' ? 'shake-field' : '')}
                >
                  <MarkSchemeEditor
                    value={workingSource}
                    onChange={(value) => modifyDraftField(setWorkingSource, value)}
                    fixtures={workingFixtures}
                    onFixturesChange={(fixtures) => {
                      setWorkingFixtures(fixtures);
                      setDraftDirty(true);
                    }}
                    onDraftMarkScheme={() => void copyMarkSchemePrompt()}
                    draftDisabled={!front.trim()}
                    invalid={shakeField === 'scheme'}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div
                key={`front-shake-${shakeField === 'front' ? shakeNonce : 'stable'}`}
                className={cn(shakeField === 'front' ? 'shake-field' : '')}
              >
                <MarkdownEditor
                  key={`front-${formKey}`}
                  inputRef={frontRef}
                  autoFocus={!editing}
                  label="Front"
                  value={front}
                  onChange={(value) => modifyDraftField(setFront, value)}
                  minRows={8}
                  placeholder="Question or prompt. Markdown, maths and images are supported."
                  onError={(m) => notify(m, 'negative')}
                  onTabForward={() => backRef.current?.focus()}
                />
              </div>
              <div
                key={`back-shake-${shakeField === 'back' ? shakeNonce : 'stable'}`}
                className={cn(shakeField === 'back' ? 'shake-field' : '')}
              >
                <MarkdownEditor
                  inputRef={backRef}
                  label="Back"
                  value={back}
                  onChange={(value) => modifyDraftField(setBack, value)}
                  minRows={8}
                  placeholder="Answer. Markdown, maths and images are supported."
                  onError={(m) => notify(m, 'negative')}
                  onTabForward={focusSaveButton}
                  onTabBackward={() => frontRef.current?.focus()}
                />
              </div>
            </>
          )}

          {/* Tags */}
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Tags</div>
            <TagInput
              tags={tags}
              onChange={(nextTags) => {
                setTags(nextTags);
                setDraftDirty(true);
              }}
              suggestions={tagSuggestions}
              placeholder="Add tags to group cards for filtered study…"
            />
          </div>
        </div>
      </div>

      {/* Sticky action bar — fades into the page rather than sitting on a hard white slab.
          The wrapper ignores pointer events so the transparent fade never blocks the
          content scrolling beneath it; the button row re-enables themotion.
          In touch mode, the bar becomes a floating bottom-sheet with larger controls. */}
      <div
        role="region"
        aria-label="Card editor actions"
        className={cn(
          'pointer-events-none z-30 mt-8',
          isTouchMode
            ? 'fixed inset-x-0 bottom-0 rounded-t-3xl border-t border-line-strong bg-surface pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/15'
            : 'sticky bottom-0 -mx-6 bg-gradient-to-t from-paper via-paper to-transparent px-6 pb-5 pt-12 md:-mx-10 md:px-10',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex flex-wrap items-center gap-3',
            isTouchMode && 'max-w-3xl mx-auto',
          )}
        >
          {!editing && !isCloze && !isBasicReversed && !isStructured && !isAudio && (
            <motion.button
              type="button"
              onClick={() => {
                setAlsoReverse((v) => !v);
                setDraftDirty(true);
              }}
              whileTap={{ scale: 0.96 }}
              aria-pressed={alsoReverse}
              title="Also create a card testing the back side"
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                alsoReverse
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              <span
                className={cn(
                  'grid h-4 w-4 place-items-center rounded-full border transition-colors',
                  alsoReverse ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                )}
              >
                <AnimatePresence>
                  {alsoReverse && (
                    <motion.span
                      initial={m > 0 ? { scale: 0, rotate: -25 } : false}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={m > 0 ? { scale: 0 } : undefined}
                      transition={
                        m > 0 ? { type: 'spring', stiffness: 600, damping: 16 } : { duration: 0 }
                      }
                      className="inline-flex"
                    >
                      <CheckIcon width={11} height={11} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              Also create reverse
            </motion.button>
          )}
          {!editing && addedCount > 0 && (
            <span className="text-sm text-ink-faint">
              {addedCount} card{addedCount === 1 ? '' : 's'} added this sitting
            </span>
          )}
          <AnimatePresence>
            {showSaved && (
              <motion.span
                initial={m > 0 ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={m > 0 ? { scale: 0.6, opacity: 0 } : undefined}
                transition={
                  m > 0 ? { type: 'spring', stiffness: 500, damping: 20 } : { duration: 0 }
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-positive/15 px-3 py-1 text-sm font-medium text-positive"
              >
                <motion.span
                  initial={m > 0 ? { scale: 0, rotate: -25 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={
                    m > 0
                      ? { delay: 0.06 * m, type: 'spring', stiffness: 600, damping: 16 }
                      : { duration: 0 }
                  }
                  className="inline-flex"
                >
                  <CheckIcon width={16} height={16} />
                </motion.span>
                Saved
              </motion.span>
            )}
          </AnimatePresence>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(backPath)}>
              {!editing && addedCount > 0 ? 'Done' : 'Cancel'}
            </Button>
            {!editing && (
              <Button
                ref={saveAddRef}
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={!canSave}
                title="Save and add another (Ctrl/Cmd+Enter)"
              >
                Save &amp; add another
              </Button>
            )}
            <Button
              ref={saveRef}
              variant="primary"
              onClick={() => handleSave(false)}
              disabled={!canSave}
            >
              {editing ? 'Save changes' : 'Add card'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardEditorSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <div className="mb-1 h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-48 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 h-3 w-20 animate-pulse rounded bg-ink/10" />
          <div className="flex gap-2">
            <div className="h-10 flex-1 animate-pulse rounded-lg bg-ink/10" />
            <div className="h-10 flex-1 animate-pulse rounded-lg bg-ink/10" />
          </div>
        </div>
        <div className="h-40 w-full animate-pulse rounded-lg bg-ink/10" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-ink/10" />
        <div>
          <div className="mb-2 h-3 w-12 animate-pulse rounded bg-ink/10" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-ink/10" />
        </div>
      </div>
    </div>
  );
}

function ChevronRight() {
  return <span className="text-ink-faint/60">/</span>;
}
