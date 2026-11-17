import { fileURLToPath } from 'node:url';

const editions = ['Almanac', 'Specimen', 'Soundings', 'Marginalia', 'Interval'];

// Shared by the client build and the isolated prerender server.
export function landingEditionAlias() {
  const choice = process.env.LACUNA_LANDING;
  if (!choice) return [];
  const edition = editions.find((name) => name.toLowerCase() === choice);
  if (!edition)
    throw new Error(`Unknown LACUNA_LANDING. Choose ${editions.join(', ').toLowerCase()}.`);
  return [
    {
      find: /^(?:\.\/|\.\.\/pages\/landing\/)activeLanding$/,
      replacement: fileURLToPath(
        new URL(`../apps/web/src/pages/landing/editions/${edition}.tsx`, import.meta.url),
      ),
    },
  ];
}
