import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSet } from '../../questions/questionSets';

export function QuestionSetSettings({
  content,
  onChange,
}: {
  content: QuestionSet;
  onChange: (content: QuestionSet) => void;
}) {
  const data = useLiveQuery(
    async () => ({
      lessons: await db.lessons.where('courseId').equals(content.courseId).toArray(),
      exams: await db.courseAssessments.where('courseId').equals(content.courseId).toArray(),
    }),
    [content.courseId],
  );
  const toggle = (key: 'lessonIds' | 'assessmentIds', id: string) =>
    onChange({
      ...content,
      [key]: content[key].includes(id)
        ? content[key].filter((v) => v !== id)
        : [...content[key], id],
    });
  return (
    <section className="qs-settings">
      <h2>Lessons and exams</h2>
      <div className="qs-fields">
        <fieldset className="qs-field">
          <legend>Lessons</legend>
          {data?.lessons.map((l) => (
            <label className="qs-check" key={l.id}>
              <input
                type="checkbox"
                checked={content.lessonIds.includes(l.id)}
                onChange={() => toggle('lessonIds', l.id)}
              />
              {l.name}
            </label>
          ))}
          {data?.lessons.length === 0 && <p className="qs-muted">No lessons in this course.</p>}
        </fieldset>
        <fieldset className="qs-field">
          <legend>Exams</legend>
          {data?.exams.map((e) => (
            <label className="qs-check" key={e.id}>
              <input
                type="checkbox"
                checked={content.assessmentIds.includes(e.id)}
                onChange={() => toggle('assessmentIds', e.id)}
              />
              {e.name}
              {e.examDate
                ? ` · ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(e.examDate)}`
                : ''}
            </label>
          ))}
          {data?.exams.length === 0 && <p className="qs-muted">No exams in this course.</p>}
        </fieldset>
      </div>
    </section>
  );
}
