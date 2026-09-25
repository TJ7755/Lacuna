import { useEffect, useState } from 'react';
import { guessMimeType, replaceMediaRefs, type ImportedMediaRef } from '../../db/apkgMedia';
import type { ParsedCard } from '../../db/import';

/** Package media stays in memory until confirmation; each review owns its temporary URLs. */
export function useImportPreviewMedia(media?: Map<string, Uint8Array>) {
  const [resolved, setResolved] = useState<{
    source: typeof media;
    refs: Map<string, ImportedMediaRef>;
  }>();

  useEffect(() => {
    const refs = new Map<string, ImportedMediaRef>();
    for (const [filename, bytes] of media ?? []) {
      const mime = guessMimeType(filename);
      const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : null;
      if (!kind) continue;
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      refs.set(filename, { url, kind });
    }
    setResolved({ source: media, refs });
    return () => {
      for (const { url } of refs.values()) URL.revokeObjectURL(url);
    };
  }, [media]);

  return (card: ParsedCard): ParsedCard => {
    if (!resolved || resolved.source !== media || resolved.refs.size === 0) return card;
    return {
      ...card,
      front: replaceMediaRefs(card.front, resolved.refs),
      back: replaceMediaRefs(card.back, resolved.refs),
    };
  };
}
