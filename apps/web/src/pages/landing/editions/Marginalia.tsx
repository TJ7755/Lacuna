import { useState } from 'react';
import { Frame, Opening } from './Frame';
import './marginalia.css';

const marks = [
  ['Name the process', 'Water moves by osmosis.'],
  ['Give the direction', 'Water moves from a dilute solution to a more concentrated solution.'],
  ['Identify the barrier', 'The membrane is partially permeable.'],
];
export function Landing() {
  const [marked, setMarked] = useState(false);
  return (
    <Frame
      edition="marginalia"
      image="application-questions"
      alt="An application question with its mark scheme in Lacuna"
      title="Put the mark scheme to work."
      detail="Write a full answer and compare it with the marking points. Practise exam questions alongside flashcards so that recalling a fact and using it get time in the same plan."
    >
      <Opening title="Find the missing mark.">
        A fact on a flashcard is only half the job. Lacuna gives written exam answers a place in
        your revision.
      </Opening>
      <article className="mark-paper">
        <header>
          Biology <span>Short answer</span>
        </header>
        <h2>Explain how water enters a root hair cell.</h2>
        <blockquote>
          Water moves into the cell by <span data-marked={marked}>osmosis</span>, through a{' '}
          <span data-marked={marked}>partially permeable membrane</span>.
        </blockquote>
        <button aria-expanded={marked} onClick={() => setMarked(!marked)}>
          {marked ? 'Hide marking' : 'Mark this example'}
        </button>
        {marked && (
          <aside>
            <strong>2 of 3 marks</strong>
            <ul>
              {marks.map(([label, answer], i) => (
                <li key={label}>
                  <b>
                    {i === 1 ? 'Missing' : 'Awarded'} — {label}.
                  </b>{' '}
                  {i === 1 && answer}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
    </Frame>
  );
}
