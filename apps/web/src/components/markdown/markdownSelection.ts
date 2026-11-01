import type { ReactNode } from 'react';

export type ToolbarAction = {
  label: ReactNode;
  title: string;
  /** Letter pressed with Cmd/Ctrl inside the editor. */
  shortcut?: string;
  apply: (sel: Selection) => Replacement;
};

export interface Selection {
  before: string;
  selected: string;
  after: string;
  full: string;
}

export interface Replacement {
  text: string;
  /** Caret/selection offsets within the new full text. */
  selStart: number;
  selEnd: number;
}

/** Wrap the selection with the given prefix/suffix, or insert a placeholder if empty. */
export function wrap(
  sel: Selection,
  prefix: string,
  suffix: string,
  placeholder: string,
): Replacement {
  const inner = sel.selected || placeholder;
  const text = sel.before + prefix + inner + suffix + sel.after;
  const selStart = sel.before.length + prefix.length;
  return { text, selStart, selEnd: selStart + inner.length };
}

/** Insert a line-prefixed block (heading, list item) at the start of the selection's line. */
export function linePrefix(sel: Selection, prefix: string, placeholder: string): Replacement {
  const inner = sel.selected || placeholder;
  const needsBreak = sel.before.length > 0 && !sel.before.endsWith('\n');
  const lead = needsBreak ? '\n' : '';
  const text = sel.before + lead + prefix + inner + sel.after;
  const selStart = sel.before.length + lead.length + prefix.length;
  return { text, selStart, selEnd: selStart + inner.length };
}
