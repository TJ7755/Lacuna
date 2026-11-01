const questions = [
  ['Is Lacuna free?', 'Yes. Lacuna is free and open source, with no subscription.'],
  ['Can I bring my Anki decks?', 'Yes. Import an Anki .apkg file to bring your cards into Lacuna.'],
  [
    'Can I study offline?',
    'Yes. Once the app and your material are on your device, you can study offline. Embedded online videos still need an internet connection.',
  ],
] as const;

export function LandingFaq() {
  return (
    <section className="landing-faq" aria-labelledby="landing-faq-title">
      <h2 id="landing-faq-title">A few questions.</h2>
      <div>
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none">
                <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
