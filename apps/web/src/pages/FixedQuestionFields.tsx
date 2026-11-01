import type { RefObject } from 'react';
import { MarkSchemeEditor } from '../components/items/MarkSchemeEditor';
import { NumericAnswerEditor } from '../components/items/NumericAnswerEditor';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import {
  FieldError,
  questionLabelClass as labelClass,
} from '../components/questions/QuestionMetadataFields';
import { QuestionSegmented } from '../components/questions/QuestionSegmented';
import { StepSwap } from '../components/ui/StepSwap';
import type { QuestionAuthoringState, useQuestionDraft } from './questionDraft';

export function FixedQuestionFields({
  prompt,
  explanation,
  answerKind,
  numericAnswer,
  workingSource,
  workingFixtures,
  draft,
  notify,
  promptRef,
  answerRef,
  numericAnswerRef,
  explanationRef,
  errors,
}: {
  prompt: string;
  explanation: string;
  answerKind: QuestionAuthoringState['answerKind'];
  numericAnswer: QuestionAuthoringState['numericAnswer'];
  workingSource: string;
  workingFixtures: QuestionAuthoringState['workingFixtures'];
  draft: Pick<ReturnType<typeof useQuestionDraft>, 'update'>;
  notify: (message: string, kind: 'negative') => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  answerRef: RefObject<HTMLDivElement | null>;
  numericAnswerRef: RefObject<HTMLInputElement | null>;
  explanationRef: RefObject<HTMLTextAreaElement | null>;
  errors: { prompt?: string; answer?: string; explanation?: string };
}) {
  return (
    <>
      <div>
        <MarkdownEditor
          label="Prompt"
          value={prompt}
          onChange={(value) => draft.update({ prompt: value })}
          minRows={7}
          placeholder="Apply the idea in a concrete problem."
          onError={(message) => notify(message, 'negative')}
          inputRef={promptRef}
          ariaInvalid={errors.prompt ? true : undefined}
          ariaDescribedBy={errors.prompt ? 'question-prompt-error' : undefined}
        />
        <FieldError id="question-prompt-error" message={errors.prompt} />
      </div>
      <div>
        <div className={labelClass}>Answer type</div>
        <QuestionSegmented
          label="Answer type"
          value={answerKind}
          onChange={(option) => draft.update({ answerKind: option })}
          options={[
            { value: 'numeric', label: 'Numeric answer' },
            { value: 'working', label: 'Show working' },
          ]}
        />
      </div>
      <div ref={answerRef}>
        <StepSwap stepKey={answerKind} direction={answerKind === 'working' ? 1 : -1}>
          {answerKind === 'numeric' ? (
            <NumericAnswerEditor
              inputRef={numericAnswerRef}
              value={numericAnswer}
              invalid={Boolean(errors.answer)}
              onChange={(value) => draft.update({ numericAnswer: value })}
            />
          ) : (
            <MarkSchemeEditor
              value={workingSource}
              onChange={(value) => draft.update({ workingSource: value })}
              fixtures={workingFixtures}
              onFixturesChange={(value) => draft.update({ workingFixtures: value })}
            />
          )}
        </StepSwap>
        <FieldError id="question-answer-error" message={errors.answer} />
      </div>
      <div>
        <MarkdownEditor
          label="Worked explanation"
          value={explanation}
          onChange={(value) => draft.update({ explanation: value })}
          minRows={7}
          placeholder="Show why the answer follows, not merely what it is."
          onError={(message) => notify(message, 'negative')}
          inputRef={explanationRef}
          ariaInvalid={errors.explanation ? true : undefined}
          ariaDescribedBy={errors.explanation ? 'question-explanation-error' : undefined}
        />
        <FieldError id="question-explanation-error" message={errors.explanation} />
      </div>
    </>
  );
}
