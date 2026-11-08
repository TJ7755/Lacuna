export interface ImportedMediaRef {
  url: string;
  kind: 'image' | 'audio';
}

export function replaceMediaRefs(text: string, mediaMap: Map<string, ImportedMediaRef>): string {
  let result = text;
  // Anki's native audio marker.
  result = result.replace(/\[sound:([^\]]+)\]/gi, (match, filename) => {
    const media = mediaMap.get(filename);
    if (!media || media.kind !== 'audio') return match;
    return `![audio](${media.url})`;
  });
  // HTML img tags: <img src="filename.jpg">
  const imgRe = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  result = result.replace(imgRe, (match, src) => {
    const media = mediaMap.get(src);
    if (!media || media.kind !== 'image') return match;
    return `![image](${media.url})`;
  });
  // Markdown image syntax: ![alt](filename.jpg)
  const mdImgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  result = result.replace(mdImgRe, (match, alt, src) => {
    const media = mediaMap.get(src);
    if (!media || media.kind !== 'image') return match;
    return `![${alt}](${media.url})`;
  });
  // Plain text references like filename.jpg (fallback for filenames embedded in text).
  // Replace longest names first so `a.png` cannot corrupt `aa.png`, and only when the
  // name stands alone rather than inside a longer token.
  const plainNames = [...mediaMap.keys()].sort((a, b) => b.length - a.length);
  for (const filename of plainNames) {
    const media = mediaMap.get(filename)!;
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plainRe = new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g');
    result = result.replace(
      plainRe,
      media.kind === 'audio' ? `![audio](${media.url})` : `![image](${media.url})`,
    );
  }
  return result;
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
