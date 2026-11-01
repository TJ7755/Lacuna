export interface DestroyableAiChannel {
  readonly destroyed: boolean;
  destroy(): void;
}

/** Tracks only purpose-authenticated AI channels, never the broader data companion. */
export class AiChannelRegistry {
  private readonly channels = new Map<string, DestroyableAiChannel>();

  get size(): number {
    return this.channels.size;
  }

  add(channelId: string, channel: DestroyableAiChannel): void {
    this.channels.set(channelId, channel);
  }

  delete(channelId: string): void {
    this.channels.delete(channelId);
  }

  terminate(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;
    this.channels.delete(channelId);
    if (!channel.destroyed) channel.destroy();
    return true;
  }

  terminateAll(): void {
    const active = [...this.channels.values()];
    this.channels.clear();
    for (const channel of active) {
      if (!channel.destroyed) channel.destroy();
    }
  }
}
