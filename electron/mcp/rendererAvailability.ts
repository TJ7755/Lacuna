export interface AiRendererLike {
  isDestroyed(): boolean;
  isLoadingMainFrame(): boolean;
  on(event: 'did-start-loading' | 'destroyed', listener: () => void): unknown;
  off(event: 'did-start-loading' | 'destroyed', listener: () => void): unknown;
}

export type AiRendererStatus = 'ready' | 'waiting' | 'unavailable';

interface ReadyWaiter {
  renderer: AiRendererLike;
  timer: ReturnType<typeof setTimeout>;
  onDestroyed: () => void;
  resolve: (ready: boolean) => void;
}

export class AiRendererAvailability {
  private observed: AiRendererLike | null = null;
  private subscriptionId: number | null = null;
  private available = false;
  private unavailableTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly readyWaiters = new Set<ReadyWaiter>();
  private readonly onLoading = () => {
    this.becomeUnavailable(true);
  };

  constructor(
    private readonly onUnavailable: () => void = () => undefined,
    private readonly remountGraceMs = 250,
  ) {}

  markReady(renderer: AiRendererLike, subscriptionId: number): void {
    if (this.observed !== renderer) {
      this.becomeUnavailable(true);
      this.settleReadyWaiters(false, (waiter) => waiter.renderer !== renderer);
      this.observed?.off('did-start-loading', this.onLoading);
      this.observed = renderer;
      renderer.on('did-start-loading', this.onLoading);
    }
    this.cancelPendingUnavailable();
    this.subscriptionId = subscriptionId;
    this.available = !renderer.isDestroyed();
    if (this.available) {
      this.settleReadyWaiters(true, (waiter) => waiter.renderer === renderer);
    }
  }

  markUnavailable(renderer: AiRendererLike, subscriptionId: number): void {
    if (renderer === this.observed && subscriptionId === this.subscriptionId) {
      this.becomeUnavailable(false);
    }
  }

  canHandle(renderer: AiRendererLike | null): boolean {
    return this.available && renderer !== null && renderer === this.observed && !renderer.isDestroyed() &&
      !renderer.isLoadingMainFrame();
  }

  status(renderer: AiRendererLike | null): AiRendererStatus {
    if (!renderer || renderer.isDestroyed()) return 'unavailable';
    return this.canHandle(renderer) ? 'ready' : 'waiting';
  }

  waitUntilReady(renderer: AiRendererLike, timeoutMs: number): Promise<boolean> {
    if (this.canHandle(renderer)) return Promise.resolve(true);
    if (renderer.isDestroyed() || timeoutMs <= 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const waiter: ReadyWaiter = {
        renderer,
        timer: setTimeout(() => this.settleReadyWaiter(waiter, false), timeoutMs),
        onDestroyed: () => this.settleReadyWaiter(waiter, false),
        resolve,
      };
      this.readyWaiters.add(waiter);
      renderer.on('destroyed', waiter.onDestroyed);
      if (renderer.isDestroyed()) this.settleReadyWaiter(waiter, false);
    });
  }

  beginRestart(renderer: AiRendererLike): boolean {
    if (renderer.isDestroyed() || (this.observed !== null && renderer !== this.observed)) {
      return false;
    }
    if (this.observed === null) return true;
    this.subscriptionId = null;
    this.becomeUnavailable(true);
    return true;
  }

  dispose(): void {
    this.becomeUnavailable(true);
    this.settleReadyWaiters(false);
    this.observed?.off('did-start-loading', this.onLoading);
    this.observed = null;
    this.subscriptionId = null;
  }

  private becomeUnavailable(immediate: boolean): void {
    const shouldNotify = this.available || this.unavailableTimer !== null;
    if (!shouldNotify) return;
    this.available = false;
    this.cancelPendingUnavailable();
    if (immediate) {
      this.onUnavailable();
      return;
    }
    this.unavailableTimer = setTimeout(() => {
      this.unavailableTimer = null;
      if (!this.available) this.onUnavailable();
    }, this.remountGraceMs);
  }

  private cancelPendingUnavailable(): void {
    if (this.unavailableTimer === null) return;
    clearTimeout(this.unavailableTimer);
    this.unavailableTimer = null;
  }

  private settleReadyWaiter(waiter: ReadyWaiter, ready: boolean): void {
    if (!this.readyWaiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    waiter.renderer.off('destroyed', waiter.onDestroyed);
    waiter.resolve(ready);
  }

  private settleReadyWaiters(
    ready: boolean,
    predicate: (waiter: ReadyWaiter) => boolean = () => true,
  ): void {
    for (const waiter of this.readyWaiters) {
      if (predicate(waiter)) this.settleReadyWaiter(waiter, ready);
    }
  }
}
