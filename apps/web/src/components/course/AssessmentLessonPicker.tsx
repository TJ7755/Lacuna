import { useRef, useState } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import type { Lesson } from '@lacuna/core/db/types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { expandingActionSpring, motionTransition } from '../ui/motion';
import { inputFrameClassName } from '../ui/Field';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import './assessment-lesson-picker.css';

/** Both panes retain course order; filtering never changes the assessment's coverage. */
export function AssessmentLessonPicker({
  lessons,
  lessonIds,
  onChange,
}: {
  lessons: readonly Lesson[];
  lessonIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const selection = useRef<HTMLOListElement>(null);
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const selected = new Set(lessonIds);
  const ordered = lessons.map((lesson, index) => ({ lesson, number: index + 1 }));
  const normalised = query.trim().toLocaleLowerCase();
  const shown = ordered.filter(({ lesson, number }) =>
    `${number} ${lesson.name}`.toLocaleLowerCase().includes(normalised),
  );
  const chosen = ordered.filter(({ lesson }) => selected.has(lesson.id));

  function remove(id: string) {
    // An exiting row becomes inert immediately; keep keyboard focus in the selection pane.
    const buttons = [
      ...(selection.current?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].filter((button) => !button.closest('[inert]'));
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index >= 0) (buttons[index + 1] ?? buttons[index - 1] ?? search.current)?.focus();
    onChange(lessonIds.filter((value) => value !== id));
  }

  return (
    <motion.div
      className="assessment-lessons"
      aria-label="Covered lessons"
      initial={multiplier > 0 ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('local', multiplier)}
    >
      <div className="assessment-lessons-workspace">
        <section className="assessment-lessons-library" aria-label="Course lessons">
          <input
            ref={search}
            type="search"
            aria-label="Search lessons"
            placeholder="Search lessons by name or number…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`assessment-lessons-search ${inputFrameClassName}`}
          />
          <div className="assessment-lessons-heading">
            <h3>Course lessons</h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={!shown.some(({ lesson }) => !selected.has(lesson.id))}
              onClick={() =>
                onChange([...new Set([...lessonIds, ...shown.map(({ lesson }) => lesson.id)])])
              }
            >
              {normalised ? 'Select shown' : 'Select all'}
            </Button>
          </div>
          <ol className="assessment-lessons-scroll">
            {shown.map(({ lesson, number }) => {
              const active = selected.has(lesson.id);
              return (
                <li key={lesson.id}>
                  <label className="assessment-lessons-row">
                    <motion.span
                      aria-hidden="true"
                      className="assessment-lessons-highlight"
                      initial={false}
                      animate={{ opacity: active ? 1 : 0 }}
                      transition={motionTransition('feedback', multiplier)}
                    />
                    <input
                      type="checkbox"
                      checked={active}
                      aria-label={lesson.name}
                      onChange={() =>
                        active ? remove(lesson.id) : onChange([...lessonIds, lesson.id])
                      }
                    />
                    <span className="assessment-lessons-number" aria-hidden="true">
                      {String(number).padStart(2, '0')}
                    </span>
                    <span>{lesson.name}</span>
                  </label>
                </li>
              );
            })}
            {!shown.length && (
              <li className="assessment-lessons-empty">
                {lessons.length ? 'No matching lessons.' : 'This course has no lessons yet.'}
              </li>
            )}
          </ol>
        </section>
        <section className="assessment-lessons-selection" aria-label="Selected lessons">
          <div className="assessment-lessons-heading">
            <h3>On this test</h3>
          </div>
          <ol ref={selection} className="assessment-lessons-scroll">
            <AnimatePresence initial={false}>
              {chosen.map(({ lesson, number }) => (
                <SelectedLesson
                  key={lesson.id}
                  lesson={lesson}
                  number={number}
                  multiplier={multiplier}
                  remove={() => remove(lesson.id)}
                />
              ))}
            </AnimatePresence>
            {!chosen.length && <li className="assessment-lessons-empty">No lessons selected.</li>}
          </ol>
        </section>
      </div>
      <div className="assessment-lessons-summary">
        <p role="status" aria-live="polite" aria-atomic="true">
          <motion.strong
            key={chosen.length}
            className="assessment-lessons-count"
            initial={multiplier > 0 ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition('feedback', multiplier)}
          >
            {chosen.length}
          </motion.strong>{' '}
          of {lessons.length} lessons selected
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={!lessonIds.length}
          onClick={() => {
            search.current?.focus();
            onChange([]);
          }}
        >
          Clear
        </Button>
      </div>
    </motion.div>
  );
}

function SelectedLesson({
  lesson,
  number,
  multiplier,
  remove,
}: {
  lesson: Lesson;
  number: number;
  multiplier: number;
  remove: () => void;
}) {
  const present = useIsPresent();
  return (
    <motion.li
      inert={!present}
      aria-hidden={!present || undefined}
      initial={multiplier > 0 ? { height: 0, opacity: 0, x: -20 } : false}
      animate={{ height: 'auto', opacity: 1, x: 0 }}
      exit={{ height: 0, opacity: 0, x: multiplier > 0 ? 20 : 0 }}
      transition={{
        height: expandingActionSpring(multiplier),
        x: expandingActionSpring(multiplier),
        opacity: motionTransition('feedback', multiplier),
      }}
      className="assessment-lessons-chosen"
    >
      <div>
        <span className="assessment-lessons-number" aria-hidden="true">
          {String(number).padStart(2, '0')}
        </span>
        <span>{lesson.name}</span>
        <Button variant="ghost" size="sm" aria-label={`Remove ${lesson.name}`} onClick={remove}>
          <CloseIcon width={16} height={16} />
        </Button>
      </div>
    </motion.li>
  );
}
