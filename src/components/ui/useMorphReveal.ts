import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  animationFinished,
  morphFrame,
  morphKeyframes,
  morphProgress,
  type MorphRect,
} from './morphReveal';

interface RevealOptions {
  surface: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  header?: RefObject<HTMLElement | null>;
  depth?: RefObject<HTMLElement | null>;
  origin: MorphRect;
  bounds: MorphRect;
  open: boolean;
  multiplier: number;
  finalRadius?: number;
  onComplete?: () => void;
}

export function useMorphReveal({
  surface,
  content,
  header,
  depth,
  origin,
  bounds,
  open,
  multiplier,
  finalRadius = 24,
  onComplete,
}: RevealOptions) {
  const playback = useRef<{
    animation?: Animation;
    sample: (time: number) => { x: number; y: number };
    open?: boolean;
    elapsed?: number;
    startedAt?: number;
    origin?: MorphRect;
    bounds?: MorphRect;
  }>({ sample: () => ({ x: 0, y: 0 }) });
  const animations = useRef<Animation[]>([]);
  const contentAnimations = useRef<Animation[]>([]);
  const contentPhase = useRef<{ element: HTMLElement | null; open: boolean } | null>(null);
  const { left: originLeft, top: originTop, width: originWidth, height: originHeight } = origin;
  const { left: boundsLeft, top: boundsTop, width: boundsWidth, height: boundsHeight } = bounds;
  const complete = useRef(onComplete);
  useLayoutEffect(() => {
    complete.current = onComplete;
  });
  useLayoutEffect(() => {
    const origin = { left: originLeft, top: originTop, width: originWidth, height: originHeight };
    const bounds = { left: boundsLeft, top: boundsTop, width: boundsWidth, height: boundsHeight };
    const element = surface.current;
    if (!element) return;
    const animated = multiplier > 0 && typeof element.animate === 'function';
    const previous = playback.current;
    const bodyBefore = content.current ? getComputedStyle(content.current) : null;
    const bodyOpacity = bodyBefore?.opacity ?? '0';
    const bodyTransform = bodyBefore?.transform ?? 'none';
    const time = Number(previous.animation?.currentTime ?? 0);
    let from = previous.sample(time);
    const samePhase = previous.open === open;
    const startedAt = samePhase ? (previous.startedAt ?? performance.now()) : performance.now();
    const elapsed = samePhase
      ? Math.max((previous.elapsed ?? 0) + time, performance.now() - startedAt)
      : 0;
    if (samePhase && previous.origin && previous.bounds) {
      const shown = morphFrame(previous.origin, previous.bounds, from.x, from.y, finalRadius);
      from = {
        x:
          bounds.width === origin.width
            ? +open
            : (shown.width - origin.width) / (bounds.width - origin.width),
        y:
          bounds.height === origin.height
            ? +open
            : (shown.height - origin.height) / (bounds.height - origin.height),
      };
    }
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    const reveal = morphKeyframes(
      origin,
      bounds,
      open,
      multiplier,
      from,
      finalRadius,
      origin.height,
      elapsed,
    );
    const endpoint = reveal.frames.at(-1)!.clipPath;
    element.style.clipPath = endpoint;
    element.style.borderRadius = '0px';
    element.style.willChange = multiplier > 0 ? 'clip-path' : '';
    const play = (
      target: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
      contentAnimation = false,
    ) => {
      const animation = target.animate(frames, options);
      animationFinished(animation);
      (contentAnimation ? contentAnimations.current : animations.current).push(animation);
      return animation;
    };
    const body = content.current;
    const contentChanged =
      contentPhase.current?.element !== body || contentPhase.current?.open !== open;
    if (contentChanged) {
      contentAnimations.current.forEach((animation) => animation.cancel());
      contentAnimations.current = [];
      contentPhase.current = { element: body, open };
    }
    if (body && contentChanged) {
      body.style.transformOrigin = `${origin.left - bounds.left + origin.width / 2}px ${origin.top - bounds.top + origin.height / 2 - body.offsetTop}px`;
      body.style.opacity = open ? '1' : '0';
      body.style.transform = 'none';
      if (animated) {
        play(
          body,
          open
            ? [
                ...Array.from({ length: 37 }, (_, index) => {
                  const progress = index === 36 ? 1 : morphProgress((index * 420) / 36, true, 'y');
                  return {
                    offset: index / 36,
                    opacity: Math.min(1, progress * 2),
                    transform: `scale(${0.94 + 0.06 * progress})`,
                  };
                }),
              ]
            : [
                { opacity: bodyOpacity, transform: bodyTransform },
                { opacity: 0, transform: bodyTransform },
              ],
          {
            duration: (open ? 220 : 60) * multiplier,
            easing: 'linear',
            fill: 'backwards',
          },
          true,
        );
        if (open)
          body
            .querySelectorAll('li, [data-morph-row], [role=menuitem], form > div')
            .forEach((row, index) => {
              play(
                row,
                [
                  { opacity: 0, transform: 'scale(0.98)' },
                  { opacity: 1, transform: 'none' },
                ],
                {
                  duration: 240 * multiplier,
                  delay: Math.min(index, 5) * 25 * multiplier,
                  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  fill: 'backwards',
                },
                true,
              );
            });
      }
    }
    const finish = () => {
      element.style.willChange = '';
      if (open) {
        element.style.borderRadius = `${finalRadius}px`;
        if (typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'superellipse(1.25)')) {
          element.style.setProperty('corner-shape', 'superellipse(1.25)');
          element.style.clipPath = 'none';
        }
      } else element.style.removeProperty('corner-shape');
      complete.current?.();
    };
    if (depth?.current && contentChanged) {
      const layer = depth.current;
      layer.style.opacity = open ? '1' : '0';
      if (animated)
        play(
          layer,
          [{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }],
          {
            duration: (open ? 300 : 60) * multiplier,
            fill: 'backwards',
          },
          true,
        );
    }
    if (header?.current) {
      const button = header.current;
      const frames = reveal.frames.map((frame) => {
        const { x, y } =
          frame.offset === 1
            ? { x: +open, y: +open }
            : reveal.sample((frame.offset ?? 0) * reveal.duration);
        return {
          offset: frame.offset,
          transform: `translate(${(origin.left - bounds.left - button.offsetLeft) * (1 - x)}px, ${(origin.top - bounds.top - button.offsetTop) * (1 - y)}px)`,
        };
      });
      button.style.transform = open
        ? 'none'
        : `translate(${origin.left - bounds.left - button.offsetLeft}px, ${origin.top - bounds.top - button.offsetTop}px)`;
      if (animated) play(button, frames, { duration: reveal.duration, fill: 'both' });
    }
    playback.current = { sample: reveal.sample, open, elapsed, startedAt, origin, bounds };
    if (!animated || reveal.duration === 0) {
      finish();
      return;
    }
    const animation = play(element, reveal.frames, {
      duration: reveal.duration,
      fill: 'backwards',
    });
    playback.current.animation = animation;
    animationFinished(animation, finish);
  }, [
    surface,
    content,
    header,
    depth,
    open,
    multiplier,
    originLeft,
    originTop,
    originWidth,
    originHeight,
    boundsLeft,
    boundsTop,
    boundsWidth,
    boundsHeight,
    finalRadius,
  ]);
  useLayoutEffect(
    () => () => {
      [...animations.current, ...contentAnimations.current].forEach((animation) =>
        animation.cancel(),
      );
      contentPhase.current = null;
    },
    [],
  );
}

