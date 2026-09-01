export interface AiRendererLike {
  isDestroyed(): boolean;
  isLoadingMainFrame(): boolean;
  on(event: 'did-start-loading', listener: () => void): unknown;
  off(event: 'did-start-loading', listener: () => void): unknown;
}

export class AiRendererAvailability {
  private observed: AiRendererLike | null = null;
  private subscriptionId: number | null = null;
  private available = false;
  private unavailableTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.observed?.off('did-start-loading', this.onLoading);
      this.observed = renderer;
      renderer.on('did-start-loading', this.onLoading);
    }
    this.cancelPendingUnavailable();
    this.subscriptionId = subscriptionId;
    this.available = !renderer.isDestroyed();
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

  dispose(): void {
    this.becomeUnavailable(true);
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
}
