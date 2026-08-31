export interface AiRendererLike {
  isDestroyed(): boolean;
  isLoadingMainFrame(): boolean;
  on(event: 'did-start-loading', listener: () => void): unknown;
  off(event: 'did-start-loading', listener: () => void): unknown;
}

export class AiRendererAvailability {
  private observed: AiRendererLike | null = null;
  private available = false;
  private readonly onLoading = () => {
    this.becomeUnavailable();
  };

  constructor(private readonly onUnavailable: () => void = () => undefined) {}

  markReady(renderer: AiRendererLike): void {
    if (this.observed !== renderer) {
      this.becomeUnavailable();
      this.observed?.off('did-start-loading', this.onLoading);
      this.observed = renderer;
      renderer.on('did-start-loading', this.onLoading);
    }
    this.available = !renderer.isDestroyed();
  }

  markUnavailable(renderer: AiRendererLike): void {
    if (renderer === this.observed) this.becomeUnavailable();
  }

  canHandle(renderer: AiRendererLike | null): boolean {
    return this.available && renderer !== null && renderer === this.observed && !renderer.isDestroyed() &&
      !renderer.isLoadingMainFrame();
  }

  dispose(): void {
    this.becomeUnavailable();
    this.observed?.off('did-start-loading', this.onLoading);
    this.observed = null;
  }

  private becomeUnavailable(): void {
    if (!this.available) return;
    this.available = false;
    this.onUnavailable();
  }
}
