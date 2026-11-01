import { createContext } from 'react';

// The router supplies intent loading without making shared links import route pages.
export const RoutePrefetchContext = createContext<(path: string) => void>(() => {});
