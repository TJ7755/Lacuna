// Mermaid diagram support for Markdown notes and cards.
//
// Fenced ```mermaid blocks arrive as <pre><code class="language-mermaid">.
// This module provides:
//  - `rehypeMermaidPlaceholder()` — marks those blocks with `lacuna-mermaid`
//    so they survive sanitisation and can be found after render.
//  - `renderMermaidDiagrams()` — replaces each placeholder with theme-aware
//    SVG via a lazy `mermaid` import. Diagrams are decorative revision aids,
//    so failures leave the original code block readable rather than blank.

interface HastElement {
  type: string;
  tagName: string;
  properties?: {
    className?: Array<string | number> | string;
    [key: string]: unknown;
  };
  children: Array<HastElement | { type: string }>;
}

interface HastParent {
  children: Array<HastElement | { type: string }>;
}

function classList(el: HastElement): string[] {
  const cls = el.properties?.className;
  if (Array.isArray(cls)) return cls.map(String);
  if (typeof cls === 'string') return cls.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Rehype plugin: tag `<pre>` elements wrapping a `language-mermaid` code block
 * with the `lacuna-mermaid` class. Runs before sanitisation.
 */
export function rehypeMermaidPlaceholder(): (tree: unknown) => void {
  return (tree) => {
    const root = tree as HastParent;
    if (!Array.isArray(root.children)) return;
    const stack: HastParent[] = [root];
    while (stack.length > 0) {
      const node = stack.pop() as HastParent;
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        const el = child as HastElement;
        if (el.tagName === 'pre') {
          const code = (el.children ?? []).find(
            (c) => c.type === 'element' && (c as HastElement).tagName === 'code',
          ) as HastElement | undefined;
          if (code && classList(code).some((c) => c === 'language-mermaid')) {
            const existing = classList(el);
            if (!existing.includes('lacuna-mermaid')) {
              el.properties = el.properties ?? {};
              el.properties.className = [...existing, 'lacuna-mermaid'];
            }
          }
        }
        if (Array.isArray((el as HastParent).children)) {
          stack.push(el as unknown as HastParent);
        }
      }
    }
  };
}

/** Mermaid diagram source text for a placeholder element. */
export function mermaidSourceFromElement(el: Element): string {
  return (el.textContent ?? '').trim();
}

let mermaidInitialisedFor: string | null = null;
let renderSequence = 0;

// Mermaid removes any existing SVG with this id before rendering. Concurrent
// note mounts (and theme updates) can share a millisecond, so time alone is unsafe.
function nextRenderId(): string {
  return `lacuna-mermaid-${Date.now().toString(36)}-${renderSequence++}`;
}

function palette(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  // Mermaid derives further colours, so resolve tokens using its comma-separated HSL syntax.
  const colour = (token: string) =>
    `hsl(${style.getPropertyValue(token).trim().split(/\s+/).join(', ')})`;
  return {
    primaryColor: colour('--accent-soft'),
    primaryTextColor: colour('--ink'),
    primaryBorderColor: colour('--accent-ink'),
    lineColor: colour('--ink-soft'),
    secondaryColor: colour('--surface'),
    secondaryTextColor: colour('--ink'),
    tertiaryColor: colour('--paper'),
    tertiaryTextColor: colour('--ink'),
    textColor: colour('--ink'),
    background: colour('--surface'),
    mainBkg: colour('--accent-soft'),
    nodeBorder: colour('--accent-ink'),
    clusterBkg: colour('--surface'),
    clusterBorder: colour('--line-strong'),
    edgeLabelBackground: colour('--surface'),
  };
}

/**
 * Render every `pre.lacuna-mermaid` inside `container` to SVG. Safe to call
 * repeatedly: already-rendered blocks carry `data-mermaid-rendered` and are
 * skipped. Import failures and invalid diagrams leave the code block in place.
 */
export async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll('pre.lacuna-mermaid:not([data-mermaid-rendered])'),
  );
  if (blocks.length === 0) return;
  if (typeof document === 'undefined') return;

  const mermaid = await loadMermaid();
  if (!mermaid) return;
  const themeKey = mermaidThemeKey();
  if (!ensureInitialised(mermaid, themeKey)) return;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    const source = mermaidSourceFromElement(block);
    if (!source) continue;
    const renderId = nextRenderId();
    try {
      const result = await mermaid.render(renderId, source);
      const clean = await sanitizeDiagramSvg(result.svg);
      if (!clean) {
        block.setAttribute('data-mermaid-error', 'true');
        continue;
      }
      const figure = document.createElement('div');
      figure.setAttribute('class', 'lacuna-mermaid-rendered');
      figure.setAttribute('role', 'img');
      figure.setAttribute('aria-label', 'Diagram');
      figure.innerHTML = clean;
      block.replaceChildren(figure);
      const details = document.createElement('details');
      details.setAttribute('class', 'lacuna-mermaid-source');
      const summary = document.createElement('summary');
      summary.textContent = 'Diagram source';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = source;
      pre.appendChild(code);
      details.appendChild(summary);
      details.appendChild(pre);
      block.appendChild(details);
      block.setAttribute('data-mermaid-rendered', 'true');
      block.setAttribute('data-mermaid-source', source);
      block.setAttribute('data-mermaid-theme', themeKey);
    } catch {
      block.setAttribute('data-mermaid-error', 'true');
    }
  }
}

