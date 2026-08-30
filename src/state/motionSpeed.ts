import { useSyncExternalStore } from 'react';

export type MotionSpeed = 'slow' | 'normal' | 'fast';

const KEY = 'lacuna.motionSpeed';

const MULTIPLIERS: Record<MotionSpeed, number> = {
  slow: 1.4,
  normal: 1.0,
  fast: 0.6,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function readMotionSpeed(): MotionSpeed {
  const raw = localStorage.getItem(KEY) as MotionSpeed | null;
  return raw === 'slow' || raw === 'fast' ? raw : 'normal';
}

export function writeMotionSpeed(speed: MotionSpeed): void {
  localStorage.setItem(KEY, speed);
  window.dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: speed }));
}

export function speedMultiplier(speed?: MotionSpeed): number {
  if (prefersReducedMotion()) return 0;
  return MULTIPLIERS[speed ?? readMotionSpeed()];
}

/** Read the current motion multiplier directly from localStorage (for class components / pre-provider). */
export function getMotionMultiplier(): number {
  try {
    return speedMultiplier();
  } catch {
    return 1;
  }
}

const subscribers = new Set<() => void>();
let stopListening: (() => void) | null = null;

function motionSnapshot(): string {
  return `${readMotionSpeed()}:${prefersReducedMotion() ? 'reduce' : 'animate'}`;
}

function emitMotionChange() {
  subscribers.forEach((subscriber) => subscriber());
}

function startListening() {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('storage', emitMotionChange);
  window.addEventListener('lacuna:motion-speed', emitMotionChange);
  media.addEventListener('change', emitMotionChange);
  stopListening = () => {
    window.removeEventListener('storage', emitMotionChange);
    window.removeEventListener('lacuna:motion-speed', emitMotionChange);
    media.removeEventListener('change', emitMotionChange);
    stopListening = null;
  };
}

function subscribeMotion(subscriber: () => void) {
  subscribers.add(subscriber);
  if (subscribers.size === 1) startListening();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) stopListening?.();
  };
}

export function useMotionSpeed(): [MotionSpeed, (speed: MotionSpeed) => void] {
  const snapshot = useSyncExternalStore(subscribeMotion, motionSnapshot, () => 'normal:animate');
  const speed = snapshot.split(':', 1)[0] as MotionSpeed;
  return [speed, writeMotionSpeed];
}
