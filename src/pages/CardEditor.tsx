import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { useCardSaveConfirmation } from './useCardSaveConfirmation';
import { Skeleton } from '../components/ui/Skeleton';
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
import { isLessonAuthoringMode } from '../course/lessonViewMode';
import { CardAnswerModeField } from '../components/cards/AnswerModeControl';
import { Button } from '../components/ui/Button';
import { CardTypePicker, type EditorCardType } from '../components/cards/CardTypePicker';
import { CardPreview, type PreviewSide } from '../components/cards/CardPreview';
import { CardEditorActions } from '../components/cards/CardEditorActions';
import { riseIn } from '../components/course/riseIn';
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
} from '../db/cardRepository';
import { hasCloze } from '../utils/cloze';
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
import { scaledSpring } from '../components/ui/motion';
import { useIsTouchMode } from '../state/inputMode';
import { saveDraft, loadDraft, clearDraft, draftKey } from '../utils/drafts';
import type { EditorOriginState } from '../utils/editorOrigin';
import type {
  AnswerMode,
  Card,
  CardType,
  ItemFixture,
  ItemPayload,
  NumericAnswerSpec,
} from '../db/types';
import { isAudioCardFront } from '../media/audio';

/** Shared card-surface treatment: white, rounded, softly lifted, never outlined. */
const CARD_SURFACE =
  'shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]';

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
  const [answerMode, setAnswerMode] = useState<AnswerMode>();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [numericAnswer, setNumericAnswer] = useState<NumericAnswerSpec>(EMPTY_NUMERIC_ANSWER);
  const [workingSource, setWorkingSource] = useState('');
  const [workingFixtures, setWorkingFixtures] = useState<ItemFixture[]>([]);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const [tags, setTags] = useState<string[]>([]);
  // Which side of the live preview is showing. Preview-only: never an authoring change.
  const [previewSide, setPreviewSide] = useState<PreviewSide>('front');
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
  const draftTimer = useRef<number | undefined>(undefined);

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
      answerMode,
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
    setAnswerMode(undefined);
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
  const { showSaved, flashSaved, afterSaved } = useCardSaveConfirmation(currentDraftKey);
  const [shakeField, setShakeField] = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const shakeTimer = useRef<number | undefined>(undefined);
  const [duplicateWarning, setDuplicateWarning] = useState<Card | null>(null);
  const duplicateTimer = useRef<number | undefined>(undefined);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  function modifyDraftField<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDraftDirty(true);
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
        setAnswerMode(card.answerMode);
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
    setAnswerMode(draft.answerMode);
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
      setAnswerMode(card.answerMode);
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
    answerMode,
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
          Back to Today
        </Link>
      </div>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
        <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent underline">
          {courseId ? 'Back to course' : 'Back to Today'}
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
      <div className={`${COURSE_PAGE_FRAME} pb-10 pt-8`}>
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <Link
              to={backPath}
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <ChevronLeftIcon width={14} height={14} />
              {backLabel ?? 'Back'}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-tight md:text-[44px]">
                Card
              </h1>
              <GeneratedCardBadge kind={isSequenceGenerated ? 'sequence' : 'occlusion'} />
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
            <span className="text-sm text-accent-ink">
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

          <div className="grid gap-6 md:grid-cols-2">
            <div className={`rounded-3xl bg-surface p-7 ${CARD_SURFACE}`}>
              <div className="mb-3 text-[13px] font-bold text-ink-soft">Front</div>
              <div className="text-ink-soft">
                <CardContent card={card} side="front" />
              </div>
            </div>
            <div className={`rounded-3xl bg-surface p-7 ${CARD_SURFACE}`}>
              <div className="mb-3 text-[13px] font-bold text-ink-soft">Back</div>
              <div className="text-ink">
                <CardContent card={card} side="back" />
              </div>
            </div>
          </div>
          {(card.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(card.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-ink/[0.06] px-3 py-1 text-[13px] text-ink-soft"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
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
  const canReverse = !editing && !isCloze && !isBasicReversed && !isStructured && !isAudio;

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
    const storedAnswerMode =
      course && !course.archived && isLessonAuthoringMode(course)
        ? isStructured
          ? undefined
          : answerMode
        : editing
          ? card?.answerMode
          : undefined;
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
      await updateCard(card.id, {
        type: storedType,
        front,
        back: backValue,
        tags,
        payload,
        answerMode: storedAnswerMode,
      });
      // If this is a basic_reversed card, update its reverse partner too.
      if (card.type === 'basic_reversed' && card.reverseCardId) {
        await updateCard(card.reverseCardId, { front: backValue, back: front });
      }
      clearDraft(draftKeyRef.current);
      setDraftDirty(false);
      flashSaved();
      // Let the confirmation flourish play briefly before leaving the page.
      afterSaved(() => {
        notify('Card updated.', 'positive');
        void navigate(backPath);
      });
      return;
    }

    const reversed = !isCloze && !isBasicReversed && !isStructured && !isAudio && alsoReverse;
    if (lessonMode) {
      if (isBasicReversed) {
        await createLessonBasicReversedPair(
          courseId!,
          lessonId!,
          front,
          backValue,
          tags,
          storedAnswerMode,
        );
      } else if (reversed) {
        await createLessonCardWithReverse(
          courseId!,
          lessonId!,
          front,
          backValue,
          tags,
          storedAnswerMode,
        );
      } else {
        await createLessonCard(
          courseId!,
          lessonId!,
          storedType,
          front,
          backValue,
          tags,
          payload,
          storedAnswerMode,
        );
      }
    } else if (isBasicReversed) {
      await createCourseBasicReversedPair(courseId!, front, backValue, tags, storedAnswerMode);
    } else if (reversed) {
      await createCourseCardWithReverse(courseId!, front, backValue, tags, storedAnswerMode);
    } else {
      await createCourseCard(
        courseId!,
        storedType,
        front,
        backValue,
        tags,
        payload,
        storedAnswerMode,
      );
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
      afterSaved(() => {
        notify(reversed ? 'Card and its reverse added.' : 'Card added.', 'positive');
        void navigate(backPath);
      });
    }
  }

  return (
    <div
      className={cn(COURSE_PAGE_FRAME, 'pt-8', isTouchMode ? 'pb-40' : 'pb-10')}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          // In new-card mode, Cmd/Ctrl+Enter saves and keeps going for fast capture.
          void handleSave(!editing);
        }
      }}
    >
      <div className="flex flex-col gap-6">
        <motion.header {...riseIn(0, m)} className="flex flex-col gap-2">
          <Link
            to={backPath}
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <ChevronLeftIcon width={14} height={14} />
            {backLabel ?? 'Back'}
          </Link>
          <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-tight md:text-[44px]">
            {editing ? 'Edit card' : 'New card'}
          </h1>
          {/* Announces a save to assistive technology; the sighted cue is the tick on the preview. */}
          <span role="status" className="sr-only">
            {showSaved ? 'Saved' : ''}
          </span>
        </motion.header>

        <AnimatePresence>
          {draftPrompt && (
            <motion.div
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3"
            >
              <span className="text-sm text-accent-ink">
                A saved draft from a previous session was found.
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={discardDraft}>
                  Discard
                </Button>
                <Button variant="primary" size="sm" onClick={applyDraft}>
                  Restore draft
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {duplicateWarning && (
            <motion.div
              initial={m > 0 ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={m > 0 ? { opacity: 0 } : undefined}
              transition={{ duration: 0.18 * m, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-2xl bg-warning/10 px-4 py-3"
            >
              <span className="text-sm text-warning-fg">
                A card with identical content already exists in this course.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setDuplicateWarning(null)}
              >
                Dismiss
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div {...riseIn(1, m)}>
          <CardTypePicker
            value={type}
            onChange={(next) => {
              setType(next);
              setDraftDirty(true);
            }}
          />
        </motion.div>

        <motion.div {...riseIn(2, m)} className="grid items-start gap-6 lg:grid-cols-5">
          <section
            aria-label="Card content"
            className={`flex min-w-0 flex-col gap-5 rounded-3xl bg-surface p-5 md:p-7 lg:col-span-3 ${CARD_SURFACE}`}
          >
            {isCloze ? (
              <>
                <div
                  key={`front-shake-${shakeField === 'front' || shakeField === 'cloze' ? shakeNonce : 'stable'}`}
                  className={cn(
                    shakeField === 'front' || shakeField === 'cloze' ? 'shake-field' : '',
                  )}
                >
                  <MarkdownEditor
                    hidePreview
                    key={`cloze-${formKey}`}
                    inputRef={frontRef}
                    autoFocus={!editing}
                    label="Text (use the Cloze button to hide answers)"
                    value={front}
                    onChange={(value) => modifyDraftField(setFront, value)}
                    minRows={8}
                    allowCloze
                    clozePreview={previewSide === 'back' ? 'back' : 'front'}
                    placeholder="The chemical symbol for water is {{c1::H2O}}."
                    onError={(m) => notify(m, 'negative')}
                    onTabForward={focusSaveButton}
                  />
                </div>
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
                    hidePreview
                    key={`structured-front-${formKey}`}
                    inputRef={frontRef}
                    autoFocus={!editing}
                    label="Question"
                    value={front}
                    onChange={(value) => modifyDraftField(setFront, value)}
                    minRows={8}
                    placeholder="Question or prompt"
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
                    hidePreview
                    key={`front-${formKey}`}
                    inputRef={frontRef}
                    autoFocus={!editing}
                    label="Front"
                    value={front}
                    onChange={(value) => modifyDraftField(setFront, value)}
                    minRows={6}
                    placeholder="Question or prompt"
                    onError={(m) => notify(m, 'negative')}
                    onTabForward={() => backRef.current?.focus()}
                  />
                </div>
                <div
                  key={`back-shake-${shakeField === 'back' ? shakeNonce : 'stable'}`}
                  className={cn(shakeField === 'back' ? 'shake-field' : '')}
                >
                  <MarkdownEditor
                    hidePreview
                    inputRef={backRef}
                    label="Back"
                    value={back}
                    onChange={(value) => modifyDraftField(setBack, value)}
                    minRows={6}
                    placeholder="Answer"
                    onError={(m) => notify(m, 'negative')}
                    onTabForward={focusSaveButton}
                    onTabBackward={() => frontRef.current?.focus()}
                  />
                </div>
              </>
            )}

            <div>
              <div className="mb-2 text-[13px] font-bold text-ink-soft">Tags</div>
              <TagInput
                tags={tags}
                onChange={(nextTags) => {
                  setTags(nextTags);
                  setDraftDirty(true);
                }}
                suggestions={tagSuggestions}
                placeholder="Add tags"
              />
            </div>

            {(!isStructured || canReverse) && (
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-5">
                {!isStructured && (
                  <CardAnswerModeField
                    courseId={courseId}
                    lessonId={lessonId ?? card?.primaryLessonId ?? undefined}
                    value={answerMode}
                    onChange={(value) => modifyDraftField(setAnswerMode, value)}
                  />
                )}
                {canReverse && (
                  <motion.button
                    type="button"
                    onClick={() => {
                      setAlsoReverse((v) => !v);
                      setDraftDirty(true);
                    }}
                    data-press=""
                    whileTap={m > 0 ? { scale: 0.96 } : undefined}
                    aria-pressed={alsoReverse}
                    title="Also create a card testing the back side"
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      alsoReverse
                        ? 'bg-accent-soft text-accent-ink'
                        : 'bg-ink/[0.06] text-ink-soft hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-4 w-4 place-items-center rounded-full transition-colors',
                        alsoReverse ? 'bg-accent text-accent-fg' : 'bg-ink/15',
                      )}
                    >
                      <AnimatePresence>
                        {alsoReverse && (
                          <motion.span
                            initial={m > 0 ? { scale: 0, rotate: -25 } : false}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={m > 0 ? { scale: 0 } : undefined}
                            transition={scaledSpring(m, 600, 16)}
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
              </div>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:col-span-2">
            <CardPreview
              type={isStructured || isAudio ? 'front_back' : type}
              front={front}
              back={back}
              side={previewSide}
              onSideChange={setPreviewSide}
              canFlip={!isStructured}
              saved={showSaved}
            />
            <CardEditorActions
              editing={editing}
              canSave={canSave}
              addedCount={addedCount}
              isTouchMode={isTouchMode}
              onCancel={() => navigate(backPath)}
              onSave={(andAnother) => void handleSave(andAnother)}
              saveAddRef={saveAddRef}
              saveRef={saveRef}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function CardEditorSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} pb-10 pt-8`}>
      <Skeleton className="mb-2 h-11 w-24 rounded-full bg-ink/10" />
      <Skeleton className="mb-6 h-11 w-56 rounded-xl bg-ink/10" />
      <Skeleton className="mb-6 h-11 w-96 max-w-full rounded-full bg-ink/[0.06]" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-3xl bg-ink/[0.06] lg:col-span-3" />
        <Skeleton className="h-72 rounded-3xl bg-ink/[0.06] lg:col-span-2" />
      </div>
    </div>
  );
}
