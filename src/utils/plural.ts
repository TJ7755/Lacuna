/** "1 card", "2 cards", "5,002 cards": a count with its regular English plural. */
export function countOf(count: number, noun: string): string {
  return `${count.toLocaleString('en-GB')} ${noun}${count === 1 ? '' : 's'}`;
}
