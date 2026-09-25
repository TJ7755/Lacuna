// Throwaway comparison: three completion reports using the supplied screenshot's figures.
import '../../src/index.css';
import './prototype.css';

const variants = ['A', 'B', 'C'];
const names = { A: 'Path', B: 'Quiet finish', C: 'Session receipt' };
const tick =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrow =
  '<svg viewBox="0 0 22 16" width="22" height="16" fill="none" aria-hidden="true"><path d="M1 8h19M14 2l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const badge = `<span class="completion-mark" role="img" aria-label="Completed">${tick}</span>`;
const actions = () =>
  `<div class="report-actions"><button class="primary" data-action="Done">Done <span class="action-arrow">${arrow}</span></button><button class="secondary" data-action="Keep studying">Keep studying</button></div><p class="action-feedback" role="status"></p>`;
const facts = () =>
  '<dl class="key-facts"><div><dt>Card reviewed</dt><dd>1</dd></div><div><dt>Accuracy</dt><dd>100<span>%</span></dd></div></dl>';
const details = () =>
  `<details class="session-details"><summary>Session details <span aria-hidden="true">+</span></summary><div class="detail-content"><dl><div><dt>Mean correct response</dt><dd>122.9s</dd></div><div><dt>Focus</dt><dd>97%</dd></div><div><dt>Progress this session</dt><dd>+100 percentage points</dd></div></dl><p>You left the page during 1 of 1 cards. Your grades were unaffected; the timing may be less representative.</p></div></details>`;
const progress = () =>
  '<div class="progress-copy"><span>Cards correct in this pass</span><span><span class="before">0%</span> <span aria-hidden="true">→</span> <strong>100%</strong></span></div><div class="progress-track" role="progressbar" aria-label="Cards correct in this pass" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div></div></div>';

function path() {
  return `<main class="report path" aria-label="Session report"><div class="path-origin"><span class="origin-dot" aria-hidden="true"></span><p>Session complete</p></div><div class="path-destination">${badge}<div><h1>Goal reached.</h1><p class="lead">Everything in this pass, answered correctly.</p></div></div><div class="path-body">${facts()}<div class="path-progress">${progress()}</div>${details()}${actions()}</div></main>`;
}
function quiet() {
  return `<main class="report quiet" aria-label="Session report">${badge}<h1>You’re done.</h1><p class="lead">You’ve reached your goal for this session.</p><div class="quiet-result"><span class="quiet-number">100<span>%</span></span><p>Cards correct in this pass</p><span class="quiet-start">Up from 0%</span></div><p class="quiet-facts">1 card reviewed <span aria-hidden="true">·</span> 100% accuracy</p>${actions()}${details()}</main>`;
}
function receipt() {
  return `<main class="report receipt" aria-label="Session report"><header><p class="eyebrow">Session complete</p><h1>A good place <br />to stop.</h1>${actions()}</header><section class="receipt-card" aria-label="Session results"><div class="receipt-heading">${badge}<h2>Goal reached</h2></div><div class="receipt-score"><span>100<span>%</span></span><p>Cards correct<br />in this pass</p></div><div class="receipt-change"><span>Started at 0%</span><span>Finished at 100%</span></div>${facts()}${details()}</section></main>`;
}
function current() {
  const value = new URL(location.href).searchParams.get('variant');
  return variants.includes(value) ? value : 'A';
}
function render() {
  const variant = current();
  document.querySelector('#app').innerHTML =
    `${{ A: path, B: quiet, C: receipt }[variant]()}<nav class="prototype-controls" aria-label="Prototype controls"><span class="prototype-label">Design study</span><button aria-label="Previous direction" data-cycle="-1">←</button><span class="variant-name" aria-live="polite">${variant} — ${names[variant]}</span><button aria-label="Next direction" data-cycle="1">→</button><span class="control-divider"></span><button class="theme-button" aria-label="Toggle light and dark appearance">${document.documentElement.classList.contains('dark') ? 'Light' : 'Dark'}</button></nav>`;
  document
    .querySelectorAll('[data-cycle]')
    .forEach((button) =>
      button.addEventListener('click', () => cycle(Number(button.dataset.cycle))),
    );
  document.querySelector('.theme-button').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    render();
  });
  document.querySelectorAll('[data-action]').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelector('.action-feedback').textContent =
        `${button.dataset.action} selected — preview only.`;
    }),
  );
  console.info('Session report prototype', {
    variant,
    cardsReviewed: 1,
    accuracy: 100,
    masteryBefore: 0,
    masteryAfter: 1,
    meanCorrectResponseSec: 122.9,
    focus: 0.97,
    distractedCards: 1,
  });
}
function cycle(step) {
  const url = new URL(location.href);
  url.searchParams.set(
    'variant',
    variants[(variants.indexOf(current()) + step + variants.length) % variants.length],
  );
  history.replaceState(null, '', url);
  render();
}
window.addEventListener('keydown', (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest('input, textarea, select, [contenteditable]')
  )
    return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    cycle(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
window.addEventListener('popstate', render);
if (import.meta.env.DEV) render();
