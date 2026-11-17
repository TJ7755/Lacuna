# Landing media maintenance

When replacing previews in `public/landing/films/`, preserve image dimensions and
descriptive alternative text, then verify layout and navigation. Do not introduce
hosted playback without a maintainer cost decision.

## Preserve the production archive

Keep an off-device backup of the separate editable archive
`Lacuna-film-production-2026-10-20`. Its README contains editing and rendering instructions;
preserve its source, recordings, original score scripts, cursor source, licence notices, lockfile
and final exports. Retain the original ignored working assets. Removing public Blob copies must
not remove that editable archive or learner data.

## Preview and select a landing design

Run `bun run dev` and open `/#/landing-studies` to compare the five interactive designs.
To use one for the public homepage and the in-app welcome page, set `LACUNA_LANDING` in
the build environment to `almanac`, `specimen`, `soundings`, `marginalia` or `interval`,
then run the ordinary build. For example:

```sh
LACUNA_LANDING=specimen bun run build
```

Unset the variable and rebuild to restore the original design.
