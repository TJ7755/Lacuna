import { AnimatePresence, m as motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MissingRecord } from '../components/course/MissingRecord';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { GeneratedQuestionConfiguration } from '../components/questions/GeneratedQuestionConfiguration';
import {
  QuestionMetadataFields,
  questionLabelClass as labelClass,
} from '../components/questions/QuestionMetadataFields';
import { QuestionSegmented } from '../components/questions/QuestionSegmented';
import { useCourseQuestionData, useQuestionRecord } from '../components/questions/useQuestionData';
import { AppLink as Link } from '../components/ui/AppLink';
import { Button } from '../components/ui/Button';
import { ConfirmInlineSwap } from '../components/ui/ConfirmInline';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { NavigationGuard } from '../components/ui/NavigationGuard';
import { Skeleton } from '../components/ui/Skeleton';
import { StepSwap } from '../components/ui/StepSwap';
import { TagInput } from '../components/ui/TagInput';
import { useToast } from '../components/ui/Toast';
import { Toggle } from '../components/ui/Toggle';
import { ChevronLeftIcon, TrashIcon } from '../components/ui/icons';
import { motionTransition } from '../components/ui/motion';
import { canEditLessons } from '../course/lessonViewMode';
import { useEditorKeys } from '../hooks/dialogKeys';
import { compileMarkScheme } from '../items/markSchemeCompiler';
import { questionGeneratorRegistry } from '../questions/generators';
import {
  createConcept,
  createFixedQuestion,
  createGeneratedQuestion,
  deleteQuestion,
  updateFixedQuestion,
  updateGeneratedQuestion,
} from '../questions/repository';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { useCourse, useLessons } from '../state/useCourseData';
import { FixedQuestionFields } from './FixedQuestionFields';
import {
  newQuestionState,
  questionDraftKey,
  questionStateFromRecord,
  useQuestionDraft,
} from './questionDraft';
import { fixedPayload, generatedConfigurationErrors } from './questionValidation';

