export function questionSetReturn(state: unknown, courseId: string) {
  if (!state || typeof state !== 'object') return undefined;
  const value = state as Record<string, unknown>;
  const path = value.questionSetReturnTo;
  const label = value.questionSetReturnLabel;
  const root = `/course/${courseId}`;
  if (typeof path !== 'string' || typeof label !== 'string') return undefined;
  if (!(path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}?`)))
    return undefined;
  if (!['Back to lesson', 'Back to exam', 'Back to Cards'].includes(label)) return undefined;
  return { questionSetReturnTo: path, questionSetReturnLabel: label };
}
