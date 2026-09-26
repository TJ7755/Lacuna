# Update prompt directions — throwaway prototype

Question: how should a downloaded desktop update ask for a restart?
B is the selected direction. Its version eyebrow has been removed, its illustration is
symmetrical, and an expandable changelog uses the published 0.2.11 notes.
Production updater behaviour is unchanged.

Run `bun run dev -- --port 5191`, then open:
`http://localhost:5191/design/update-prompt/index.html?variant=B`.
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

## Release-note integration

This preview summarises the [published 0.2.11 release](https://github.com/TJ7755/Lacuna/releases/tag/v0.2.11).
It does not fetch notes or invoke Electron. Native `details` provides keyboard-accessible
expansion; long notes scroll within the panel and the restart actions remain outside it.

Production support is possible through the existing GitHub update provider:
[`UpdateInfo.releaseNotes`](https://www.electron.build/docs/api/electron-updater.interface.updateinfo/)
is optional and can be a string or a list of versioned notes. Lacuna currently drops it:
`electron/updaterService.ts` accepts only `version`, and `electron/updaterContract.d.ts`
has no notes field. A production implementation should normalise the notes, carry them
through download state and the preload validator, and render them safely without raw HTML.
Hide the disclosure when notes are absent; installation must still work. Test notes
retention, missing/malformed notes, safe rendering and keyboard/focus behaviour.

The currently supported automatic-update packages are Windows Setup and Linux AppImage.
macOS, Windows portable and Linux DEB use the existing manual-update flow; showing notes
there would need a separate extension to that flow. This prototype does not change it.

Validation: desktop and narrow-layout browser checks, disclosure expansion/collapse,
light/dark appearance, scrollable release notes and preview action feedback.
