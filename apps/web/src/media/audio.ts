import { assetUrl } from '../db/assets';

const AUDIO_EMBED_RE = /!\[audio\]\(lacuna-asset:\/\/([a-f0-9]{64})\)/i;

export interface AudioCardFront {
  prompt: string;
  assetHash: string;
}

export function parseAudioCardFront(front: string): AudioCardFront | null {
  const match = AUDIO_EMBED_RE.exec(front);
  if (!match) return null;
  return {
    prompt: front.replace(match[0], '').trim(),
    assetHash: match[1].toLowerCase(),
  };
}

export function buildAudioCardFront(prompt: string, assetHash: string): string {
  const embed = `![audio](${assetUrl(assetHash)})`;
  return prompt.trim() ? `${prompt.trim()}\n\n${embed}` : embed;
}

export function isAudioCardFront(front: string): boolean {
  return AUDIO_EMBED_RE.test(front);
}
