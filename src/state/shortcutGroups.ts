import { SHORTCUT_GROUPS } from './shortcuts';
import { formatBinding, type ShortcutBindings } from './shortcutBindings';

/** Resolve the shared cheatsheet against the current study bindings without writing settings. */
export function shortcutGroups(bindings: ShortcutBindings) {
  return SHORTCUT_GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.map((s) => {
      // Replace hardcoded keys with custom bindings for the Learn actions.
      const description = s.description.toLowerCase();
      if (description.includes('show this help')) {
        return { ...s, keys: [formatBinding(bindings.help)] };
      }
      if (description.includes('show the answer')) {
        return { ...s, keys: [formatBinding(bindings.reveal)] };
      }
      if (description.includes('hide the answer')) {
        return { ...s, keys: ['Down'] };
      }
      if (description.includes('mark correct') && !description.includes('manual')) {
        return { ...s, keys: [formatBinding(bindings.yes)] };
      }
      if (description.includes('mark incorrect')) {
        return { ...s, keys: [formatBinding(bindings.no)] };
      }
      if (description.includes('again')) {
        return { ...s, keys: [formatBinding(bindings.again)] };
      }
      if (description.includes('hard')) {
        return { ...s, keys: [formatBinding(bindings.hard)] };
      }
      if (description.includes('good')) {
        return { ...s, keys: [formatBinding(bindings.good)] };
      }
      if (description.includes('easy')) {
        return { ...s, keys: [formatBinding(bindings.easy)] };
      }
      if (description.includes('edit the current card')) {
        return { ...s, keys: [formatBinding(bindings.edit)] };
      }
      if (description.includes('toggle focus')) {
        return { ...s, keys: [formatBinding(bindings.focus)] };
      }
      if (description.includes('undo')) {
        return { ...s, keys: [formatBinding(bindings.undo)] };
      }
      return s;
    }),
  }));
}
