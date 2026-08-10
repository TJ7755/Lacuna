import { expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { cleanup } from '@testing-library/react';
import { Storage } from 'happy-dom';
import '@testing-library/jest-dom/vitest';

const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  function TestMemoryRouter(props: React.ComponentProps<typeof actual.MemoryRouter>) {
    return React.createElement(actual.MemoryRouter, {
      ...props,
      future: { ...props.future, ...ROUTER_FUTURE_FLAGS },
    });
  }

  function createTestMemoryRouter(
    routes: Parameters<typeof actual.createMemoryRouter>[0],
    options?: Parameters<typeof actual.createMemoryRouter>[1],
  ) {
    return actual.createMemoryRouter(routes, {
      ...options,
      future: { ...options?.future, ...ROUTER_FUTURE_FLAGS },
    });
  }

  return {
    ...actual,
    MemoryRouter: TestMemoryRouter,
    createMemoryRouter: createTestMemoryRouter,
  };
});

// Node 25 can install an unusable localStorage shim before Happy DOM starts.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  enumerable: true,
  value: new Storage(),
  writable: true,
});

// Happy DOM does not create a doctype for its test document. KaTeX quite rightly
// refuses to render in quirks mode, but the missing test-document doctype is not
// a useful signal from the component suite.
Object.defineProperty(document, 'compatMode', {
  configurable: true,
  value: 'CSS1Compat',
});

// Video-embed tests verify the generated iframe markup, not remote websites. Keep
// those two trusted hosts local and successful so iframe teardown cannot emit
// network aborts into an otherwise passing test run.
type HappyDomFrameWindow = Window & { Response: typeof Response };
type HappyDomFetchContext = {
  request: { url: string };
  window: HappyDomFrameWindow;
};
type HappyDomSettings = {
  fetch: {
    interceptor: {
      beforeAsyncRequest?: (context: HappyDomFetchContext) => Promise<unknown>;
    } | null;
  };
};

const happyDom = (window as unknown as { happyDOM?: { settings: HappyDomSettings } }).happyDOM;
if (happyDom) {
  happyDom.settings.fetch.interceptor = {
    beforeAsyncRequest: async ({ request, window: frameWindow }) => {
      if (
        request.url.startsWith('https://www.youtube-nocookie.com/embed/') ||
        request.url.startsWith('https://player.vimeo.com/video/')
      ) {
        return new frameWindow.Response('<!doctype html><html><body></body></html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return undefined;
    },
  };
}

// Ensure React testing library cleans up the DOM after each test.
afterEach(() => cleanup());

// Tell React we're in a test environment so act() warnings are suppressed.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
