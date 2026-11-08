import {
  USAGE_ACTIONS,
  USAGE_SCROLL_BANDS,
  USAGE_WORKFLOW_ACTIONS,
  usagePageForRoute,
  type UsageAction,
  type UsageKey,
  type UsagePage,
} from '@lacuna/protocol/usage';
import type { router as appRouter } from '../routes/router';
import { readInputMode, resolveInputMode } from '../state/inputMode';
import { canCollectUsage, readUsagePreference, subscribeToUsagePreference } from './preference';
import {
  createUsageOutbox,
  discardExistingUsageBatches,
  USAGE_COUNT_LIMIT,
  usageDay,
  type UsageDelta,
} from './outbox';

declare const __APP_VERSION__: string;

type UsageRouter = Pick<typeof appRouter, 'state' | 'subscribe'>;
type ActionSource = 'button' | 'menu' | 'shortcut' | 'link' | 'form' | 'other';
type Input = 'pointer' | 'touch' | 'keyboard';
type View = {
  page: UsagePage;
  pathname: string;
  startedAt: number;
  foregroundSince: number | undefined;
  foregroundMs: number;
  firstAction: boolean;
  exposures: Set<UsageAction>;
  scrollBand: number;
};

const COLLECT_URL = 'https://relay.getlacuna.app/usage/collect';
const FLUSH_MS = 120_000;
const ACTIONS: ReadonlySet<string> = new Set(USAGE_ACTIONS);
const WORKFLOWS: ReadonlySet<UsageAction> = new Set(USAGE_WORKFLOW_ACTIONS);
const CONTROL =
  '[data-usage-action], button, a[href], [role="button"], [role="link"], ' +
  '[role^="menuitem"], [role="tab"], [role="switch"], summary, form, select, ' +
  '[role="dialog"], [role="alertdialog"], input[type="checkbox"], input[type="radio"]';
const PRIVATE = '[inert], [contenteditable="true"], [data-usage-private], .prose-lacuna';

let dispatchAction: ((action: UsageAction, source?: ActionSource) => void) | undefined;

export function recordUsageAction(action: UsageAction, source?: ActionSource): void {
  dispatchAction?.(action, source);
}

/** Classification uses fixed control semantics only. Text, hrefs and values never enter a key. */
export function usageActionForControl(element: Element): UsageAction | undefined {
  if (element.closest(PRIVATE) || element.matches(':disabled, [aria-disabled="true"]')) return;
  const named = element.getAttribute('data-usage-action');
  if (named && ACTIONS.has(named)) return named as UsageAction;
  if (element.matches('[role="tab"]')) return 'tab';
  if (element.matches('[role="switch"]')) return 'switch';
  if (element.matches('[role^="menuitem"], [aria-haspopup="menu"]')) return 'menu';
  if (element.matches('[role="dialog"], [role="alertdialog"]')) return 'dialog';
  if (element.matches('a[href], [role="link"]')) return 'link';
  if (element.matches('summary')) return 'disclosure';
  if (element.matches('form')) return 'form';
  if (element.matches('select')) return 'select';
  if (element.matches('input[type="checkbox"]')) return 'checkbox';
  if (element.matches('input[type="radio"]')) return 'radio';
  if (element.matches('button, [role="button"]')) return 'button';
}

function timeBand(ms: number) {
  if (ms < 1_000) return 'under-one';
  if (ms < 5_000) return 'one-to-five';
  return ms < 30_000 ? 'five-to-thirty' : 'thirty-plus';
}

function clickedSource(control: Element): ActionSource {
  if (control.matches('[role^="menuitem"], [aria-haspopup="menu"]')) return 'menu';
  if (control.matches('a[href], [role="link"]')) return 'link';
  if (control.matches('button, [role="button"]')) return 'button';
  return 'other';
}

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

function routeOpenedAction(page: UsagePage): UsageAction | undefined {
  if (page === 'search') return 'search-opened';
  if (page === 'share') return 'share-opened';
  if (page.endsWith('-editor')) return 'edit-opened';
}

