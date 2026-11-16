import type { CardType, ItemFixture, ItemPayload, NumericAnswerSpec } from '@lacuna/core/db/types';
import { hasCloze } from '../utils/cloze';
import type { MarkSchemeCompileResult } from './markSchemeCompiler';
import { numericAnswerSpecIsValid } from './numericAnswerSpec';

type AuthoringType = CardType | 'numeric' | 'working' | 'audio';

export function validateCardContent({
  type,
  front,
  back,
  numericAnswer,
  workingCompilation,
}: {
  type: AuthoringType;
  front: string;
  back: string;
  numericAnswer: NumericAnswerSpec;
  workingCompilation: MarkSchemeCompileResult;
}) {
  const isStructured = type === 'numeric' || type === 'working';
  return {
    frontValid: front.trim().length > 0,
    backValid: type === 'cloze' || isStructured || back.trim().length > 0,
    clozeValid: type !== 'cloze' || hasCloze(front),
    numericValid: type !== 'numeric' || numericAnswerSpecIsValid(numericAnswer),
    workingValid:
      type !== 'working' ||
      (workingCompilation.lines.length > 0 &&
        workingCompilation.lines.every((line) => line.kind === 'compiled')),
    backValue: type === 'cloze' || isStructured ? '' : back,
  };
}

type StructuredAuthoring =
  | { kind: 'numeric'; answer: NumericAnswerSpec; fixtures?: ItemFixture[] }
  | { kind: 'working'; compilation: MarkSchemeCompileResult; fixtures?: ItemFixture[] };

/** Drafts retain compiled lines even while other source lines are invalid. */
export function buildStructuredCardPayload(
  input: StructuredAuthoring | undefined,
): ItemPayload | undefined {
  if (!input) return undefined;
  const fixtures = input.fixtures ? { fixtures: input.fixtures } : {};
  return input.kind === 'numeric'
    ? { v: 1, kind: 'numeric', answer: input.answer, ...fixtures }
    : {
        v: 1,
        kind: 'working',
        scheme: input.compilation.lines.flatMap((line) =>
          line.kind === 'compiled' ? [line.value] : [],
        ),
        ...fixtures,
      };
}
