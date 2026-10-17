import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import type { QuestionSet } from '../../questions/questionSets';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { QuestionSetSettings } from './QuestionSetSettings';

export function QuestionSetDetails({
  content,
  onChange,
  disabled,
}: {
  content: QuestionSet;
  onChange: (content: QuestionSet) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(!content.title.trim());
  const name = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const links = useLiveQuery(async () => {
    const [lessons, exams] = await Promise.all([
      db.lessons.bulkGet(content.lessonIds),
      db.courseAssessments.bulkGet(content.assessmentIds),
    ]);
    return [...lessons, ...exams].flatMap((item) => (item ? [item.name] : []));
  }, [content.lessonIds.join(','), content.assessmentIds.join(',')]);
  useEffect(() => {
    if (open) name.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-soft">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {links?.length ? `Covers ${links.join(' · ')}` : 'Not linked to lessons or exams'}
        </span>
        <button
          ref={trigger}
          type="button"
          className="qs-details-edit min-h-11 shrink-0 px-2 text-accent-ink active:bg-ink/5"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
        >
          Edit
        </button>
      </div>
      <AnimatedDisclosure open={open}>
        <fieldset
          id={panelId}
          disabled={disabled}
          className="qs-paper mt-3"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (
              event.key === 'Escape' ||
              (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
            ) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <Field label="Name" className="mb-6">
            <Input
              ref={name}
              value={content.title}
              onChange={(event) => onChange({ ...content, title: event.target.value })}
            />
          </Field>
          <QuestionSetSettings content={content} onChange={onChange} />
          <div className="mt-4 flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </fieldset>
      </AnimatedDisclosure>
    </div>
  );
}
