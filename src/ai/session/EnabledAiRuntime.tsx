import { useEffect, useState } from 'react';
import { readAiSettings } from '../settings';
import { buildAiInstructionBundle } from '../instructions';
import { createRelayClient } from '../relayClient';
import { createRelayAiSession } from './relay';
import { createLocalAiSession } from './local';
import { createElectronLocalAiRequestSource } from './localIpc';
import { replacementLifecycle } from '../../db/replacementLifecycle';
import type { AiSession } from './types';

/**
 * Owns the optional relay runtime. Keeping this behind a dynamic import means
 * disabled AI contributes neither its transport nor its tool stack to first paint.
 */
export function EnabledAiRuntime({
  onSessionChange,
}: {
  onSessionChange: (session: AiSession | null) => void;
}) {
  const [session] = useState(() =>
    window.electronAPI?.isElectron
      ? createLocalAiSession({
          source: createElectronLocalAiRequestSource(),
          getInstructions: () => buildAiInstructionBundle(readAiSettings()),
        })
      : createRelayAiSession({
          relay: createRelayClient(),
          getInstructions: () => buildAiInstructionBundle(readAiSettings()),
        }),
  );

  useEffect(() => {
    const unregister = replacementLifecycle.register(session.replacementParticipant);
    onSessionChange(session);
    session.activate();
    return () => {
      onSessionChange(null);
      unregister();
      session.dispose();
    };
  }, [onSessionChange, session]);

  return null;
}
