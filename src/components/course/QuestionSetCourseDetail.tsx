import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QuestionSetPathNode } from '../../course/path';
import { questionSetPathProgress } from '../../questions/questionSetPathProgress';
import { Button } from '../ui/Button';
import { ChevronRightIcon, HelpIcon } from '../ui/icons';
import { QuestionSetPathEditor } from './QuestionSetPathEditor';
import { useQuestionSetPathData } from './useQuestionSetPathData';

/** Companion detail for a Practice Qs stop on the course overview. */
export function QuestionSetCourseDetail({
  node,
  authoring,
}: {
  node: QuestionSetPathNode;
  authoring: boolean;
}) {
  const data = useQuestionSetPathData(node);
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const courseId = node.practiceNode.courseId;
  if (!data) return null;
  if (!data.content)
    return (
      <div className="course-detail">
        <h2>{node.practiceNode.name}</h2>
        <p>Question set unavailable</p>
      </div>
    );
  const progress = questionSetPathProgress(data.attempt);
  return (
    <div className="course-detail">
      <h2>{data.content.title}</h2>
      <div className="course-detail-meta">
        <HelpIcon width={16} height={16} />
        {progress
          ? `${progress.answeredParts}/${progress.totalParts} answered · ${progress.markedParts} marked`
          : 'No attempts yet'}
      </div>
      <Button
        variant="primary"
        onClick={() =>
          navigate(`/course/${courseId}/question-sets/${node.questionSetId}`, {
            state: {
              questionSetReturnTo: location.pathname + location.search,
              questionSetReturnLabel: 'Back to path',
            },
          })
        }
      >
        Open question set
        <ChevronRightIcon width={17} height={17} />
      </Button>
      {data.exam && (
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => navigate(`/course/${courseId}?exam=${encodeURIComponent(data.exam!.id)}`)}
        >
          {data.exam.name}
        </Button>
      )}
      {authoring && (
        <Button variant="ghost" className="mt-3" onClick={() => setEditing(true)}>
          Edit activity
        </Button>
      )}
      {editing && (
        <QuestionSetPathEditor
          courseId={courseId}
          node={node.practiceNode}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
