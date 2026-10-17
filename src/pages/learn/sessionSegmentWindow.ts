export const SESSION_SEGMENT_MIN_WIDTH = 16;
export const SESSION_SEGMENT_GAP = 4;

export function sessionSegmentWindow(total: number, currentIndex: number, width: number) {
  const capacity = Math.max(
    1,
    Math.floor((width + SESSION_SEGMENT_GAP) / (SESSION_SEGMENT_MIN_WIDTH + SESSION_SEGMENT_GAP)),
  );
  const size = width > 0 ? Math.min(total, capacity) : total;
  const segmentWidth = Math.max(
    SESSION_SEGMENT_MIN_WIDTH,
    (width - Math.max(0, size - 1) * SESSION_SEGMENT_GAP) / Math.max(1, size),
  );
  const trigger = Math.max(1, Math.floor(size * 0.8));
  const stride = Math.max(1, trigger - Math.floor(size * 0.2));
  const index = Math.max(0, Math.min(total - 1, currentIndex));
  // Derive the window from the index, so Undo, retries and arbitrary navigation
  // always land in the same window without keeping a second navigation history.
  const start = index < trigger ? 0 : (Math.floor((index - trigger) / stride) + 1) * stride;
  return {
    size,
    start: Math.max(0, Math.min(total - size, start)),
    segmentWidth,
  };
}
