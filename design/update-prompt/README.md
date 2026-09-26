# Update prompt directions — throwaway prototype

Question: how should a downloaded desktop update ask for a restart?
No direction has been selected. Production updater behaviour is unchanged.

Run `bun run dev -- --port 5191`, then open:
`http://localhost:5191/design/update-prompt/index.html?variant=A`.
Use the bottom arrows or keyboard arrows to compare A, B and C. Dark toggles appearance;
Later and Restart demonstrate feedback only; Replay restores the prompt.
The background is an illustrative course dashboard, not live user data.

- **A / Quiet dialogue:** compact, restrained, explicit restart decision.
- **B / Drawn return:** split illustration/content layout, using the existing ink-and-amber vocabulary.
- **C / At your pace:** non-blocking corner notice; deliberately proposes an interaction change.

References reviewed:

- [#180: shared visual identity](https://github.com/TJ7755/Lacuna/pull/180): Instrument Sans, warm paper and amber drawings.
- [#198: interface polish](https://github.com/TJ7755/Lacuna/pull/198): remove redundant captions; retain grouped content and original branding proportions.
- [#301: quieter completion reports](https://github.com/TJ7755/Lacuna/pull/301): restrained copy and standalone HTML comparison convention.
- [#305: import dialogue](https://github.com/TJ7755/Lacuna/pull/305): contained dialogue structure and deliberate action placement.

These files live outside the production entry graph. Do not merge the prototype as an
implementation. The production version must retain focus containment/restoration,
Escape handling, updater error handling and existing per-version deferral semantics.
The comparison toolbar intentionally remains keyboard-accessible outside the visual dialogues.
