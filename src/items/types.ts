/** One scored line in a deterministic working mark scheme. */
export type MarkSchemeLine =
  | { marks: number; label?: string; kind: 'waypoint'; expression: string }
  | {
      marks: number;
      label?: string;
      kind: 'predicate';
      predicate: 'equals' | 'within' | 'matches-one-of' | 'contains';
      args?: string[];
    };

/** A machine-checkable scalar answer. */
export type NumericAnswerSpec =
  | { kind: 'exact'; value: string }
  | { kind: 'within'; value: string; tolerance: number }
  | { kind: 'matches-one-of'; values: string[] };

/** A pinned authoring fixture that travels with its answer specification. */
export interface ItemFixture {
  id: string;
  studentAnswer: string | string[];
  expectedMarks: number;
  note?: string;
}

export const CURRENT_ITEM_PAYLOAD_VERSION = 1 as const;

/** The canonical numeric/working payload owned by Questions mode. */
export type QuestionPayload =
  | {
      v: typeof CURRENT_ITEM_PAYLOAD_VERSION;
      kind: 'numeric';
      answer: NumericAnswerSpec;
      fixtures?: ItemFixture[];
    }
  | {
      v: typeof CURRENT_ITEM_PAYLOAD_VERSION;
      kind: 'working';
      scheme: MarkSchemeLine[];
      fixtures?: ItemFixture[];
    };

/** Compatibility shape accepted only on legacy Cards and import boundaries. */
export type ItemPayload =
  | QuestionPayload
  | {
      v: typeof CURRENT_ITEM_PAYLOAD_VERSION;
      kind: 'scaffold';
    };
