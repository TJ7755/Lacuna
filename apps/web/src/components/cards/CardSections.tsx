import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useVirtualList } from '../../hooks/useVirtualList';

const SectionContext = createContext<{
  activate: () => () => void;
  previouslyMounted: boolean;
  entranceStartedAt: number;
} | null>(null);

/** Keep an unfinished interaction mounted, including its fixed toolbar and focus.
 * Nested groups also retain their enclosing lesson while an interaction is open. */
export function useCardSectionActivity(active: boolean) {
  const section = useContext(SectionContext);
  useEffect(() => {
    if (active) return section?.activate();
  }, [active, section]);
}

export function useCardSectionPreviouslyMounted() {
  return useContext(SectionContext)?.previouslyMounted ?? false;
}

export function useCardSectionEntranceExpired(durationMs: number) {
  const section = useContext(SectionContext);
  return Boolean(
    section && (section.previouslyMounted || Date.now() - section.entranceStartedAt >= durationMs),
  );
}

function CardSection({
  sectionKey,
  seen,
  onActiveChange,
  children,
  entranceStartedAt,
  entranceWindowMs,
}: {
  sectionKey: string;
  seen: Set<string>;
  onActiveChange: (key: string, active: boolean) => void;
  children: (previouslyMounted: boolean) => ReactNode;
  entranceStartedAt: number;
  entranceWindowMs: number;
}) {
  const inheritedEntrance = useCardSectionPreviouslyMounted();
  const [previouslyMounted] = useState(
    () =>
      inheritedEntrance ||
      seen.has(sectionKey) ||
      Date.now() - entranceStartedAt >= entranceWindowMs,
  );
  const [activeCount, setActiveCount] = useState(0);
  const active = activeCount > 0;
  useCardSectionActivity(active);
  const activate = useCallback(() => {
    setActiveCount((count) => count + 1);
    return () => setActiveCount((count) => count - 1);
  }, []);
  const context = useMemo(
    () => ({ activate, previouslyMounted, entranceStartedAt }),
    [activate, previouslyMounted, entranceStartedAt],
  );
  useEffect(() => {
    seen.add(sectionKey);
  }, [seen, sectionKey]);
  useEffect(() => {
    onActiveChange(sectionKey, active);
    return () => onActiveChange(sectionKey, false);
  }, [onActiveChange, sectionKey, active]);
  return (
    <SectionContext.Provider value={context}>{children(previouslyMounted)}</SectionContext.Provider>
  );
}

/** Window whole sections as well as their rows: many small image groups must not
 * mount every thumbnail merely because each group is below the row threshold. */
export function CardSections<T>({
  sections,
  cardCount,
  sectionKey,
  children,
  entranceWindowMs = 420,
}: {
  sections: T[];
  cardCount: number;
  sectionKey: (section: T) => string;
  children: (section: T, index: number, previouslyMounted: boolean) => ReactNode;
  /** Initial arrival window, including the caller's stagger and motion speed. */
  entranceWindowMs?: number;
}) {
  const parent = useContext(SectionContext);
  // The clock belongs to the whole list, rather than a virtual child. Nested
  // groups inherit it so first scrolling to an unseen group cannot restart entry.
  const [entranceStartedAt] = useState(() => parent?.entranceStartedAt ?? Date.now());
  const enabled = cardCount > 20 && sections.length > 1;
  const seen = useRef(new Set<string>());
  const [pinned, setPinned] = useState(new Set<string>());
  const setActive = useCallback((key: string, active: boolean) => {
    setPinned((previous) => {
      if (previous.has(key) === active) return previous;
      const next = new Set(previous);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const { totalHeight, virtualItems, measureRef, containerRef } = useVirtualList({
    itemCount: sections.length,
    estimateSize: 64 + (cardCount / Math.max(1, sections.length)) * 104,
    overscan: 1,
    enabled,
    pinnedIndices: sections.flatMap((section, index) =>
      pinned.has(sectionKey(section)) ? [index] : [],
    ),
  });
  const renderSection = (section: T, index: number) => (
    <CardSection
      sectionKey={sectionKey(section)}
      seen={seen.current}
      onActiveChange={setActive}
      entranceStartedAt={entranceStartedAt}
      entranceWindowMs={entranceWindowMs}
    >
      {(previouslyMounted) => children(section, index, previouslyMounted)}
    </CardSection>
  );
  const items = enabled ? virtualItems : sections.map((_, index) => ({ index, start: 0 }));
  return (
    <div
      ref={containerRef}
      className={enabled ? 'relative' : undefined}
      style={enabled ? { height: totalHeight } : undefined}
    >
      {items.map(({ index, start }) => (
        <div
          key={sectionKey(sections[index])}
          ref={enabled ? measureRef(index) : undefined}
          className={enabled ? 'absolute left-0 top-0 w-full' : undefined}
          style={enabled ? { top: start } : undefined}
        >
          {renderSection(sections[index], index)}
        </div>
      ))}
    </div>
  );
}
