/**
 * Small deterministic random source pinned by tests. It is not cryptographic and must never be
 * used for identifiers; its job is byte-stable content selection across supported clients.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: string) {
    let state = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      state ^= seed.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    this.state = state >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(maximumExclusive: number): number {
    if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
      throw new RangeError('maximumExclusive must be a positive safe integer.');
    }
    return Math.floor(this.next() * maximumExclusive);
  }
}
