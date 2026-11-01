import { useState } from 'react';
import type { CourseAssessment, CourseRecord } from '../../db/types';
import { setCoursePaperAssessments } from '../../db/paperAssessmentRepository';
import { papersForSelection } from '../../specifications/selection';
import { defaultExamDate } from '../../utils/datetime';
import { Button } from '../ui/Button';
import { DateTimePicker } from '../ui/DateTimePicker';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
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
  return (
    <ExpandingCreateControl
      align="start"
      label="Set up paper dates"
      closedWidth={200}
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) {
          setDates(
            Object.fromEntries(
              papers.map((paper) => [paper.id, final?.examDate ?? defaultExamDate()]),
            ),
          );
          setInvalidDates(new Set());
        }
        setError('');
        setOpen(next);
      }}
    >
      {(close) => (
        <section className="flex flex-col gap-3 px-4 pb-4 pt-1" aria-label="Paper dates">
          <ul className="flex flex-col gap-3">
            {papers.map((paper) => (
              <li key={paper.id} className="flex flex-col gap-1.5">
                <div className="flex min-w-0 items-baseline gap-2 text-sm">
                  <span className="shrink-0 rounded-lg bg-ink/[0.06] px-2 py-0.5 text-xs tabular text-ink-soft">
                    {paper.ref}
                  </span>
                  <span className="min-w-0">{paper.title}</span>
                </div>
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
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void save()}
              disabled={saving || invalidDates.size > 0}
            >
              Save paper dates
            </Button>
            <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <div className="ml-auto">
              <InfoPopover label="About paper dates" side="top">
                <p className="text-ink">{spec.title}</p>
                <p>Each paper gets its own date. Shared material keeps the same review history.</p>
                <p className="text-ink-faint">
                  Source: {spec.source.document}, {spec.source.issue}.
                </p>
              </InfoPopover>
            </div>
          </div>
        </section>
      )}
    </ExpandingCreateControl>
  );
}