/** Route state is used for committed views, while a single delegate sees app controls and portals. */
export function installUsageCollector(router: UsageRouter): () => void {
  let active: AbortController | undefined;
  let outbox: ReturnType<typeof createUsageOutbox> | undefined;
  let deltas = new Map<string, UsageDelta>();
  let current: View | undefined;
  let routeStartedAt: number | undefined;
  let source: ActionSource | undefined;
  let sourceReset = 0;
  let scrollFrame = 0;
  let uploading = false;
  let uploadQueued = false;
  let retryAfter = 0;
  let checkedDisabledStartup = false;
  let cleanup: Promise<void> | undefined;
  let disposed = false;
  let sessionPages = new Set<UsagePage>();
  let sessionWorkflows = new Set<UsageAction>();
  const dialogs = new WeakSet<Element>();

  function permitted(signal = active?.signal) {
    return !disposed && !!signal && !signal.aborted && canCollectUsage();
  }

  function delta(): UsageDelta {
    const day = usageDay(Date.now());
    let value = deltas.get(day);
    if (!value) {
      value = { rows: new Map(), used: new Set() };
      deltas.set(day, value);
    }
    return value;
  }

  function count(key: UsageKey) {
    const { rows } = delta();
    rows.set(key, Math.min(USAGE_COUNT_LIMIT, (rows.get(key) ?? 0) + 1));
  }

  function action(actionName: UsageAction, entry = source, input?: Input, automatic = false) {
    if (!current || !permitted() || !isVisible() || !ACTIONS.has(actionName)) return;
    const { page } = current;
    count(`action/${page}/${actionName}`);
    count(`${navigator.onLine ? 'online' : 'offline'}/${page}/${actionName}`);
    if (input || entry === 'shortcut') count(`input/${page}/${input ?? 'keyboard'}`);
    if (entry) count(`source/${page}/${actionName}/${entry}`);
    if (!automatic && !current.firstAction) {
      current.firstAction = true;
      count(`first-action/${page}/${timeBand(performance.now() - current.startedAt)}`);
    }
    if (!WORKFLOWS.has(actionName)) return;
    delta().used.add(`${page}/${actionName}`);
    if (sessionWorkflows.has(actionName)) return;
    for (const previous of sessionWorkflows) {
      const [first, second] = [previous, actionName].sort();
      count(`pair/${first}/${second}`);
    }
    sessionWorkflows.add(actionName);
  }

  const intersection =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(
          (entries) => {
            if (!current || !permitted() || !isVisible()) return;
            for (const { target, isIntersecting, intersectionRect } of entries) {
              if (!isIntersecting || intersectionRect.width === 0 || intersectionRect.height === 0)
                continue;
              const kind = usageActionForControl(target);
              if (kind && kind !== 'dialog' && current.exposures.has(kind)) {
                intersection?.unobserve(target);
                continue;
              }
              if (!kind || getComputedStyle(target).visibility !== 'visible') continue;
              if (!current.exposures.has(kind)) {
                current.exposures.add(kind);
                count(`exposure/${current.page}/${kind}`);
              }
              if (kind === 'dialog' && !dialogs.has(target)) {
                dialogs.add(target);
                action('dialog', undefined, undefined, true);
              }
              intersection?.unobserve(target);
            }
          },
          { threshold: 0.1 },
        );

  function scan(node: Node, observe = true) {
    if (!intersection || !(node instanceof Element) || !current) return;
    function update(element: Element) {
      if (!observe) intersection?.unobserve(element);
      else {
        const kind = usageActionForControl(element);
        if (kind && (kind === 'dialog' || !current?.exposures.has(kind))) {
          intersection?.observe(element);
        }
      }
    }
    if (node.matches(CONTROL)) update(node);
    for (const element of node.querySelectorAll(CONTROL)) update(element);
  }

  const mutations = new MutationObserver((records) => {
    if (!current || !permitted()) return;
    for (const record of records) {
      if (record.type === 'attributes') scan(record.target);
      for (const node of record.removedNodes) scan(node, false);
      for (const node of record.addedNodes) scan(node);
    }
  });

  function pauseForeground(view: View) {
    if (view.foregroundSince !== undefined) {
      view.foregroundMs += performance.now() - view.foregroundSince;
      view.foregroundSince = undefined;
    }
  }

  function finishView() {
    if (!current) return;
    pauseForeground(current);
    if (current.foregroundMs > 0) {
      count(`foreground/${current.page}/${timeBand(current.foregroundMs)}`);
    }
    if (current.scrollBand > 0) {
      count(`scroll/${current.page}/${USAGE_SCROLL_BANDS[current.scrollBand - 1]}`);
    }
    current = undefined;
    intersection?.disconnect();
  }

  function routeChanged(state: UsageRouter['state'] = router.state) {
    if (!permitted()) return;
    if (state.navigation.state !== 'idle' || !state.initialized) {
      routeStartedAt ??= performance.now();
      return;
    }
    const match = state.matches.at(-1)?.route;
    const page = usagePageForRoute(match?.path, match?.index === true);
    const { pathname } = state.location;
    if (current?.pathname === pathname && current.page === page) {
      routeStartedAt = undefined;
      return;
    }
    const previous = current?.page;
    finishView();
    if (!page || !isVisible()) return;
    const now = performance.now();
    const loadStart = routeStartedAt ?? now;
    routeStartedAt = undefined;
    const view: View = {
      page,
      pathname,
      startedAt: now,
      foregroundSince: now,
      foregroundMs: 0,
      firstAction: false,
      exposures: new Set(),
      scrollBand: 0,
    };
    current = view;
    count(`view/${page}`);
    delta().used.add(page);
    const opened = routeOpenedAction(page);
    if (opened) action(opened, source, undefined, true);
    if (previous) count(`transition/${previous}/${page}`);
    else if (!sessionPages.size) count(`entry/${page}`);
    sessionPages.add(page);
    count(`screen/${page}/${innerWidth < 640 ? 'small' : innerWidth < 1024 ? 'medium' : 'large'}`);
    try {
      count(`mode/${page}/${resolveInputMode(readInputMode())}`);
    } catch {
      // Storage may be unavailable for this optional breakdown.
    }
    if (
      typeof __APP_VERSION__ === 'string' &&
      /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(__APP_VERSION__)
    ) {
      count(`release/${page}/${__APP_VERSION__}`);
    }
    // Wait for the commit to paint before observing the new route's controls.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (current !== view || !permitted() || !isVisible()) return;
        count(`render/${page}/${timeBand(performance.now() - loadStart)}`);
        scan(document.body);
      });
    });
  }

  function onClick(event: MouseEvent) {
    if (
      !current ||
      !permitted() ||
      !isVisible() ||
      !event.isTrusted ||
      !(event.target instanceof Element)
    )
      return;
    const control = event.target.closest(CONTROL);
    if (!control) return;
    const kind = usageActionForControl(control);
    if (!kind || kind === 'dialog' || kind === 'form') return;
    source = clickedSource(control);
    window.clearTimeout(sourceReset);
    sourceReset = window.setTimeout(() => (source = undefined), 0);
    const input =
      'pointerType' in event && (event.pointerType === 'touch' || event.pointerType === 'pen')
        ? 'touch'
        : event.detail === 0
          ? 'keyboard'
          : 'pointer';
    action(kind, source, input);
  }

  function onChange(event: Event) {
    if (current && permitted() && event.isTrusted && event.target instanceof HTMLSelectElement) {
      const kind = usageActionForControl(event.target);
      if (kind) action(kind);
    }
  }

  function onSubmit(event: SubmitEvent) {
    if (current && permitted() && event.isTrusted && event.target instanceof HTMLFormElement) {
      const kind = usageActionForControl(event.target);
      if (kind) action(kind, 'form');
    }
  }

  function onScroll(event: Event) {
    const target = event.target === document ? document.scrollingElement : event.target;
    if (!current || !permitted() || !event.isTrusted || !(target instanceof HTMLElement)) return;
    if (target.closest(PRIVATE) || target.matches('textarea, input')) return;
    const view = current;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (current !== view || !permitted() || !isVisible()) return;
      const available = target.scrollHeight - target.clientHeight;
      if (available <= 0) return;
      const fraction = target.scrollTop / available;
      const next = fraction >= 0.99 ? 4 : Math.floor(fraction * 4);
      current.scrollBand = Math.max(current.scrollBand, next);
    });
  }

  async function upload() {
    const signal = active?.signal;
    const queue = outbox;
    if (!signal || !queue || cleanup || !permitted(signal) || Date.now() < retryAfter) return;
    if (uploading) {
      uploadQueued = true;
      return;
    }
    uploading = true;
    try {
      for (let index = 0; index < 6 && navigator.onLine && permitted(signal); index++) {
        const batch = await queue.next();
        if (!batch || !permitted(signal)) break;
        const response = await fetch(COLLECT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
          keepalive: true,
          signal:
            typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
              : signal,
        });
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          retryAfter = Date.now() + (seconds > 0 ? Math.min(seconds, 600) * 1_000 : FLUSH_MS);
          break;
        }
        if (![204, 400, 413, 422].includes(response.status)) break;
        await queue.acknowledge(batch.id);
      }
    } catch {
      // Optional analytics must not interfere with the app; saved batches retry by the same ID.
    } finally {
      uploading = false;
      if (uploadQueued) {
        uploadQueued = false;
        void upload();
      }
    }
  }

  function flush() {
    const signal = active?.signal;
    const queue = outbox;
    if (!signal || !queue || !permitted(signal)) return;
    const pending = deltas;
    deltas = new Map();
    // Lifecycle callbacks must persist their new deltas even while another request is awaiting
    // its response. A disappearing document cannot rely on that upload ever settling.
    const persist = () => queue.persist(pending, () => permitted(signal));
    const saved = pending.size ? (cleanup ? cleanup.then(persist) : persist()) : cleanup;
    if (saved) void saved.then(upload, () => {});
    else void upload();
  }

  function discard(job: Promise<void>) {
    const pending = Promise.all([cleanup, job.catch(() => {})]).then(() => undefined);
    cleanup = pending;
    void pending.then(() => {
      if (cleanup === pending) cleanup = undefined;
    });
  }

  function onVisibility() {
    if (!permitted()) return;
    if (isVisible()) {
      if (current) current.foregroundSince ??= performance.now();
      else routeChanged();
      scan(document.body);
    } else {
      if (current) pauseForeground(current);
      void flush();
    }
  }

  function onPageHide() {
    if (!permitted()) return;
    finishView();
    if (sessionPages.size) {
      count(
        `breadth/${sessionPages.size === 1 ? 'one' : sessionPages.size < 5 ? 'two-to-four' : 'five-plus'}`,
      );
    }
    sessionPages.clear();
    sessionWorkflows.clear();
    void flush();
  }

  function refresh() {
    if (canCollectUsage()) {
      if (active) return;
      checkedDisabledStartup = true;
      active = new AbortController();
      outbox ??= createUsageOutbox();
      mutations.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'open', 'hidden', 'inert'],
      });
      routeChanged();
      void flush();
    } else if (active) {
      active.abort();
      active = undefined;
      current = undefined;
      routeStartedAt = undefined;
      deltas.clear();
      sessionPages = new Set();
      sessionWorkflows = new Set();
      intersection?.disconnect();
      mutations.disconnect();
      if (outbox) discard(outbox.discard());
    } else if (!checkedDisabledStartup) {
      checkedDisabledStartup = true;
      const preference = readUsagePreference();
      if (preference === 'on' || preference === 'off') discard(discardExistingUsageBatches());
    }
  }

  dispatchAction = action;
  const unsubscribeRouter = router.subscribe(routeChanged);
  const unsubscribePreference = subscribeToUsagePreference(refresh);
  const timer = window.setInterval(() => void flush(), FLUSH_MS);
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onVisibility);
  window.addEventListener('online', flush);
  refresh();

  return () => {
    disposed = true;
    active?.abort();
    if (dispatchAction === action) dispatchAction = undefined;
    unsubscribeRouter();
    unsubscribePreference();
    window.clearTimeout(sourceReset);
    window.clearInterval(timer);
    cancelAnimationFrame(scrollFrame);
    intersection?.disconnect();
    mutations.disconnect();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onVisibility);
    window.removeEventListener('online', flush);
    outbox?.close();
  };
}
