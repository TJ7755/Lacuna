import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function useStableCardHeight() {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;

    const measure = () => {
      // Layout height must not include the study card's animated entrance scale.
      const next = Math.max(front.offsetHeight, back.offsetHeight);
      if (next > 0) setHeight((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(front);
    observer.observe(back);
    return () => observer.disconnect();
  }, []);

  return { height, frontRef, backRef };
}

export function CardSizeMeasurements({
  front,
  back,
  surfaceClassName,
  frontRef,
  backRef,
}: {
  front: ReactNode;
  back: ReactNode;
  surfaceClassName: string;
  frontRef: React.RefObject<HTMLDivElement>;
  backRef: React.RefObject<HTMLDivElement>;
}) {
  const makeInert = useCallback((node: HTMLDivElement | null) => {
    node?.setAttribute('inert', '');
  }, []);

  return (
    <div
      ref={makeInert}
      aria-hidden="true"
      className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
    >
      <div
        ref={frontRef}
        data-study-sizing-face="front"
        className={'absolute inset-x-0 top-0 ' + surfaceClassName}
      >
        {front}
      </div>
      <div
        ref={backRef}
        data-study-sizing-face="back"
        className={'absolute inset-x-0 top-0 ' + surfaceClassName}
      >
        {back}
      </div>
    </div>
  );
}
