import { useEffect, useState } from 'react';
import { readAiSettings } from '../settings';
import { buildAiInstructionBundle } from '../instructions';
import { createRelayClient } from '../relayClient';
import { createRelayAiSession } from './relay';
import { createLocalAiSession } from './local';
import { createElectronLocalAiRequestSource } from './localIpc';
import { replacementLifecycle } from '../../db/replacementLifecycle';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import type { AiSession } from './types';
import { isElectronRuntime } from '../../electron/runtime';

export interface EnabledAiSession extends AiSession {
  readonly replacementParticipant: ReplacementParticipant;
}

/**
 * Binds the optional AI runtime to its active transport listener. Keeping this behind a dynamic
 * import means disabled AI contributes neither its transport nor its tool stack to first paint.
 */
export function EnabledAiRuntime({
  retainedSession,
  onSessionReady,
}: {
  retainedSession: EnabledAiSession | null;
  onSessionReady: (session: EnabledAiSession) => void;
}) {
  const [session] = useState(
    () =>
      retainedSession ??
      (isElectronRuntime()
        ? createLocalAiSession({
            source: createElectronLocalAiRequestSource(),
            getInstructions: () => buildAiInstructionBundle(readAiSettings()),
          })
        : createRelayAiSession({
            relay: createRelayClient(),
            getInstructions: () => buildAiInstructionBundle(readAiSettings()),
          })),
  );

  useEffect(() => {
    const unregister = replacementLifecycle.register(session.replacementParticipant);
    onSessionReady(session);
    session.activate();
    return () => {
      unregister();
    };
  }, [onSessionReady, session]);

  return null;
}