export function QuestionEditor() {
  const { courseId, questionId } = useParams<{ courseId: string; questionId?: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const course = useCourse(courseId);
  const editable = Boolean(course && canEditLessons(course));
  const lessons = useLessons(courseId);
  const data = useCourseQuestionData(courseId);
  const record = useQuestionRecord(questionId);
  const editing = Boolean(questionId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const draft = useQuestionDraft(questionDraftKey(courseId ?? 'missing', questionId));
  const {
    kind,
    name,
    newConceptName = '',
    lessonId,
    targetConceptId,
    prerequisiteConceptIds,
    tags,
    suspended,
    prompt,
    explanation,
    answerKind,
    numericAnswer,
    workingSource,
    workingFixtures,
    generatorConfig,
  } = draft.state;
  const [saving, setSaving] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const generator = questionGeneratorRegistry.list()[0];

  useEffect(() => {
    if (draft.loaded || data === undefined || (editing && record === undefined)) return;
    if (!editing) {
      draft.initialise(newQuestionState(''));
      return;
    }
    if (!record) {
      draft.initialise(newQuestionState(''));
      return;
    }
    draft.initialise(questionStateFromRecord(record.question, record.conceptSet));
  }, [data, draft, editing, record]);

  // Field messages appear once a save has been attempted, and update as the fields change.
  const [attempted, setAttempted] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const numericAnswerRef = useRef<HTMLInputElement>(null);
  const [numericFocusAttempt, setNumericFocusAttempt] = useState(0);
  useLayoutEffect(() => {
    // The numeric editor publishes its invalid target after the error state commits.
    if (numericFocusAttempt === 0) return;
    const target = numericAnswerRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center' });
  }, [numericFocusAttempt]);
  const configurationRef = useRef<HTMLElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const conceptRef = useRef<HTMLSelectElement>(null);
  const payload =
    kind === 'fixed'
      ? fixedPayload(answerKind, numericAnswer, workingCompilation, workingFixtures)
      : undefined;
  const configurationErrors = useMemo(
    () =>
      kind === 'generated' && generator
        ? generatedConfigurationErrors(generator, generatorConfig)
        : {},
    [generator, generatorConfig, kind],
  );
  const firstConfigurationError = generator?.configurationFields.find(
    (field) => configurationErrors[field.key],
  )?.key;
  const allErrors = {
    configuration: firstConfigurationError,
    prompt: kind === 'fixed' && !prompt.trim() ? 'Add a prompt.' : undefined,
    answer: kind === 'fixed' && !payload ? 'Add a valid answer.' : undefined,
    explanation: kind === 'fixed' && !explanation.trim() ? 'Add a worked explanation.' : undefined,
    name: !name.trim() ? 'Add a name.' : undefined,
    concept: !targetConceptId ? 'Choose the primary skill practised.' : undefined,
  };
  const errors: Partial<typeof allErrors> = attempted ? allErrors : {};

  /** Where a new Question's entry starts: its prompt, or its name for a generated family. */
  const focusEntry = () =>
    (kind === 'fixed' ? promptRef.current : nameRef.current)?.focus({ preventScroll: true });
  const entryFocused = useRef(false);
  useEffect(() => {
    if (!draft.loaded || entryFocused.current) return;
    entryFocused.current = true;
    focusEntry();
    // Only on first load; later changes of form keep the user's focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.loaded]);

  /** `another` starts a fresh Question in the same lesson, Concept and form. */
  const save = async (another = false) => {
    if (!editable || saving || !courseId) return;
    setAttempted(true);
    const first = (
      [
        [
          'configuration',
          configurationRef.current?.querySelector<HTMLElement>(
            `[name="${firstConfigurationError}"]`,
          ),
        ],
        ['prompt', promptRef.current],
        [
          'answer',
          answerKind === 'numeric'
            ? null
            : answerRef.current?.querySelector<HTMLElement>('input, textarea, select'),
        ],
        ['explanation', explanationRef.current],
        ['name', nameRef.current],
        ['concept', conceptRef.current],
      ] as const
    ).find(([key]) => allErrors[key]);
    if (first) {
      if (first[0] === 'answer' && answerKind === 'numeric') {
        setNumericFocusAttempt((attempt) => attempt + 1);
      } else {
        first[1]?.focus();
      }
      return;
    }
    setSaving(true);
    try {
      const shared = {
        name,
        primaryLessonId: lessonId || null,
        tags,
        suspended,
        targetConceptId,
        prerequisiteConceptIds,
      };
      if (kind === 'fixed' && payload) {
        if (questionId) {
          await updateFixedQuestion(questionId, { ...shared, prompt, payload, explanation });
        } else {
          await createFixedQuestion({ courseId, ...shared, prompt, payload, explanation });
        }
      } else {
        if (!generator) throw new Error('No built-in Question generator is available.');
        if (questionId) {
          await updateGeneratedQuestion(questionId, {
            ...shared,
            generatorKey: generator.key,
            generatorVersion: generator.version,
            generatorConfig,
          });
        } else {
          await createGeneratedQuestion({
            courseId,
            ...shared,
            generatorKey: generator.key,
            generatorVersion: generator.version,
            generatorConfig,
          });
        }
      }
      notify(questionId ? 'Question updated.' : 'Question created.', 'positive');
      if (another && !questionId) {
        setAttempted(false);
        draft.startAnother({
          ...newQuestionState(targetConceptId),
          kind,
          lessonId,
          answerKind,
          tags,
        });
        requestAnimationFrame(focusEntry);
        return;
      }
      draft.finish();
      void navigate(`/course/${courseId}/questions?view=individual`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the Question.', 'negative');
    } finally {
      setSaving(false);
    }
  };
  const editorKeys = useEditorKeys({
    onCancel: () => void navigate(`/course/${courseId}/questions?view=individual`),
    onSubmit: () => void save(!editing),
  });

  const addConcept = async () => {
    if (!editable || !courseId || !newConceptName.trim()) return;
    try {
      const concept = await createConcept(courseId, newConceptName);
      draft.update({ targetConceptId: concept.id, newConceptName: '' });
      notify('Concept created.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the Concept.', 'negative');
    }
  };

  const remove = async () => {
    if (!editable || !questionId || !courseId) return;
    await deleteQuestion(questionId);
    draft.finish();
    notify('Question deleted.', 'positive');
    void navigate(`/course/${courseId}/questions?view=individual`);
  };

  if (
    course === undefined ||
    lessons === undefined ||
    data === undefined ||
    (editing && record === undefined) ||
    !draft.loaded
  ) {
    return (
      <PageLoading
        fallback={
          <div className={`${COURSE_PAGE_FRAME} py-8`}>
            <Skeleton className="h-12 w-72 rounded-xl bg-ink/10" />
          </div>
        }
      />
    );
  }
  if (course === null || (editing && record === null)) {
    return (
      <MissingRecord
        message="This Question could not be found."
        to={course === null ? '/' : `/course/${courseId}/questions`}
      >
        {course === null ? 'Back to Today' : 'Questions'}
      </MissingRecord>
    );
  }

  const tagSuggestions = [...new Set(data.questions.flatMap((question) => question.tags))].sort();
  const saveLabel = saving ? 'Saving…' : editing ? 'Save Question' : 'Create Question';

  return (
    <div className={`${COURSE_PAGE_FRAME} pb-10 pt-6 md:pt-8`} {...editorKeys}>
      <NavigationGuard
        active={draft.shouldBlock}
        onAttempt={draft.flushDraft}
        title="Leave this Question?"
        message="Your unsaved changes are kept as a draft and can be restored when you return."
      />
      <Link
        to={`/course/${courseId}/questions`}
        className="mb-7 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Questions
      </Link>

      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          {editing ? 'Edit Question' : 'Create a Question'}
        </h1>
      </header>

      {draft.draftPrompt && (
        <section
          role="status"
          className="mb-8 flex flex-col gap-4 rounded-3xl bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-ink">A saved draft from a previous session was found.</p>
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={draft.restoreDraft}>
              Restore draft
            </Button>
            <Button type="button" onClick={draft.discardDraft}>
              Discard draft
            </Button>
          </div>
        </section>
      )}

      <div className="space-y-8">
        {!editing && (
          <fieldset>
            <legend className={labelClass}>Question form</legend>
            <QuestionSegmented
              label="Question form"
              value={kind}
              onChange={(option) => draft.update({ kind: option })}
              options={[
                { value: 'fixed', label: 'Fixed problem' },
                { value: 'generated', label: 'Generated family' },
              ]}
            />
          </fieldset>
        )}

        <StepSwap stepKey={kind} direction={kind === 'generated' ? 1 : -1} className="space-y-8">
          {kind === 'fixed' ? (
            <FixedQuestionFields
              prompt={prompt}
              explanation={explanation}
              answerKind={answerKind}
              numericAnswer={numericAnswer}
              workingSource={workingSource}
              workingFixtures={workingFixtures}
              draft={draft}
              notify={notify}
              promptRef={promptRef}
              answerRef={answerRef}
              numericAnswerRef={numericAnswerRef}
              explanationRef={explanationRef}
              errors={errors}
            />
          ) : generator ? (
            <GeneratedQuestionConfiguration
              ref={configurationRef}
              generator={generator}
              configuration={generatorConfig}
              onChange={(value) => draft.update({ generatorConfig: value })}
              errors={attempted ? configurationErrors : undefined}
            />
          ) : null}
        </StepSwap>

        <QuestionMetadataFields
          state={draft.state}
          update={draft.update}
          lessons={lessons}
          concepts={data.concepts}
          onAddConcept={() => void addConcept()}
          editable={editable}
          errors={errors}
          nameRef={nameRef}
          conceptRef={conceptRef}
        />

        <section>
          <div className={labelClass}>Tags</div>
          <TagInput
            tags={tags}
            onChange={(value) => draft.update({ tags: value })}
            suggestions={tagSuggestions}
            placeholder="Add tags…"
          />
        </section>
        {editing && (
          <Toggle
            checked={suspended}
            onChange={(suspended) => draft.update({ suspended })}
            label="Suspend this Question"
          />
        )}
      </div>

      <div className="pointer-events-none sticky bottom-0 z-20 -mx-[18px] mt-8 bg-gradient-to-t from-paper via-paper to-transparent px-[18px] pb-5 pt-12 min-[481px]:-mx-6 min-[481px]:px-6 md:-mx-10 md:px-10">
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3">
          {editable && editing ? (
            <ConfirmInlineSwap
              active={confirmingDelete}
              message="Delete this Question definition? Its attempt evidence will be retained."
              confirmLabel="Delete"
              onConfirm={() => void remove()}
              onCancel={() => setConfirmingDelete(false)}
            >
              <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
                <TrashIcon width={16} height={16} />
                Delete
              </Button>
            </ConfirmInlineSwap>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!editing && (
              <Button
                type="button"
                onClick={() => void save(true)}
                disabled={!editable || saving}
                title="Save and add another (Ctrl/Cmd+Enter)"
              >
                Save &amp; add another
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => void save()}
              disabled={!editable || saving}
              aria-label={saveLabel}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={saveLabel}
                  aria-hidden="true"
                  initial={motionMultiplier > 0 ? { opacity: 0, y: 3 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={motionMultiplier > 0 ? { opacity: 0, y: -3 } : undefined}
                  transition={motionTransition('feedback', motionMultiplier)}
                >
                  {saveLabel}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
