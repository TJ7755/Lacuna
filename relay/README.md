# Lacuna relay

A private sync mailbox. It stores two opaque blobs per channel — `state` and
`keybag` — and a hash of the write token. It never sees a key, never decrypts
anything, and never parses a request body as JSON.

Knowledge of the channel id is the read capability. Writes need the bearer
token minted with the channel. The generation number in `ETag` / `If-Match` is
what stops two devices from clobbering each other.

## Environment

On Vercel, connect a **private** Blob store to the project. That sets:

- `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN` (used automatically on Vercel)
- `BLOB_READ_WRITE_TOKEN` (fallback; required if you run the functions elsewhere)

No other variables.

## Deploy

This directory is its own Vercel project. Do not deploy it as part of the app.

1. Create a new Vercel project with **root directory** `relay`.
2. Create a private Blob store and connect it to that project.
3. Deploy.

The app sets `Cross-Origin-Embedder-Policy: require-corp`, so the relay must
stay on a separate origin. CORS and `Cross-Origin-Resource-Policy: cross-origin`
are set on every response, including errors.

## Verify

Replace `$HOST` with the deployment URL.

```sh
# 1. Mint
curl -sS -D - -X POST "$HOST/channel"

# 2. First push (empty slot is generation 0)
curl -sS -D - -X PUT "$HOST/c/$ID/state" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'If-Match: "0"' \
  -H "Content-Type: application/octet-stream" \
  --data-binary 'not-really-ciphertext'

# 3. Pull
curl -sS -D - "$HOST/c/$ID/state"

# 4. Panic button
curl -sS -D - -X DELETE "$HOST/c/$ID" \
  -H "Authorization: Bearer $TOKEN"
```

A first `PUT` without `If-Match` is `428`. A `PUT` whose generation has moved
on is `412`. `GET` on an empty slot is `404`.

## Caps

`MAX_BODY_BYTES` is 25 MB (Arc 8 §13.3). The handler refuses a larger
`Content-Length` without reading the body.

Vercel Functions still reject inbound request bodies above 4.5 MB at the
platform. A real snapshot that large cannot transit this `PUT` until that is
addressed — most likely by uploading the ciphertext to Blob from the client
rather than through the function. The application cap stays at 25 MB.

A channel with no write for 90 days is treated as gone, matching the app's
tombstone window.

## Checks

```sh
bun install
bun run typecheck
bun run test
```
