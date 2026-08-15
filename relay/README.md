# Lacuna relay

A private sync mailbox. It stores two opaque blobs per channel — `state` and
`keybag` — and a hash of the write token. It never sees a key, never decrypts
anything, and never parses a request body as JSON.

Knowledge of the channel id is the read capability. Writes need the bearer
token minted with the channel. `ETag` / `If-Match` is what stops two devices
from clobbering each other on an occupied slot.

## What it cannot see

The relay is a dumb blob store. It has no accounts, no user model, and no
knowledge of Lacuna's schema. Request bodies are ciphertext. Channel ids are
not logged.

## Environment

On Vercel, connect a **private** Blob store to the project. The platform
injects `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` and `BLOB_WEBHOOK_PUBLIC_KEY`.
`@vercel/blob` reads them automatically. There is nothing to configure.

To run the same functions **off Vercel** against a Blob store, set
`BLOB_READ_WRITE_TOKEN` instead. The SDK uses OIDC when those variables are
present, and falls back to the token when they are not. Do not commit a token.

## Deploy

This directory is its own Vercel project. Do not deploy it as part of the app.

1. Create a new Vercel project with **root directory** `relay`.
2. Create a private Blob store in the `lhr1` region and connect it to that
   project.
3. Leave the runtime as Node.js on Fluid Compute. Do not set `runtime = 'edge'`.
4. Framework preset **Other**. The only function file is `api/index.ts`.
   Public paths are rewritten onto `/api` in `vercel.json`. A non-framework
   Vercel project does not treat `api/[...path].ts` as a catch-all — that
   file matches one path segment, so `/c/:id/:slot` never reaches the
   handler. Do not put the handler back in a bracketed filename.
5. Deploy.

The app sets `Cross-Origin-Embedder-Policy: require-corp`, so the relay must
stay on a separate origin. CORS and `Cross-Origin-Resource-Policy: cross-origin`
are set on every response, including errors.

## Verify

Replace `$HOST` with the deployment URL.

```sh
# 1. Mint
curl -sS -D - -X POST "$HOST/channel"

# 2. First push (empty slot is If-Match: "0")
curl -sS -D - -X PUT "$HOST/c/$ID/state" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'If-Match: "0"' \
  -H "Content-Type: application/octet-stream" \
  --data-binary 'not-really-ciphertext'

# 3. Pull — copy the ETag from the response
curl -sS -D - "$HOST/c/$ID/state"

# 4. Overwrite with the ETag from step 3
curl -sS -D - -X PUT "$HOST/c/$ID/state" \
  -H "Authorization: Bearer $TOKEN" \
  -H "If-Match: $ETAG" \
  -H "Content-Type: application/octet-stream" \
  --data-binary 'still-not-ciphertext'

# 5. Panic button
curl -sS -D - -X DELETE "$HOST/c/$ID" \
  -H "Authorization: Bearer $TOKEN"
```

A first `PUT` without `If-Match` is `428`. A `PUT` whose ETag has moved on is
`412`. `GET` on an empty slot is `404`.

Use the production host. Vercel preview deployments are behind Deployment
Protection and redirect unauthenticated requests to SSO, so they cannot be
smoke-tested this way.

## Delete a channel

`DELETE /c/:id` with the bearer token removes the token hash and both slots.
There is no undelete. Unpairing a device in the app is a local action and is
not this; this is the panic button for every device on the channel.

A channel with no write for 90 days is treated as gone, matching the app's
tombstone window. A device offline longer than that will find its channel
gone. There is no cron: expiry is checked on the next request.

## Concurrency

`ETag` is the opaque value Vercel Blob returns. It is not a counter.

- Overwrite of an existing slot uses Blob's native `ifMatch`. A stale ETag
  becomes `412`. That compare-and-swap is what the later sync cycle's retry
  needs.
- The first write into an empty slot still uses `If-Match: "0"` and
  `allowOverwrite: false`, with no `ifMatch`. Vercel does not document
  whether that create is an atomic if-none-match or a check-then-write.
  Two devices that both see an empty slot and both PUT could, on a
  check-then-write platform, last-body-wins. The in-memory tests prove the
  handler's intended 204/412 split, not the platform's create atomicity.

On 15 August 2026 this was measured against the production relay
(`lacuna-relay.vercel.app`, private Blob store `lacuna-sync`, region
`lhr1`). Twenty-five rounds of concurrent first writes, each against a
freshly minted channel, all with `If-Match: "0"` and distinct bodies:

- Ten rounds of two concurrent PUTs: 10/10 exactly one 204, the other 412.
- Fifteen rounds of three concurrent PUTs: 15/15 exactly one 204, the
  other two 412.
- Multi-winner rounds: 0. No-winner rounds: 0.
- In every round the body subsequently returned by GET was the winner's.
  No silent clobber.
- The winning racer varied unpredictably across rounds, so the requests
  were genuinely concurrent rather than serialised by client-side jitter.

That is evidence that, on Vercel Blob as of that date, `allowOverwrite:
false` behaved as an atomic create. It is not a documented platform
guarantee. Vercel could change the behaviour without notice. Twenty-five
rounds argue against a wide race window; they are not a proof of
atomicity. Do not read this as "the race is closed". Re-measure if Blob
behaviour changes, or if a multi-writer scenario beyond two devices is
ever contemplated.

## Caps

`MAX_BODY_BYTES` is 25 MB (Arc 8 §13.3). The handler refuses a larger
`Content-Length` without reading the body.

Vercel Functions still reject inbound request bodies above 4.5 MB at the
platform. A real snapshot that large cannot transit this `PUT`. That ceiling
is accepted. Do not add client-direct Blob upload here.

## Checks

```sh
bun install
bun run typecheck
bun run test
```

Relative imports must end in `.js`. The package is ESM, Vercel emits
extensionless TypeScript as `.js`, and Node will not resolve
`'../src/relay'`. `typecheck` is on `NodeNext` so a missing specifier
fails the build rather than the deployment.
