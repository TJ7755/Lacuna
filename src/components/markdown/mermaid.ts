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

function palette(dark: boolean): Record<string, string> {
  return dark
    ? {
        primaryColor: '#2a2620',
        primaryTextColor: '#f0ede7',
        primaryBorderColor: '#c8a853',
        lineColor: '#8a8478',
        secondaryColor: '#1c1b18',
        tertiaryColor: '#26241f',
        background: '#141311',
        mainBkg: '#2a2620',
        nodeBorder: '#c8a853',
        clusterBkg: '#1c1b18',
        edgeLabelBackground: '#141311',
      }
    : {
        primaryColor: '#faf7f0',
        primaryTextColor: '#1a1816',
        primaryBorderColor: '#7a3f14',
        lineColor: '#6b6459',
        secondaryColor: '#f5f2ec',
        tertiaryColor: '#efe9dc',
        background: '#ffffff',
        mainBkg: '#faf7f0',
        nodeBorder: '#7a3f14',
        clusterBkg: '#f5f2ec',
        edgeLabelBackground: '#ffffff',
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
  if (!ensureInitialised(mermaid, mermaidThemeKey())) return;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    const source = mermaidSourceFromElement(block);
    if (!source) continue;
    const renderId = `lacuna-mermaid-${Date.now().toString(36)}-${i}`;
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

async function loadMermaid(): Promise<MermaidApi | null> {
  try {
    const mod = await import('mermaid');
    return (mod as { default?: MermaidApi }).default ?? (mod as unknown as MermaidApi);
  } catch {
    return null;
  }
}

type SanitizerApi = {
  sanitize: (dirty: string, config?: Record<string, unknown>) => string;
};

let sanitizer: SanitizerApi | null = null;

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
  try {
    const mod = await import('dompurify');
    const candidate = (mod as { default?: unknown }).default ?? mod;
    const ready = asSanitizer(candidate);
    if (ready) {
      sanitizer = ready;
      return sanitizer;
    }
    // Unbound factory bundling: bind explicitly as a fallback.
    if (typeof candidate === 'function' && typeof window !== 'undefined') {
      const bound = asSanitizer(
        (candidate as (window: Window) => unknown)(window),
      );
      if (bound) {
        sanitizer = bound;
        return sanitizer;
      }
    }
    return null;
  } catch {
    return null;
  }
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

/** Current colour-scheme theme key, matching ThemeContext's resolved theme. */
export function mermaidThemeKey(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function ensureInitialised(mermaid: MermaidApi, themeKey: 'dark' | 'light'): boolean {
  if (mermaidInitialisedFor === themeKey) return true;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: palette(themeKey === 'dark'),
      fontFamily: 'Geist, system-ui, sans-serif',
    });
    mermaidInitialisedFor = themeKey;
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-render already-rendered diagrams after a light/dark theme switch. Sources
 * are read back from each block's collapsible source section, so no
 * re-parsing of the Markdown is needed. No-op when the theme is unchanged.
 */
export async function updateMermaidTheme(container: HTMLElement): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll('pre.lacuna-mermaid[data-mermaid-rendered]'),
  );
  if (blocks.length === 0) return;
  const mermaid = await loadMermaid();
  if (!mermaid) return;
  const themeKey = mermaidThemeKey();
  if (mermaidInitialisedFor === themeKey) return;
  if (!ensureInitialised(mermaid, themeKey)) return;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HTMLElement;
    const source = block.querySelector('.lacuna-mermaid-source code')?.textContent?.trim();
    const figure = block.querySelector('.lacuna-mermaid-rendered');
    if (!source || !figure) continue;
    try {
      const result = await mermaid.render(`lacuna-mermaid-${Date.now().toString(36)}-${i}`, source);
      const clean = await sanitizeDiagramSvg(result.svg);
      if (!clean) continue;
      figure.innerHTML = clean;
    } catch {
      // Keep the previous rendering; the source section remains available.
    }
  }
}
