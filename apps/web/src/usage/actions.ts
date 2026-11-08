import type { UsageAction } from '@lacuna/protocol/usage';

export type UsageActionSource = 'button' | 'menu' | 'shortcut' | 'link' | 'form' | 'other';
type Listener = (action: UsageAction, source?: UsageActionSource) => void;

let listener: Listener | undefined;

export function recordUsageAction(action: UsageAction, source?: UsageActionSource): void {
  listener?.(action, source);
}

export function subscribeUsageActions(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = undefined;
  };
}
