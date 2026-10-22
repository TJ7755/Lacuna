export function gapsClassUrl(shareId?: string): string {
  const origin = 'https://gaps.getlacuna.app';
  return shareId ? `${origin}/#course=${shareId}` : origin;
}
