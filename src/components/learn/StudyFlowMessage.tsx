import { Button } from '../ui/Button';

export function StudyFlowMessage({
  title,
  detail,
  onExit,
}: {
  title: string;
  detail: string;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-paper pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.5rem))] pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))]">
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">Course study</p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 text-ink-soft">{detail}</p>
        <div className="mt-8">
          <Button variant="primary" size="lg" onClick={onExit}>
            Done
          </Button>
        </div>
      </main>
    </div>
  );
}

