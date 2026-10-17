import { createContext } from 'react';
import type { MotionValue } from 'motion/react';

// Each retained presentation owns its position, including during the persistence hand-off.
export const StudyCardMotionContext = createContext<MotionValue<number> | null>(null);
