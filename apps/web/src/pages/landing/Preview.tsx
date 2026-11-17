import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import './preview.css';

const thumbnails = import.meta.glob<string>('./editions/thumbnails/*.webp', {
  eager: true,
  import: 'default',
});

const editions = {
  almanac: lazy(() => import('./editions/Almanac').then((m) => ({ default: m.Landing }))),
  specimen: lazy(() => import('./editions/Specimen').then((m) => ({ default: m.Landing }))),
  soundings: lazy(() => import('./editions/Soundings').then((m) => ({ default: m.Landing }))),
  marginalia: lazy(() => import('./editions/Marginalia').then((m) => ({ default: m.Landing }))),
  interval: lazy(() => import('./editions/Interval').then((m) => ({ default: m.Landing }))),
};

export default function Preview() {
  const [params] = useSearchParams();
  const name = params.get('edition');
  if (name && Object.hasOwn(editions, name)) {
    const Page = editions[name as keyof typeof editions];
    return (
      <Suspense fallback={<p role="status">Opening preview…</p>}>
        <Page />
      </Suspense>
    );
  }
  return (
    <main className="edition-gallery">
      <h1>Lacuna landing studies</h1>
      <ul>
        {Object.keys(editions).map((name) => (
          <li key={name}>
            <Link to={`?edition=${name}`}>
              <img
                alt=""
                width="720"
                height="480"
                src={thumbnails[`./editions/thumbnails/${name}.webp`]}
              />
              <span>{name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
