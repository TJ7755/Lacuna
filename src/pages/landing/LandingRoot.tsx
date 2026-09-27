import { LazyMotion, domAnimation } from 'motion/react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Landing } from '../Landing';
import { LandingTransition } from '../../components/layout/LandingTransition';

/**
 * The standalone landing tree served at `/`. Both the build-time prerender
 * (entry-server) and the browser hydration (entry-client) use this component
 * so crawlers and visitors see the same markup. It deliberately skips app
 * initialisation: no database, seed or service worker. Any navigation into an
 * in-app hash route hands over to the full study app (see entry-client).
 */
export function LandingRoot() {
  return (
    <LazyMotion features={domAnimation}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
        </Routes>
        {/* The call-to-action transition lives here (rather than in App) so the
            landing entry can complete its cover animation before handing over. */}
        <LandingTransition />
      </HashRouter>
    </LazyMotion>
  );
}
