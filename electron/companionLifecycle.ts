interface ShutdownHandle {
  close: () => Promise<void>;
}

interface EventSource<Event extends string> {
  once: (event: Event, listener: () => void) => unknown;
}

interface CompanionProcessShutdownDependencies {
  handle: ShutdownHandle;
  stdin: EventSource<'end' | 'error'>;
  signals: EventSource<'SIGINT' | 'SIGTERM'>;
  quit: () => void;
}

interface BeforeQuitEvent {
  preventDefault: () => void;
}

interface ApplicationShutdownDependencies {
  stop: () => Promise<void>;
  quit: () => void;
}

function settleThenQuit(operation: () => Promise<void>, quit: () => void): void {
  try {
    void operation().then(quit, quit);
  } catch {
    quit();
  }
}

export function registerCompanionProcessShutdown({
  handle,
  stdin,
  signals,
  quit,
}: CompanionProcessShutdownDependencies): void {
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    settleThenQuit(() => handle.close(), quit);
  };

  stdin.once('end', close);
  stdin.once('error', close);
  signals.once('SIGINT', close);
  signals.once('SIGTERM', close);
}

export function createApplicationShutdownHandler({
  stop,
  quit,
}: ApplicationShutdownDependencies): (event: BeforeQuitEvent) => void {
  let shutdownComplete = false;
  let shutdownStarted = false;

  return (event): void => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;

    shutdownStarted = true;
    settleThenQuit(stop, () => {
      shutdownComplete = true;
      quit();
    });
  };
}
