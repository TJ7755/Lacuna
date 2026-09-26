/** PROTOTYPE — throwaway. Fake data. Delete after review. */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { CheckIcon } from '../components/ui/icons';
import { cn } from '../components/ui/cn';
import type { ProtoVariant } from './sharePrototypeVariant';
import { PROTO_VARIANTS, PREV_VARIANT, NEXT_VARIANT } from './sharePrototypeVariant';

export function ProtoBar({ variant }: { variant: ProtoVariant }) {
  const navigate = useNavigate();
  // The switcher is prototype chrome, never production UI.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') void navigate(`/share-prototype?variant=${PREV_VARIANT[variant]}`);
      if (event.key === 'ArrowRight') void navigate(`/share-prototype?variant=${NEXT_VARIANT[variant]}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, variant]);
  if (!import.meta.env.DEV) return null;
  return (
    <nav
      aria-label="Prototype variants"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border border-line-strong bg-ink px-2 py-1 text-paper shadow-2xl"
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => void navigate(`/share-prototype?variant=${PREV_VARIANT[variant]}`)}
        className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none hover:bg-paper/15"
      >
        ←
      </button>
      <span className="px-2 text-sm font-semibold tabular-nums">
        {variant.toUpperCase()} · {PROTO_VARIANTS[variant]}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => void navigate(`/share-prototype?variant=${NEXT_VARIANT[variant]}`)}
        className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none hover:bg-paper/15"
      >
        →
      </button>
    </nav>
  );
}

export function FakeCourses({ selected }: { selected: string }) {
  return (
    <div className="flex flex-col gap-2">
      {['Biology', 'Welcome to Lacuna'].map((name) => {
        const on = name === selected;
        return (
          <span
            key={name}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm',
              on ? 'border-accent bg-accent-soft/50' : 'border-line bg-surface',
            )}
          >
            <span
              className={cn(
                'grid h-5 w-5 place-items-center rounded-md border',
                on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
              )}
            >
              {on && <CheckIcon width={13} height={13} />}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">{name}</span>
              <span className="block text-xs text-ink-faint">32 cards · 5 lessons</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function FakeMediaNotice() {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4 text-sm leading-6 text-ink-soft">
      This course contains media in 32 cards. The share code cannot carry the files.
      <ul className="ml-4 mt-2 list-disc text-xs text-ink-faint">
        <li>Label 10 of 10 — Circulation</li>
        <li>Label 2 of 14 — Heart diagram</li>
      </ul>
    </div>
  );
}

export function FakeLinkCard() {
  return (
    <div className="rounded-xl border border-line-strong bg-surface-raised p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-ink-faint">Share link · rev 1</span>
        <Button size="sm" variant="secondary">Copy</Button>
      </div>
      <p className="break-all rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink-soft">
        https://lacuna-beta-one.vercel.app/#/s/8421704ec372887eb695cc1ad195cffd
      </p>
    </div>
  );
}
