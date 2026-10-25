import { MissingRecord } from '../components/course/MissingRecord';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
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
import { CardTypePicker } from '../components/cards/CardTypePicker';
import { CardSources } from '../components/cards/CardSources';
import type { PreviewSide } from '../components/cards/CardPreview';
import { riseIn } from '../components/course/riseIn';
import { checkDuplicate } from '../db/cardRepository';
import { ChevronLeftIcon } from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import { useMotionSpeed, speedMultiplier } from '../state/motionSpeed';
import { useIsTouchMode } from '../state/inputMode';
import { draftKey } from '../utils/drafts';
import { useReturn } from '../utils/editorOrigin';
import type { Card, CardType } from '../db/types';
import { useCardEditorDraft } from './cardEditor/useCardEditorDraft';
import { useCardEditorSave } from './cardEditor/useCardEditorSave';
import { useCardEditorFocus } from './cardEditor/useCardEditorFocus';
import { CardAuthoringFields } from './cardEditor/CardAuthoringFields';
import { CardAuthoringPreview } from './cardEditor/CardAuthoringPreview';
import { GeneratedCardPreview } from './cardEditor/GeneratedCardPreview';

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

  const currentDraftKey = draftKey(lessonId ?? `bank:${courseId}`, cardId ?? 'new');
  const draft = useCardEditorDraft({ currentDraftKey, editing, card });
  const lessonPath = `/course/${courseId}/lesson/${lessonId}`;
  const bankPath = `/course/${courseId}/cards`;
  // Cancel, post-save navigation and the breadcrumb all return to where the learner
  // came from (see src/utils/editorOrigin.ts), or to the route's own default after a
  // deep link or refresh.
  const returnTo = useReturn({
    path: lessonMode ? lessonPath : bankPath,
    label: (lessonMode ? lesson?.name : 'Cards') ?? 'Back',
  });
  const backPath = returnTo.to;
  const backLabel = returnTo.label;

  const save = useCardEditorSave({ draft, course, card, courseId, lessonId, returnTo });
  const focus = useCardEditorFocus(draft.values.type, save.shakeField, save.shakeNonce);
  const { type, front, back } = draft.values;
  const { loaded, draftPrompt, applyDraft, discardDraft, leaveForm } = draft;
  const { handleSave, showSaved } = save;
  const [previewSide, setPreviewSide] = useState<PreviewSide>('front');
  const [duplicateWarning, setDuplicateWarning] = useState<Card | null>(null);
  const duplicateTimer = useRef<number | undefined>(undefined);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const isTouchMode = useIsTouchMode();
  // Existing tags across the lesson or bank, offered as suggestions in the tag input.
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    const source = lessonMode ? lessonCards : bankCards;
    for (const c of source ?? []) {
      for (const t of c.tags ?? []) set.add(t);
    }
    return [...set].sort();
  }, [lessonMode, lessonCards, bankCards]);

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

  if (
    (lessonMode
      ? course === undefined || lesson === undefined || lessonCards === undefined
      : course === undefined) ||
    // Hold the form until a card's type is seeded, so it does not arrive as a type change.
    (editing && card !== null && !loaded)
  ) {
    return <PageLoading />;
  }
  if (course === null) {
    return (
      <MissingRecord message="This course could not be found." to="/">
        Back to Today
      </MissingRecord>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <MissingRecord
        message="This lesson could not be found."
        to={courseId ? `/course/${courseId}` : '/'}
      >
        {courseId ? 'Back to course' : 'Back to Today'}
      </MissingRecord>
    );
  }
  if (editing && card === null) {
    return (
      <MissingRecord message="This card could not be found." to={backPath}>
        Back to {backLabel}
      </MissingRecord>
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
    return (
      <GeneratedCardPreview
        card={card!}
        sequences={sequences}
        occlusions={occlusions}
        courseId={courseId}
        returnTo={returnTo}
      />
    );
  }

  // The chosen editor replaces this one, so its Back returns to this page's origin.
  const openOtherEditor = (kind: 'sequence' | 'occlusion') =>
    leaveForm(() =>
      navigate(
        lessonMode
          ? `/course/${courseId}/lesson/${lessonId}/${kind}/new`
          : `/course/${courseId}/${kind}/new`,
        { replace: true, state: location.state },
      ),
    );

  return (
    <div
      className={cn(COURSE_PAGE_FRAME, 'pt-8', isTouchMode ? 'pb-40' : 'pb-10')}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
          return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          // In new-card mode, Cmd/Ctrl+Enter saves and keeps going for fast capture.
          void handleSave(!editing);
        } else if (e.key === 'Escape' && !e.defaultPrevented) {
          // Nested popovers consume Escape first; otherwise it cancels, like the dialogs do.
          returnTo.goBack();
        }
      }}
    >
      <div className="flex flex-col gap-6">
        <motion.header {...riseIn(0, m)} className="flex flex-col gap-2">
          <Link
            {...returnTo.linkProps}
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
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
            onChange={draft.changeType}
            onNewSequence={editing ? undefined : () => openOtherEditor('sequence')}
            onNewOcclusion={editing ? undefined : () => openOtherEditor('occlusion')}
            sources={
              editing
                ? undefined
                : (revealed) =>
                    lessonMode
                      ? lesson &&
                        lessonCards && (
                          <CardSources
                            courseId={courseId!}
                            lessonId={lesson.id}
                            targetName={lesson.name}
                            lessonCards={lessonCards}
                            schedulingUnitId={lessonDeck?.id}
                            showLink={revealed}
                            onAdded={() => leaveForm(returnTo.goBack)}
                          />
                        )
                      : course && (
                          <CardSources
                            courseId={course.id}
                            targetName={course.name}
                            schedulingUnitId={bankDeck?.id}
                            onAdded={() => leaveForm(returnTo.goBack)}
                          />
                        )
            }
          />
        </motion.div>

        <motion.div {...riseIn(2, m)} className="grid items-start gap-6 lg:grid-cols-5">
          <CardAuthoringFields
            draft={draft}
            focus={focus}
            save={save}
            editing={editing}
            courseId={courseId}
            previewSide={previewSide}
            tagSuggestions={tagSuggestions}
            m={m}
          />

          <CardAuthoringPreview
            draft={draft}
            focus={focus}
            save={save}
            editing={editing}
            previewSide={previewSide}
            setPreviewSide={setPreviewSide}
            isTouchMode={isTouchMode}
            onCancel={returnTo.goBack}
          />
        </motion.div>
      </div>
    </div>
  );
}
