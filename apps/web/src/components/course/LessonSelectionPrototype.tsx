// Throwaway: compare three lesson pickers on /course/:courseId?variant=A|B|C.
// Real lessons are read-only inputs; the named preview course uses an in-memory fixture.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CourseHeader } from './CourseHeader';
import { prototypeLessons, type PrototypeLesson } from './LessonSelectionPrototype.data';
import './lesson-selection-prototype.css';

const variants = ['A', 'B', 'C'] as const;
const names = ['Searchable checklist', 'Build a lesson range', 'Selection workspace'];

export function LessonSelectionPrototype({
  lessons,
  title,
}: {
  lessons: readonly PrototypeLesson[];
  title?: string;
}) {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, variants.indexOf(params.get('variant') as (typeof variants)[number]));
  const items = title ? lessons : prototypeLessons;
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(Math.min(10, items.length - 1));
  const [review, setReview] = useState(false);
  const [testName, setTestName] = useState('Biology topic test');
  const [date, setDate] = useState('2026-11-09');
  const visible = items.filter(
    (item, i) =>
      `${i + 1} ${item.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (index !== 0 || !onlySelected || selected.includes(item.id)),
  );
  const chosen = items.filter((item) => selected.includes(item.id));
  const topics = [...new Set(items.map((item) => item.topic ?? 'Course lessons'))];

  function switchVariant(offset: number) {
    const next = new URLSearchParams(params);
    next.set('variant', variants[(index + offset + variants.length) % variants.length]);
    setParams(next, { replace: true });
    setReview(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        switchVariant(event.key === 'ArrowLeft' ? -1 : 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggle(id: string) {
    setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
    setReview(false);
  }

  function add(ids: string[]) {
    setSelected((old) => [...new Set([...old, ...ids])]);
    setReview(false);
  }

  function row(item: PrototypeLesson) {
    const position = items.indexOf(item) + 1;
    return (
      <label className="lsp-row" key={item.id}>
        <input
          type="checkbox"
          checked={selected.includes(item.id)}
          onChange={() => toggle(item.id)}
        />
        <span className="lsp-number">{String(position).padStart(2, '0')}</span>
        <span>{item.name}</span>
      </label>
    );
  }

  const search = (
    <input
      className="lsp-search"
      type="search"
      aria-label="Search lessons"
      placeholder={`Search ${items.length} lessons by name or number…`}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );
  const empty = (
    <p className="lsp-empty">
      {onlySelected && !selected.length
        ? 'No lessons selected. Switch to all lessons to start choosing.'
        : 'No matching lessons. Try another name or lesson number.'}
    </p>
  );
  const selectionList = (
    <>
      {chosen.length ? (
        chosen.map((item) => (
          <div className="lsp-chosen" key={item.id}>
            <span>
              <small>{String(items.indexOf(item) + 1).padStart(2, '0')}</small> {item.name}
            </span>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => toggle(item.id)}
            >
              ×
            </button>
          </div>
        ))
      ) : (
        <p className="lsp-empty">
          Choose lessons from the course.
          <br />
          They’ll appear here in course order.
        </p>
      )}
    </>
  );

  return (
    <div className="lsp-host">
      <CourseHeader title={title ?? 'Biology 4BI1'} eyebrow="Course path">
        <p>{items.length} lessons · Test planning</p>
      </CourseHeader>
      <div className="lsp-context" aria-hidden="true">
        <h2>Lessons</h2>
        {items.slice(0, 5).map((item, i) => (
          <div key={item.id}>
            <b>{i + 1}</b>
            <span>
              {item.name}
              <hr />
            </span>
          </div>
        ))}
      </div>
      <section
        className={`lsp-editor lsp-variant-${variants[index]}`}
        aria-label="Test lesson selection prototype"
      >
        <header className="lsp-header">
          <div className="lsp-eyebrow">
            New test <span>Prototype · {variants[index]}</span>
          </div>
          <h1>What’s on the test?</h1>
          <div className="lsp-meta">
            <label>
              Test name
              <input value={testName} onChange={(event) => setTestName(event.target.value)} />
            </label>
            <label>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
        </header>

        {review ? (
          <div className="lsp-body lsp-review">
            <div className="lsp-eyebrow">Preview only · Nothing saved</div>
            <h2>{testName.trim() || 'Untitled test'}</h2>
            <p>
              {date || 'No date chosen'} · {chosen.length} lessons
            </p>
            {selectionList}
            <button type="button" onClick={() => setReview(false)}>
              Back to lesson selection
            </button>
          </div>
        ) : (
          <>
            {index === 0 && (
              <div className="lsp-body">
                <div className="lsp-tools">
                  {search}
                  <button
                    type="button"
                    aria-pressed={onlySelected}
                    onClick={() => setOnlySelected(!onlySelected)}
                  >
                    {onlySelected ? 'Show all' : `Selected (${selected.length})`}
                  </button>
                </div>
                <div className="lsp-list-heading">
                  <span>{visible.length} lessons shown</span>
                  <button
                    type="button"
                    disabled={!visible.length}
                    onClick={() => add(visible.map((item) => item.id))}
                  >
                    Select shown
                  </button>
                </div>
                <div className="lsp-scroll" aria-label="Available lessons">
                  {visible.length ? visible.map(row) : empty}
                </div>
              </div>
            )}

            {index === 1 && (
              <div className="lsp-body lsp-range-body">
                <div className="lsp-eyebrow">Start with a stretch of the course</div>
                <h2>From one lesson to another.</h2>
                <p>Add a whole range, then fine-tune below.</p>
                <div className="lsp-range-controls">
                  <label>
                    From lesson
                    <select value={from} onChange={(event) => setFrom(Number(event.target.value))}>
                      {items.map((item, i) => (
                        <option key={item.id} value={i}>
                          {i + 1}. {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Through lesson
                    <select value={to} onChange={(event) => setTo(Number(event.target.value))}>
                      {items.map((item, i) => (
                        <option key={item.id} value={i}>
                          {i + 1}. {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="lsp-range-preview">
                  <span>
                    {from <= to
                      ? `${to - from + 1} lessons in this range`
                      : 'Choose an end lesson after the start'}
                  </span>
                  <button
                    type="button"
                    className="lsp-primary"
                    disabled={from > to || !items.length}
                    onClick={() => add(items.slice(from, to + 1).map((item) => item.id))}
                  >
                    Add range
                  </button>
                </div>
                <div className="lsp-range-fine">
                  <h3>Fine-tune the selection</h3>
                  {search}
                  <div className="lsp-scroll">{visible.length ? visible.map(row) : empty}</div>
                </div>
              </div>
            )}

            {index === 2 && (
              <div className="lsp-workspace">
                <div className="lsp-library">
                  <div className="lsp-tools">{search}</div>
                  <div className="lsp-scroll">
                    {visible.length
                      ? topics.map((topic) => {
                          const group = visible.filter(
                            (item) => (item.topic ?? 'Course lessons') === topic,
                          );
                          if (!group.length) return null;
                          return (
                            <div key={topic} className="lsp-group">
                              <div className="lsp-list-heading">
                                <h3>{topic}</h3>
                                <button
                                  type="button"
                                  onClick={() => add(group.map((item) => item.id))}
                                >
                                  Add {group.length}
                                </button>
                              </div>
                              {group.map(row)}
                            </div>
                          );
                        })
                      : empty}
                  </div>
                </div>
                <aside className="lsp-selection">
                  <div className="lsp-list-heading">
                    <h3>On this test</h3>
                    <span>{selected.length}</span>
                  </div>
                  <div className="lsp-scroll">{selectionList}</div>
                </aside>
              </div>
            )}
          </>
        )}
        <footer className="lsp-footer">
          <div aria-live="polite">
            <strong>{selected.length}</strong> of {items.length} lessons selected
            <small>
              {selected.length
                ? `${chosen
                    .slice(0, 2)
                    .map((item) => item.name)
                    .join(', ')}${chosen.length > 2 ? ` + ${chosen.length - 2} more` : ''}`
                : 'Choose the lessons your test covers'}
            </small>
          </div>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => {
              setSelected([]);
              setReview(false);
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="lsp-primary"
            disabled={!selected.length}
            onClick={() => setReview(!review)}
          >
            {review ? 'Edit selection' : 'Review selection'}
          </button>
        </footer>
      </section>
      <nav className="lsp-switcher" aria-label="Prototype variants">
        <button type="button" aria-label="Previous variant" onClick={() => switchVariant(-1)}>
          ←
        </button>
        <span>
          {variants[index]} · {names[index]}
          <small>Same selection across all three · Arrow keys to compare</small>
        </span>
        <button type="button" aria-label="Next variant" onClick={() => switchVariant(1)}>
          →
        </button>
      </nav>
    </div>
  );
}
