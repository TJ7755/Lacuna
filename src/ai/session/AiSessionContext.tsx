import { createContext, useContext, type ReactNode } from 'react';
import type { AiSession } from './types';

const AiSessionContext = createContext<AiSession | null>(null);

export function AiSessionProvider({ session, children }: { session: AiSession; children: ReactNode }) {
  return <AiSessionContext.Provider value={session}>{children}</AiSessionContext.Provider>;
}

export function useAiSession(): AiSession {
  const session = useContext(AiSessionContext);
  if (!session) throw new Error('useAiSession must be used inside AiSessionProvider');
  return session;
}

export function useOptionalAiSession(): AiSession | null {
  return useContext(AiSessionContext);
}
