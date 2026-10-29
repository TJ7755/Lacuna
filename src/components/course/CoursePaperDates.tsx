import { useState } from 'react';
import type { CourseAssessment, CourseRecord } from '../../db/types';
import { setCoursePaperAssessments } from '../../db/paperAssessmentRepository';
import { papersForSelection } from '../../specifications/selection';
import { defaultExamDate } from '../../utils/datetime';
import { Button } from '../ui/Button';
import { DateTimePicker } from '../ui/DateTimePicker';
import { CalendarIcon } from '../ui/icons';
import { InfoPopover } from '../analytics/InfoPopover';

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
        size="sm"
        className="self-start"
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
        <CalendarIcon width={16} height={16} />
        Set up paper dates
      </Button>
    );
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-ink/[0.04] p-4" aria-label="Paper dates">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <CalendarIcon width={16} height={16} className="text-ink-faint" />
          Paper dates
        </h3>
        <InfoPopover label="About paper dates">
          <p className="text-ink">{spec.title}</p>
          <p>Each paper gets its own date. Shared material keeps the same review history.</p>
          <p className="text-ink-faint">
            Source: {spec.source.document}, {spec.source.issue}.
          </p>
        </InfoPopover>
      </div>
      <ul className="flex flex-col gap-2">
        {papers.map((paper) => (
          <li
            key={paper.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="shrink-0 rounded-lg bg-ink/[0.06] px-2 py-0.5 text-xs tabular text-ink-soft">
                {paper.ref}
              </span>
              <span className="min-w-0">{paper.title}</span>
            </div>
            <div className="sm:w-56 sm:shrink-0">
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
                hideLabel
              />
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={saving || invalidDates.size > 0}
        >
          Save paper dates
        </Button>
        <Button
          variant="ghost"
          size="sm"
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
