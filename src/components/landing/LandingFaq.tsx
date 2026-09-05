const questions = [
  ['Is Lacuna free?', 'Yes. Lacuna is free and open source, with no subscription.'],
  [
    'Do I need an exam date?',
    'No. Choose steady retention to revise without a deadline, or set an exam date to schedule towards it.',
  ],
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
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
