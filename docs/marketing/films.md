# Landing-page films

The landing page shows poster images until the visitor presses play. The final films are
3840×2160 at 60 fps, with fictional demonstration data and music composed for the films.
There is no spoken narration. Text descriptions accompany both players.

The public `lacuna-marketing` Vercel Blob store holds the exports. Two explicit rewrites in
`vercel.json` serve them through `/films/`; Vite uses the same mappings locally. This keeps
video files outside Git, the application bundle and the offline precache without changing
content-security policy. Desktop visitors open the direct public Blob URL in their browser,
so an installed app service worker cannot replace a film navigation with the app shell.
Film metadata also supplies Vite's local proxy; it does not import the root `vercel.json`,
which a subproject deployment can replace with its own configuration. A configuration test
keeps the two deployed rewrites aligned with that metadata.

Posters in `public/landing/films` are frames from the student film at 3.3 seconds and the
Gaps film at 12.5 seconds, converted to 1920×1080 WebP. The library and pupil data are
fictional. Do not advertise a weekly course-publishing commitment.

The editable production archive is kept separately as `Lacuna-film-production-2026-10-20`.
It includes source, recordings used by the edit, original score scripts, cursor source and
licence notices, lockfile, and final exports. Its README contains editing and rendering
instructions. Keep an off-device backup of that archive; the public video store only holds
finished films. The original ignored working assets have not been deleted.

For replacement films, upload a new versioned Blob path, update the explicit rewrites,
regenerate posters and verify playback on desktop and mobile. Never overwrite an approved
export in place. Removing the sections and rewrites rolls back this landing-page change.
