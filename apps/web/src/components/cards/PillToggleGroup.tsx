import type { ComponentProps } from 'react';
import { SegmentedPills, type SegmentedOption } from '../ui/SegmentedPills';

export type PillToggleOption<T extends string> = SegmentedOption<T>;

/** Pressed-button variant of the shared responsive pill track. */
export function PillToggleGroup<T extends string>(
  props: Omit<ComponentProps<typeof SegmentedPills<T>>, 'semantics'>,
) {
  return <SegmentedPills {...props} semantics="pressed" />;
}
