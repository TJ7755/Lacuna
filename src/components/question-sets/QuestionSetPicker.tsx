import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import {
  questionSetSearchContext,
  searchQuestionSets,
  type QuestionSetSearchContext,
} from '../../questions/questionSetSearch';
import type { QuestionSet } from '../../questions/questionSets';
import { countOf } from '../../utils/plural';
import { Button } from '../ui/Button';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { questionSetMarks } from './presentation';
import { QuestionSetChoices } from './QuestionSetChoices';

export function QuestionSetPicker({
  sets,
  context,
  courseName,
  value,
  onChange,
  onClose,
  host,
}: {
  sets: QuestionSet[];
  context: QuestionSetSearchContext;
  courseName: string;
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
  host: HTMLElement;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(value);
  const trap = useFocusTrap(true, { autoFocusSelector: 'input[type="search"]' });
  const results = searchQuestionSets(sets, query, context);
  return createPortal(
    <DialogPanel
      label="Choose a question set"
      trapRef={trap}
      className="max-w-3xl qs-picker"
      onBackdropClick={onClose}
      onKeyDown={(event) => {
        // A child picker must never trigger the path editor's save shortcuts.
        if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }
      }}
    >
      <DialogHeader
        title="Choose a question set"
        description={`Course: ${courseName}`}
        onClose={onClose}
        closeLabel="Cancel question-set selection"
      />
      <div className="px-6 pt-4">
        <label className="qs-field">
          Search question sets
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search wording, lessons or Concepts"
          />
        </label>
        <p className="qs-muted" role="status">
          {countOf(results.length, 'matching set')}
        </p>
      </div>
      <div className="min-h-0 overflow-y-auto px-6 qs-picker-results">
        <QuestionSetChoices
          label="Question set"
          value={selected}
          onChange={setSelected}
          options={results.map(({ content, location, excerpt }) => ({
            value: content.id,
            label: content.title || 'Untitled set',
            description: (
              <>
                <small>
                  {questionSetSearchContext(content, context) || 'No linked lesson or Concept'}
                </small>
                <small>
                  {countOf(content.questions.length, 'question')} ·{' '}
                  {countOf(
                    flattenQuestionSet(content).filter((row) => row.node.answer).length,
                    'answerable part',
                  )}{' '}
                  · {countOf(questionSetMarks(content), 'mark')}
                </small>
                {content.bank && (
                  <small>
                    {Object.values(content.bank.blueprint).join(' · ')} ·{' '}
                    {content.bank.source.title}
                  </small>
                )}
                {query.trim() && (
                  <small>
                    {location}: {excerpt}
                  </small>
                )}
              </>
            ),
          }))}
        />
        {!results.length && (
          <p className="py-4">
            No matching sets. Try different wording or{' '}
            <button className="underline" onClick={() => setQuery('')}>
              clear search
            </button>
            .
          </p>
        )}
      </div>
      <footer className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!sets.some((set) => set.id === selected)}
          onClick={() => {
            onChange(selected);
            onClose();
          }}
        >
          Use question set
        </Button>
      </footer>
    </DialogPanel>,
    host,
  );
}
