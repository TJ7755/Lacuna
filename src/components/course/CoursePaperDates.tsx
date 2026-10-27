import { useState } from 'react';
import type { CourseAssessment, CourseRecord } from '../../db/types';
import { setCoursePaperAssessments } from '../../db/paperAssessmentRepository';
import { papersForSelection } from '../../specifications/selection';
import { defaultExamDate } from '../../utils/datetime';
import { Button } from '../ui/Button';
import { DateTimePicker } from '../ui/DateTimePicker';

export function CoursePaperDates({
  course,
  assessments,
}: {
  course: CourseRecord;
  assessments: CourseAssessment[];
}) {
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [invalidDates, setInvalidDates] = useState<ReadonlySet<string>>(new Set());
  const spec = course.specificationData;
  const selection = course.specificationRef;
  if (!spec || !selection || assessments.some((entry) => entry.coverageMode === 'specification')) {
    return null;
  }
  const papers = papersForSelection(spec, selection);
  if (!papers.length) return null;
  const final = assessments.find((entry) => entry.kind === 'final');
  async function save() {
    if (invalidDates.size > 0) return;
    setSaving(true);
    setError('');
    try {
      await setCoursePaperAssessments(
        course.id,
        papers.map((paper) => ({
          paperId: paper.id,
          examDate: dates[paper.id],
          timeZone: final?.timeZone ?? 'Europe/London',
        })),
      );
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save paper dates.');
    } finally {
      setSaving(false);
    }
  }
  if (!open)
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setDates(
            Object.fromEntries(
              papers.map((paper) => [paper.id, final?.examDate ?? defaultExamDate()]),
            ),
          );
          setOpen(true);
          setInvalidDates(new Set());
        }}
      >
        Set up paper dates
      </Button>
    );
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-ink/[0.04] p-4" aria-label="Paper dates">
      <div>
        <h3 className="text-sm font-medium">Paper dates</h3>
        <p className="mt-1 text-sm text-ink-soft">
          {spec.title}. Choose each paper’s date. Shared material keeps the same review history.
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          Source: {spec.source.document}, {spec.source.issue}.
        </p>
      </div>
      {papers.map((paper) => (
        <div key={paper.id}>
          <h4 className="mb-2 text-sm font-medium">
            {paper.ref}: {paper.title}
          </h4>
          <DateTimePicker
            value={dates[paper.id]}
            onChange={(date) => setDates({ ...dates, [paper.id]: date })}
            onValidityChange={(valid) =>
              setInvalidDates((previous) => {
                const next = new Set(previous);
                if (valid) next.delete(paper.id);
                else next.add(paper.id);
                return next;
              })
            }
            timeZone={final?.timeZone ?? 'Europe/London'}
            label={`Date and time for ${paper.title}`}
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={saving || invalidDates.size > 0}>
          Save paper dates
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
