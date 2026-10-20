# Landing films

[Film configuration](../src/components/landing/films.ts) supplies both players, the local Vite
proxy and desktop/direct links. [Origins](../src/config/origins.ts) owns `LANDING_FILM_ORIGIN`;
it defaults to the existing Blob origin until the owner provisions a replacement.

## Owner domain switch

1. Create `media.getlacuna.app`, or an equivalent rewrite, serving the same files at
   `/films/2026-10/lacuna-student-4k.mp4` and
   `/films/2026-10/gaps-teachers-tutors-4k.mp4`. Verify HTTPS, `video/mp4`, byte-range requests
   and seeking before switching traffic.
2. Change `LANDING_FILM_ORIGIN` to that origin, without a trailing slash. Update the two film
   rewrite destinations in [vercel.json](../vercel.json) to match. Vercel reads its deployment
   configuration separately; `src/vercelConfig.test.ts` checks that the destinations agree
   with the configured films. Local Vite proxies and desktop/direct links follow the constant.
3. Keep web playback on its same-origin `/films/` paths. These preserve the existing media
   content security policy and cross-origin isolation headers. Retain the film rewrite cache
   opt-out so partial responses do not poison subsequent playback.
4. Verify both films play and seek through the deployed web routes, and that the direct URLs
   work. Block a film request and check that its local poster, failure message and navigation
   remain usable. Repeat from the networks the owner intends to support.

A custom domain does not establish mainland China reachability. DNS, hosting and network checks
remain owner work; this code change makes no regional availability claim.

## Posters and offline behaviour

Each film uses a local WebP still in `public/landing/films/`, independent of the streaming host.
An error removes the video and shows that still with a direct link and a calm message. If the
player held keyboard focus, the message receives it; an asynchronous failure must not steal
focus from elsewhere on the page.

Films load only when requested. Films and posters are explicitly excluded from Workbox precaching
and have no runtime-cache rule. They are not guaranteed offline; this fallback handles unavailable
streaming media, rather than promising offline marketing assets. Keep stills small and run the
existing launch asset audit when changing them. Do not embed video bytes in the application bundle.
