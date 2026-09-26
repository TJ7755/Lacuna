/** PROTOTYPE — throwaway variant param helper. Delete with prototype. */
import { useSearchParams } from 'react-router-dom';

export type ProtoVariant = 'a' | 'b' | 'c';

export const PROTO_VARIANTS: Record<ProtoVariant, string> = {
  a: 'Export only',
  b: 'Tabs',
  c: 'Collapsed',
};

const ORDER: ProtoVariant[] = ['a', 'b', 'c'];

function neighbour(variant: ProtoVariant, delta: 1 | -1): ProtoVariant {
  const index = ORDER.indexOf(variant);
  return ORDER[(index + delta + ORDER.length) % ORDER.length]!;
}

export const PREV_VARIANT: Record<ProtoVariant, ProtoVariant> = {
  a: neighbour('a', -1),
  b: neighbour('b', -1),
  c: neighbour('c', -1),
};

export const NEXT_VARIANT: Record<ProtoVariant, ProtoVariant> = {
  a: neighbour('a', 1),
  b: neighbour('b', 1),
  c: neighbour('c', 1),
};

export function useProtoVariant(): ProtoVariant {
  const [params] = useSearchParams();
  const raw = params.get('variant');
  return raw === 'b' ? 'b' : raw === 'c' ? 'c' : 'a';
}
