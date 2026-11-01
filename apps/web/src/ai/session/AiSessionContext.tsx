import { createContext, useContext } from 'react';
import type { AiSession } from './types';

const AiSessionContext = createContext<AiSession | null>(null);

export function useOptionalAiSession(): AiSession | null {
  return useContext(AiSessionContext);
}
