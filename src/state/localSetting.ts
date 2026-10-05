import { useCallback, useEffect, useState } from 'react';

// Device-local preferences share one shape: a localStorage value, a window event
// that tells other hooks in this tab it changed, and the `storage` event for other
// tabs. Storage keys use `lacuna.<camelCaseName>` and events `lacuna:<kebab-name>`.
// Older keys outside that convention (`lacuna-shortcut-bindings`,
// `lacuna-font-scale`) keep their names: renaming a key resets live users' choice.

export interface LocalSettingOptions<T> {
  key: string;
  event: string;
  /** Decode the stored string (null when absent); the result must be a valid value. */
  parse: (raw: string | null) => T;
  /** Encode a value for storage. Defaults to `String(value)`. */
  serialise?: (value: T) => string;
}

export interface LocalSetting<T> {
  readonly key: string;
  readonly event: string;
  read(): T;
  write(value: T): void;
  /** Call `onChange` whenever this setting changes in this tab or another. */
  subscribe(onChange: () => void): () => void;
  use(): [T, (value: T) => void];
}

export function createLocalSetting<T>({
  key,
  event,
  parse,
  serialise = String,
}: LocalSettingOptions<T>): LocalSetting<T> {
  const read = () => parse(localStorage.getItem(key));
  const write = (value: T) => {
    localStorage.setItem(key, serialise(value));
    window.dispatchEvent(new CustomEvent(event, { detail: value }));
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(event, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(event, onChange);
    };
  };
  function use(): [T, (value: T) => void] {
    const [value, setValue] = useState(read);
    useEffect(() => subscribe(() => setValue(read())), []);
    const set = useCallback((next: T) => {
      write(next);
      setValue(read());
    }, []);
    return [value, set];
  }
  return { key, event, read, write, subscribe, use };
}

/** Parse stored JSON, returning `fallback()` when it is absent or malformed. */
export function parseJson<T>(
  raw: string | null,
  fallback: () => T,
  decode: (value: unknown) => T,
): T {
  if (raw === null) return fallback();
  try {
    return decode(JSON.parse(raw));
  } catch {
    return fallback();
  }
}

/** A string-union parser: the stored value when it is one of `values`, else `fallback`. */
export function oneOf<T extends string>(values: readonly T[], fallback: T) {
  return (raw: string | null): T =>
    raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
