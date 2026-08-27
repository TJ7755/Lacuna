import { createContext, useContext, type ReactNode } from 'react';
import type { AiSession } from './types';

const AiSessionContext = createContext<AiSession | null>(null);

export function AiSessionProvider({ session, children }: { session: AiSession; children: ReactNode }) {
  return <AiSessionContext.Provider value={session}>{children}</AiSessionContext.Provider>;
}

export function useOptionalAiSession(): AiSession | null {
  return useContext(AiSessionContext);
}
