import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Storage } from 'happy-dom';
import '@testing-library/jest-dom/vitest';

// Node 25 can install an unusable localStorage shim before Happy DOM starts.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  enumerable: true,
  value: new Storage(),
  writable: true,
});

// Ensure React testing library cleans up the DOM after each test.
afterEach(() => cleanup());

// Tell React we're in a test environment so act() warnings are suppressed.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
