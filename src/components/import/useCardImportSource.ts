import { useEffect, useMemo, useRef, useState } from 'react';
import { parseImportAuto, detectFormat, type ImportFormat } from '../../db/importEngine';
import { parseApkg, type ApkgImportResult } from '../../db/apkgImport';
import { MAX_IMPORT_CHARS } from '../../db/cardImport';

export function useCardImportSource() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ImportFormat | ''>('');
  const [apkg, setApkg] = useState<ApkgImportResult | null>(null);
  const [filename, setFilename] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const detected = useMemo(
    () => (text.length <= MAX_IMPORT_CHARS ? detectFormat(text).format : 'unknown'),
    [text],
  );
  const result = useMemo(
    () =>
      text.length <= MAX_IMPORT_CHARS
        ? parseImportAuto(text, format ? { format } : {})
        : { cards: [], skipped: 0 },
    [text, format],
  );
  function changeText(value: string) {
    request.current++;
    setReading(false);
    setError('');
    setApkg(null);
    setFilename('');
    setText(value);
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const token = ++request.current;
    setReading(true);
    setError('');
    try {
      if (/\.apkg$/i.test(file.name)) {
        const next = await parseApkg(file, { importScheduling: true });
        if (token !== request.current) return;
        setApkg(next);
        setText('');
      } else {
        if (file.size > MAX_IMPORT_CHARS * 4)
          throw new Error('This text file is too large. Import a smaller batch.');
        const next = await file.text();
        if (token !== request.current) return;
        if (next.length > MAX_IMPORT_CHARS)
          throw new Error(
            `Use at most ${MAX_IMPORT_CHARS.toLocaleString()} characters per import.`,
          );
        setText(next);
        setApkg(null);
      }
      setFilename(file.name);
      setFormat('');
    } catch (err) {
      if (token === request.current)
        setError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      if (token === request.current) setReading(false);
    }
  }
  return {
    text,
    changeText,
    format,
    setFormat,
    apkg,
    filename,
    reading,
    readFile,
    error:
      text.length > MAX_IMPORT_CHARS
        ? `Use at most ${MAX_IMPORT_CHARS.toLocaleString()} characters per import.`
        : error,
    detected,
    result,
  };
}
