import { renderToReadableStream } from 'react-dom/server';
import { Window } from 'happy-dom';
import { LandingRoot } from './LandingRoot';

const PRERENDER_URL = 'https://getlacuna.app/';

/**
 * Render the same landing tree the browser hydrates; no separate SEO copy.
 * The landing page reads `window` and `localStorage` during render (theme and
 * motion preferences), so install a minimal browser shim first. The URL carries
 * no hash so the hash router starts on `/`, exactly as a crawler sees it.
 */
export async function render() {
  const view = new Window({ url: PRERENDER_URL });
  const globals = globalThis as Record<string, unknown>;
  const previous = {
    window: globals.window,
    document: globals.document,
    localStorage: globals.localStorage,
  };
  globals.window = view;
  globals.document = view.document;
  globals.localStorage = view.localStorage;
  try {
    // Keep the outer renderer separate from the card renderer’s nested static Markdown pass.
    const stream = await renderToReadableStream(<LandingRoot />);
    return new Response(stream).text();
  } finally {
    if (previous.window === undefined) delete globals.window;
    else globals.window = previous.window;
    if (previous.document === undefined) delete globals.document;
    else globals.document = previous.document;
    if (previous.localStorage === undefined) delete globals.localStorage;
    else globals.localStorage = previous.localStorage;
    await view.happyDOM.close();
  }
}