/** Resettable in tests to force re-initialisation across themes. */
export function resetMermaidInitialisation(): void {
  mermaidInitialisedFor = null;
}

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidModulePromise: Promise<MermaidApi | null> | null = null;

function importMermaid(): Promise<MermaidApi | null> {
  mermaidModulePromise ??= import('mermaid')
    .then((mod) => (mod as { default?: MermaidApi }).default ?? (mod as unknown as MermaidApi))
    .catch(() => null);
  return mermaidModulePromise;
}

async function loadMermaid(): Promise<MermaidApi | null> {
  return importMermaid();
}

type SanitizerApi = {
  sanitize: (dirty: string, config?: Record<string, unknown>) => string;
};

let sanitizer: SanitizerApi | null = null;
let sanitizerModulePromise: Promise<unknown> | null = null;

function importSanitizer(): Promise<unknown> {
  sanitizerModulePromise ??= import('dompurify').catch(() => null);
  return sanitizerModulePromise;
}

function asSanitizer(value: unknown): SanitizerApi | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as SanitizerApi).sanitize === 'function'
  ) {
    return value as SanitizerApi;
  }
  // The default export is itself callable with the sanitizer attached.
  if (
    typeof value === 'function' &&
    typeof (value as unknown as SanitizerApi).sanitize === 'function'
  ) {
    return value as unknown as SanitizerApi;
  }
  return null;
}

async function loadSanitizer(): Promise<SanitizerApi | null> {
  if (sanitizer) return sanitizer;
  const mod = await importSanitizer();
  if (!mod) return null;
  const candidate = (mod as { default?: unknown }).default ?? mod;
  const ready = asSanitizer(candidate);
  if (ready) {
    sanitizer = ready;
    return sanitizer;
  }
  // Unbound factory bundling: bind explicitly as a fallback.
  if (typeof candidate === 'function' && typeof window !== 'undefined') {
    try {
      const bound = asSanitizer((candidate as (window: Window) => unknown)(window));
      if (bound) {
        sanitizer = bound;
        return sanitizer;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Scrub rendered diagram SVG before it reaches the document. Mermaid already
 * runs at `securityLevel: strict`, but the diagram source is user-authored (and
 * may arrive in imported decks), so the SVG is treated as untrusted input and
 * passed through DOMPurify as defence in depth.
 */
export async function sanitizeDiagramSvg(dirty: string): Promise<string> {
  const purifier = await loadSanitizer();
  if (!purifier) return '';
  try {
    return purifier.sanitize(dirty);
  } catch {
    return '';
  }
}

/** Include resolved tokens so accent changes invalidate existing diagrams too. */
export function mermaidThemeKey(): string {
  if (typeof document === 'undefined') return 'light';
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return `${theme}:${JSON.stringify(palette())}`;
}

function ensureInitialised(mermaid: MermaidApi, themeKey: string): boolean {
  if (mermaidInitialisedFor === themeKey) return true;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      // SVG text survives sanitisation without allowing foreignObject HTML.
      htmlLabels: false,
      theme: 'base',
      themeVariables: palette(),
      fontFamily: 'Instrument Sans, system-ui, sans-serif',
    });
    mermaidInitialisedFor = themeKey;
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-render diagrams after theme or accent changes without re-parsing Markdown.
 */
export async function updateMermaidTheme(container: HTMLElement): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll('pre.lacuna-mermaid[data-mermaid-rendered]'),
  );
  if (blocks.length === 0) return;
  const mermaid = await loadMermaid();
  if (!mermaid) return;
  const themeKey = mermaidThemeKey();
  if (!ensureInitialised(mermaid, themeKey)) return;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    if (block.getAttribute('data-mermaid-theme') === themeKey) continue;
    const source = block.getAttribute('data-mermaid-source');
    const figure = block.querySelector('.lacuna-mermaid-rendered');
    if (!source || !figure) continue;
    try {
      const result = await mermaid.render(nextRenderId(), source);
      const clean = await sanitizeDiagramSvg(result.svg);
      if (!clean) continue;
      figure.innerHTML = clean;
      block.setAttribute('data-mermaid-theme', themeKey);
    } catch {
      // Keep the previous rendering; the source section remains available.
    }
  }
}
