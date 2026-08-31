import { describe, expect, it, vi } from 'vitest';
import { AiChannelRegistry } from '../../electron/mcp/aiChannelRegistry';

function channel() {
  return { destroyed: false, destroy: vi.fn() };
}

describe('AI companion channel registry', () => {
  it('terminates every registered AI channel and leaves removed channels alone', () => {
    const registry = new AiChannelRegistry();
    const active = channel();
    const removed = channel();
    registry.add('active', active);
    registry.add('removed', removed);
    registry.delete('removed');

    registry.terminateAll();

    expect(active.destroy).toHaveBeenCalledOnce();
    expect(removed.destroy).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it('terminates one exact channel without affecting another', () => {
    const registry = new AiChannelRegistry();
    const selected = channel();
    const other = channel();
    registry.add('selected', selected);
    registry.add('other', other);

    expect(registry.terminate('selected')).toBe(true);
    expect(registry.terminate('missing')).toBe(false);

    expect(selected.destroy).toHaveBeenCalledOnce();
    expect(other.destroy).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);
  });

  it('does not destroy a channel which has already closed', () => {
    const registry = new AiChannelRegistry();
    const closed = channel();
    closed.destroyed = true;
    registry.add('closed', closed);

    registry.terminateAll();

    expect(closed.destroy).not.toHaveBeenCalled();
  });
});
