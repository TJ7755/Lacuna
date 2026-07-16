import { useEffect, useRef, useState } from 'react';

/** Dashboard-style cubic count-up, scaled by the app's motion preference. */
export function useCountUp(
  target: number,
  durationMs = 1200,
  delayMs = 0,
  motionMultiplier = 1,
): number {
  const [value, setValue] = useState(() => (motionMultiplier === 0 ? target : 0));
  const raf = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (motionMultiplier === 0) {
      setValue(target);
      return;
    }

    setValue(0);
    startTime.current = null;
    const delayId = window.setTimeout(() => {
      const tick = (now: number) => {
        if (startTime.current === null) startTime.current = now;
        const elapsed = now - startTime.current;
        const progress = Math.min(elapsed / (durationMs * motionMultiplier), 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = Math.round(eased * target);
        setValue((previous) => (next !== previous ? next : previous));
        if (progress < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, delayMs * motionMultiplier);

    return () => {
      window.clearTimeout(delayId);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs, delayMs, motionMultiplier]);

  return value;
}