/** Measure at the final width once, including retained content during dismissal. */
export function useInlineMorph(
  open: boolean,
  closedWidth: number,
  multiplier: number,
  align: 'start' | 'end',
  offset = 0,
  triggerHeight = 44,
  finalRadius = 24,
  panelWidth = Math.min(448, window.innerWidth - 36),
) {
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const depth = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: panelWidth, height: triggerHeight });
  useLayoutEffect(() => {
    const body = content.current;
    if (!open || !body) return;
    const measure = () => {
      const width = surface.current?.offsetWidth || panelWidth;
      const frame = surface.current ? getComputedStyle(surface.current) : null;
      const border =
        (parseFloat(frame?.borderTopWidth ?? '') || 0) +
        (parseFloat(frame?.borderBottomWidth ?? '') || 0);
      const height = Math.max(
        triggerHeight,
        Math.ceil(body.scrollHeight + body.offsetTop + border),
      );
      setSize((old) => (width === old.width && height === old.height ? old : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [open, closedWidth, panelWidth, triggerHeight]);
  const origin = {
    left: (align === 'end' ? size.width - closedWidth : 0) - offset,
    top: 0,
    width: closedWidth,
    height: triggerHeight,
  };
  useMorphReveal({
    surface,
    content,
    depth,
    origin,
    bounds: { left: 0, top: 0, ...size },
    open,
    multiplier,
    finalRadius,
  });
  return {
    surface,
    content,
    depth,
    height: size.height,
    origin,
  };
}
