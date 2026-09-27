import {
  flattenQuestionSet,
  type QuestionSetAuthoringNode,
} from '../../questions/questionSetAuthoring';
import { validateQuestionSet, type QuestionSet } from '../../questions/questionSets';
import { Button } from '../ui/Button';
import { nodeMarks } from './presentation';

export function nodeLabel(nodes: QuestionSetAuthoringNode[], node: QuestionSetAuthoringNode) {
  return [
    ...node.parentIds.map((id) => nodes.find((item) => item.id === id)!.label),
    node.label,
  ].join(' ');
}

export function nodeNeedsWork(content: QuestionSet, id: string) {
  const node = flattenQuestionSet(content).find((item) => item.id === id);
  if (!node) return true;
  const isolated: QuestionSet = {
    ...content,
    title: content.title || 'Draft',
    questions: [
      {
        id: node.id,
        prompt: node.node.prompt,
        answer: node.node.answer,
        parts:
          'parts' in node.node
            ? node.node.parts
            : 'subparts' in node.node
              ? node.node.subparts.map((part) => ({ ...part, subparts: [] }))
              : [],
      },
    ],
  };
  return validateQuestionSet(isolated).length > 0;
}

export function QuestionSetContents({
  content,
  onEdit,
  onAdd,
  onMove,
  onRemove,
  review = false,
}: {
  content: QuestionSet;
  onEdit: (id: string) => void;
  onAdd: (parents: string[]) => void;
  onMove: (id: string, index: number) => void;
  onRemove: (id: string) => void;
  review?: boolean;
}) {
  const nodes = flattenQuestionSet(content);
  return (
    <section aria-label="Questions in this set" className="qs-flow-contents">
      {content.questions.length === 0 && (
        <p className="qs-flow-empty">No questions yet. Add your first question to get started.</p>
      )}
      {content.questions.map((question) => (
        <section className="qs-flow-question" key={question.id}>
          {nodes
            .filter((node) => node.id === question.id || node.parentIds[0] === question.id)
            .map((node) => {
              const label = nodeLabel(nodes, node);
              const siblings = nodes.filter(
                (item) => item.parentIds.join('/') === node.parentIds.join('/'),
              );
              const index = siblings.findIndex((item) => item.id === node.id);
              const hasChildren = nodes.some((item) => item.parentIds.at(-1) === node.id);
              const needsWork = nodeNeedsWork(content, node.id);
              return (
                <div className="qs-flow-row" data-depth={node.depth} key={node.id}>
                  <div className="qs-flow-row-heading">
                    <h3>{label}</h3>
                    <span className={needsWork ? 'qs-flow-incomplete' : 'qs-flow-ready'}>
                      {needsWork ? 'Needs attention' : 'Ready'}
                    </span>
                  </div>
                  <p>
                    {node.node.prompt
                      .replace(/!\[.*?\]\(.*?\)/g, '')
                      .trim()
                      .slice(0, 140) || 'Question text not added'}
                  </p>
                  <span className="qs-muted">
                    {hasChildren
                      ? 'Introduction for the parts below'
                      : `${nodeMarks(node.node)} ${nodeMarks(node.node) === 1 ? 'mark' : 'marks'}`}
                  </span>
                  <div className="qs-actions mt-3">
                    <Button aria-label={`Edit ${label}`} onClick={() => onEdit(node.id)}>
                      Edit
                    </Button>
                    {!review && (
                      <>
                        {node.depth < 2 && (
                          <Button
                            variant="ghost"
                            onClick={() => onAdd([...node.parentIds, node.id])}
                          >
                            {node.depth === 0 ? 'Add part' : 'Add subpart'}
                          </Button>
                        )}
                        {index > 0 && (
                          <Button
                            variant="ghost"
                            aria-label={`Move ${label} up`}
                            onClick={() => onMove(node.id, index - 1)}
                          >
                            Move up
                          </Button>
                        )}
                        {index < siblings.length - 1 && (
                          <Button
                            variant="ghost"
                            aria-label={`Move ${label} down`}
                            onClick={() => onMove(node.id, index + 1)}
                          >
                            Move down
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${label}`}
                          onClick={() => onRemove(node.id)}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </section>
      ))}
      {!review && (
        <Button
          variant={content.questions.length ? 'secondary' : 'primary'}
          onClick={() => onAdd([])}
        >
          {content.questions.length ? 'Add question' : 'Add first question'}
        </Button>
      )}
    </section>
  );
}
