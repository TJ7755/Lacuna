import type { QuestionSetAuthoringNode } from '../../questions/questionSetAuthoring';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import type { QuestionAnswer } from '../../questions/questionSets';
import { QuestionSetSchemeEditor } from './QuestionSetSchemeEditor';
import { QuestionSetResponseEditor } from './QuestionSetResponseEditor';
import { QuestionSetLinksEditor } from './QuestionSetLinksEditor';
import { QuestionSetImage } from './QuestionSetImage';
import { QuestionSetPromptEditor } from './QuestionSetPromptEditor';
import { emptyAnswer } from './presentation';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';

export function QuestionSetQuestionStep({
  step,
  active,
  nodes,
  session,
  courseId,
  onPrompt,
  onAnswer,
  onSplit,
}: {
  step: 'question' | 'marks' | 'links';
  active: QuestionSetAuthoringNode;
  nodes: QuestionSetAuthoringNode[];
  session: QuestionSetDraftSession;
  courseId: string;
  onPrompt: (value: string) => void;
  onAnswer: (value: QuestionAnswer) => void;
  onSplit: () => void;
}) {
  const children = nodes.filter((node) => node.parentIds.at(-1) === active.id);
  return (
    <section className="qs-paper">
      {step === 'question' && (
        <>
          {active.parentIds.length > 0 && (
            <section className="qs-flow-context">
              <h2>Question introduction</h2>
              {active.parentIds.map((id) => (
                <MarkdownView key={id} source={nodes.find((n) => n.id === id)!.node.prompt} />
              ))}
            </section>
          )}
          {children.length > 0 && (
            <p className="qs-muted mb-5">
              Write the introduction or source material that learners will see above each part.
            </p>
          )}
          <QuestionSetImage key={active.id} session={session} nodeId={active.id}>
            <QuestionSetPromptEditor
              key={`${active.id}-prompt`}
              shared={children.length > 0}
              value={active.node.prompt}
              onChange={onPrompt}
            />
          </QuestionSetImage>
          {!children.length && (
            <QuestionSetResponseEditor
              answer={active.node.answer ?? emptyAnswer()}
              onChange={onAnswer}
            />
          )}
          {active.depth < 2 && !children.length && (
            <div className="qs-flow-split">
              <p className="qs-muted">
                {active.depth === 0
                  ? 'Does this question have separate parts, such as (a) and (b)?'
                  : 'Does this part have subparts, such as (i) and (ii)?'}
              </p>
              <Button variant="secondary" onClick={onSplit}>
                {active.depth === 0 ? 'Use separate parts' : 'Use subparts'}
              </Button>
            </div>
          )}
        </>
      )}
      {step === 'marks' && (
        <>
          <p className="qs-muted mb-5">
            Describe what earns marks. Learners use this scheme to mark their own answers.
          </p>
          <QuestionSetSchemeEditor
            key={active.id}
            answer={active.node.answer ?? emptyAnswer()}
            onChange={onAnswer}
          />
        </>
      )}
      {step === 'links' && (
        <>
          <p className="qs-muted mb-5">
            Choose the atomic concepts tested by each marking point. Cards linked to those concepts
            connect recall with practice. You can leave these links for later.
          </p>
          <QuestionSetLinksEditor
            key={active.id}
            courseId={courseId}
            answer={active.node.answer ?? emptyAnswer()}
            onChange={onAnswer}
          />
        </>
      )}
    </section>
  );
}
