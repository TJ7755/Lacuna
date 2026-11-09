export interface ImportedMediaRef {
  url: string;
  kind: 'image' | 'audio';
}

export function replaceMediaRefs(text: string, mediaMap: Map<string, ImportedMediaRef>): string {
  if (mediaMap.size === 0) return text;
  const plainNames = [...mediaMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const structured =
    /\[sound:(?<audio>[^\]]+)\]|<img\s+[^>]*src=["'](?<image>[^"']+)["'][^>]*>|!\[(?<alt>[^\]]*)\]\((?<markdown>[^)]+)\)/;
  const otherMarkup = /\[[^\]]*\]\([^)]+\)|\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>()]+/;
  const word = '\\p{L}\\p{N}\\p{M}_';
  const plain = `(?<![${word}./\\\\-])(?<filename>${plainNames})(?![${word}/\\\\-]|\\.[${word}])`;
  const references = new RegExp(`${structured.source}|${otherMarkup.source}|${plain}`, 'giu');
  return text.replace(references, (match, ...parts) => {
    const { audio, image, alt, markdown, filename } = parts.at(-1);
    const media = mediaMap.get(audio ?? image ?? markdown ?? filename);
    if (
      !media ||
      (audio && media.kind !== 'audio') ||
      ((image || markdown) && media.kind !== 'image')
    ) {
      return match;
    }
    return `![${alt ?? media.kind}](${media.url})`;
  });
}

export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    webm: 'audio/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}
