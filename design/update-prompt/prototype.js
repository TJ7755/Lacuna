const directions = {
  A: [
    'Quiet dialogue',
    'The smallest change: a clear restart decision, shorter copy and a lighter backdrop. Still interrupts the current task.',
  ],
  B: [
    'Drawn return',
    'Selected direction. A centred drawing, the version in the body text, and release notes available on demand.',
  ],
  C: [
    'At your pace',
    'A persistent corner notice keeps the page visible. Less interruption, but easier to overlook. This changes the update interaction.',
  ],
};
const restartIcon =
  '<div class="restart-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9a7.5 7.5 0 1 0 .3 6M19 4v5h-5"/></svg></div>';
const drawing =
  '<div class="art" aria-hidden="true"><svg viewBox="0 0 180 220" fill="none"><circle cx="90" cy="110" r="76" stroke="#d9902b" stroke-width="1.8"/><rect x="62" y="52" width="56" height="100" rx="8" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/><rect x="54" y="62" width="72" height="100" rx="8" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/><rect x="46" y="72" width="88" height="100" rx="9" fill="var(--surface)" stroke="currentColor" stroke-width="1.8"/><path d="M90 133V101m-13 13 13-13 13 13" stroke="#d9902b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M74 151h32" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>';
// Summarised from the published v0.2.11 release, not a live updater connection.
const releaseNotes = `<details class="release-notes"><summary>What’s new<span aria-hidden="true">+</span></summary><div class="notes-content" tabindex="0" role="region" aria-label="Changes in version 0.2.11"><ul><li>Share complete courses offline, including images and audio.</li><li>Preview imported cards, add reverse cards and keep your draft with Undo.</li><li>Choose typed answers for individual lessons or cards.</li><li>Improved study transitions, completion reports and Practice progress.</li><li>Built-in hosted AI and stronger recovery, offline loading and installation checks.</li></ul><a href="https://github.com/TJ7755/Lacuna/releases/tag/v0.2.11" target="_blank" rel="noopener noreferrer">Full release notes <span aria-hidden="true">↗</span></a></div></details>`;
const actions =
  '<div class="actions"><button class="secondary" data-action="later">Later</button><button class="primary" data-action="restart">Restart Lacuna</button></div>';
const stage = document.querySelector('#stage');
let variant = new URLSearchParams(location.search).get('variant') || 'B';
if (!(variant in directions)) variant = 'B';
function render() {
  const [name, rationale] = directions[variant];
  document.querySelector('#variant-label').textContent = `${variant} / ${name}`;
  document.querySelector('#direction').textContent = name;
  document.querySelector('#rationale').textContent = rationale;
  document.querySelector('#feedback').textContent = '';
  const version = '<div class="version">Version 0.2.11 ready</div>';
  if (variant === 'A')
    stage.innerHTML = `<div class="veil"></div><section class="prompt compact" role="dialog" aria-label="Update ready">${restartIcon}${version}<h2>Ready to update.</h2><p>Restart Lacuna to install the update.<br>It will reopen automatically.</p>${actions}</section>`;
  if (variant === 'B')
    stage.innerHTML = `<div class="veil"></div><section class="prompt illustrated" role="dialog" aria-label="Update ready">${drawing}<div class="copy"><h2>Ready when<br>you are.</h2><p>Lacuna 0.2.11 is ready to install.<br>Restart to update and reopen.</p>${releaseNotes}${actions}</div></section>`;
  if (variant === 'C')
    stage.innerHTML = `<section class="prompt notice" aria-label="Update ready"><button class="close" data-action="later" aria-label="Dismiss update notice">&times;</button>${version}<h2>An update is ready.</h2><p>Restart to install. Lacuna will reopen<br>when it’s ready.</p>${actions}</section>`;
}
function change(step) {
  const keys = Object.keys(directions);
  variant = keys[(keys.indexOf(variant) + step + keys.length) % keys.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', variant);
  history.replaceState(null, '', url);
  render();
}
document.querySelector('#previous').onclick = () => change(-1);
document.querySelector('#next').onclick = () => change(1);
document.querySelector('#reset').onclick = render;
document.querySelector('#theme').onclick = (event) => {
  const dark = document.body.classList.toggle('dark');
  event.currentTarget.textContent = dark ? 'Light' : 'Dark';
};
document.addEventListener('keydown', (event) => {
  if (event.target.closest('input,textarea,select,[contenteditable]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    change(event.key === 'ArrowLeft' ? -1 : 1);
  }
  if (event.key === 'Escape') dismiss('Preview: deferred until later.');
});
function dismiss(message) {
  stage.innerHTML = '';
  document.querySelector('#feedback').textContent = message;
  document.querySelector('#reset').focus();
}
stage.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action)
    dismiss(
      action === 'later'
        ? 'Preview: deferred until later.'
        : 'Preview: restart requested. No application will restart.',
    );
});
render();
