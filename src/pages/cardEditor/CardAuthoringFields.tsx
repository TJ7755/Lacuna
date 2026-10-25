import { AnimatePresence, m as motion } from 'motion/react';
import { CardAnswerModeField } from '../../components/cards/AnswerModeControl';
import { AudioCardEditor } from '../../components/cards/AudioCardEditor';
import { MarkdownEditor } from '../../components/markdown/MarkdownEditor';
import { NumericAnswerEditor } from '../../components/items/NumericAnswerEditor';
import { MarkSchemeEditor } from '../../components/items/MarkSchemeEditor';
import { TagInput } from '../../components/ui/TagInput';
import { CheckIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import { useToast } from '../../components/ui/Toast';
import { buildMarkSchemeDraftPrompt } from '../../items/prompts';
import type { PreviewSide } from '../../components/cards/CardPreview';
import type { CardEditorDraft } from './useCardEditorDraft';
import type { CardEditorFocus } from './useCardEditorFocus';
import type { CardEditorSave } from './useCardEditorSave';

const CARD_SURFACE = 'card-surface';

export function CardAuthoringFields({
  draft,
  focus,
  save,
  editing,
  courseId,
  previewSide,
  tagSuggestions,
  m,
}: {
  draft: CardEditorDraft;
  focus: CardEditorFocus;
  save: CardEditorSave;
  editing: boolean;
  courseId: string | undefined;
  previewSide: PreviewSide;
  tagSuggestions: string[];
  m: number;
}) {
  const {
    front,
    back,
    numericAnswer,
    workingSource,
    workingFixtures,
    tags,
    answerMode,
    alsoReverse,
  } = draft.values;
  const {
    setFront,
    setBack,
    setNumericAnswer,
    setWorkingSource,
    setWorkingFixtures,
    setTags,
    setAnswerMode,
    setAlsoReverse,
    setDraftDirty,
  } = draft.setters;
  const { modifyDraftField, formDirection } = draft;
  const {
    frontRef,
    backRef,
    numericRef,
    schemeRef,
    audioEntryRef,
    audioPromptRef,
    audioAnswerRef,
    focusSaveButton,
  } = focus;
  const {
    isCloze,
    isAudio,
    isNumeric,
    isWorking,
    isStructured,
    clozeValid,
    canReverse,
    formKind,
    formKey,
    shakeField,
  } = save;
  const { notify } = useToast();
  async function copyMarkSchemePrompt() {
    if (!front.trim()) return;
    try {
      await navigator.clipboard.writeText(buildMarkSchemeDraftPrompt(front));
      notify('Mark-scheme prompt copied to the clipboard.', 'positive');
    } catch {
      notify('Could not copy the mark-scheme prompt.', 'negative');
    }
  }

  return (
    <section
      aria-label="Card content"
      className={`flex min-w-0 flex-col gap-5 rounded-3xl bg-surface p-5 md:p-7 lg:col-span-3 ${CARD_SURFACE}`}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={formKind}
          initial={m > 0 ? { opacity: 0, x: 16 * formDirection } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={scaledSpring(m, 380, 38)}
          className="flex flex-col gap-5"
        >
          {isCloze ? (
            <>
              <div
                key="cloze"
                className={cn(
                  shakeField === 'front' || shakeField === 'cloze' ? 'shake-field' : '',
                )}
              >
                <MarkdownEditor
                  compactToolbar
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
                autoFocus={!editing}
                entryRef={audioEntryRef}
                promptRef={audioPromptRef}
                answerRef={audioAnswerRef}
                onTabForward={focusSaveButton}
                onFrontChange={(value) => modifyDraftField(setFront, value)}
                onBackChange={(value) => modifyDraftField(setBack, value)}
                onError={(message) => notify(message, 'negative')}
              />
            </div>
          ) : isNumeric || isWorking ? (
            <>
              <div key="front" className={cn(shakeField === 'front' ? 'shake-field' : '')}>
                <MarkdownEditor
                  compactToolbar
                  hidePreview
                  key={`structured-front-${formKey}`}
                  inputRef={frontRef}
                  autoFocus={!editing}
                  onTabForward={() => (isNumeric ? numericRef.current : schemeRef.current)?.focus()}
                  label="Question"
                  value={front}
                  onChange={(value) => modifyDraftField(setFront, value)}
                  minRows={8}
                  placeholder="Question or prompt"
                  onError={(message) => notify(message, 'negative')}
                />
              </div>
              {isNumeric ? (
                <div key="answer" className={cn(shakeField === 'answer' ? 'shake-field' : '')}>
                  <NumericAnswerEditor
                    inputRef={numericRef}
                    onTabForward={focusSaveButton}
                    onTabBackward={() => frontRef.current?.focus()}
                    value={numericAnswer}
                    onChange={(value) => modifyDraftField(setNumericAnswer, value)}
                    invalid={shakeField === 'answer'}
                  />
                </div>
              ) : (
                <div key="scheme" className={cn(shakeField === 'scheme' ? 'shake-field' : '')}>
                  <MarkSchemeEditor
                    key={formKey}
                    sourceRef={schemeRef}
                    onTabForward={focusSaveButton}
                    onTabBackward={() => frontRef.current?.focus()}
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
              <div key="front" className={cn(shakeField === 'front' ? 'shake-field' : '')}>
                <MarkdownEditor
                  compactToolbar
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
              <div key="back" className={cn(shakeField === 'back' ? 'shake-field' : '')}>
                <MarkdownEditor
                  compactToolbar
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
        </motion.div>
      </AnimatePresence>

      <div>
        <div className="mb-2 text-sm text-ink-soft">Tags</div>
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-end gap-4 border-t border-line pb-1 pt-5">
          {!isStructured && (
            <CardAnswerModeField
              courseId={courseId}
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
                'inline-flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink active:bg-ink/10',
                alsoReverse
                  ? 'border-accent/30 bg-accent-soft text-accent-ink'
                  : 'border-line bg-surface text-ink hover:border-ink/40',
              )}
            >
              <span
                className={cn(
                  'grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors',
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
  );
}
