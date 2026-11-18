import { afterEach, expect, it, vi } from 'vitest';

const { createRoot } = vi.hoisted(() => ({ createRoot: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock('./App', () => ({ App: () => null }));
vi.mock('./components/ui/pressFeedback', () => ({ installPressFeedback: vi.fn() }));
vi.mock('./components/ui/typingFeedback', () => ({ installTypingFeedback: vi.fn() }));

import { renderApp } from './appRoot';

afterEach(() => {
  document.documentElement.removeAttribute('data-app-starting');
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('reveals an empty root while the first React commit is pending', () => {
  document.documentElement.setAttribute('data-app-starting', '');
  document.body.innerHTML = '<div id="root"><main class="landing-page">Landing</main></div>';
  // Hold the first commit so the pre-commit paint is observable.
  createRoot.mockReturnValue({ render: vi.fn() });
  renderApp();
  expect(document.documentElement).not.toHaveAttribute('data-app-starting');
  expect(document.getElementById('root')).toBeEmptyDOMElement();
});
