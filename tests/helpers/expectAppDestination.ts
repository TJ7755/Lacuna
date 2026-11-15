import { expect } from 'vitest';

/** Check the link destination exposed to the browser. */
export function expectAppDestination(link: HTMLElement, destination: string) {
  expect(link).toHaveAttribute('href', destination);
}
