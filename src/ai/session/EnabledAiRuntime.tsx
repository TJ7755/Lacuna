import { useEffect, useState, type ReactNode } from 'react';
import { readAiSettings } from '../settings';
import { buildAiInstructionBundle } from '../instructions';
import { createRelayClient } from '../relayClient';
import { AiSessionProvider } from './AiSessionContext';
import { createRelayAiSession } from './relay';
import { replacementLifecycle } from '../../db/replacementLifecycle';

/**
 * Owns the optional relay runtime. Keeping this behind a dynamic import means
 * disabled AI contributes neither its transport nor its tool stack to first paint.
 */
export function EnabledAiRuntime({ children }: { children: ReactNode }) {
  const [session] = useState(() =>
    createRelayAiSession({
      relay: createRelayClient(),
      getInstructions: () => buildAiInstructionBundle(readAiSettings()),
    }),
  );

  useEffect(() => {
    const unregister = replacementLifecycle.register(session.replacementParticipant);
    session.activate();
    return () => {
      unregister();
      session.dispose();
    };
  }, [session]);

  return <AiSessionProvider session={session}>{children}</AiSessionProvider>;
}
