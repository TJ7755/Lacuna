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
  vi.unstubAllGlobals();
});

it('discards the prerender before revealing the root, even before React commits', () => {
  vi.stubGlobal('__VERCEL_ANALYTICS_ENABLED__', false);
  document.documentElement.setAttribute('data-app-starting', '');
  document.body.innerHTML = '<div id="root"><main class="landing-page">Landing</main></div>';
  const root = document.getElementById('root')!;
  const replaceChildren = vi.spyOn(root, 'replaceChildren');
  const removeAttribute = vi.spyOn(document.documentElement, 'removeAttribute');
  const render = vi.fn();
  createRoot.mockImplementation((container) => {
    expect(container).toBe(root);
    expect(root.childNodes).toHaveLength(0);
    expect(document.documentElement.hasAttribute('data-app-starting')).toBe(false);
    return { render };
  });

  renderApp();

  expect(replaceChildren.mock.invocationCallOrder[0]).toBeLessThan(
    removeAttribute.mock.invocationCallOrder[0],
  );
  expect(render).toHaveBeenCalledOnce();
});
