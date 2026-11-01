# Lacuna relay

Opaque storage for device sync, AI sessions, course sharing and Gaps reports.
Protocol v2 is defined in the [shared route table](../../packages/protocol/src/relay.ts).
The [single request handler](src/relay.ts) dispatches that contract to the existing storage operations.
Requests, responses, errors, status codes and limits are shared with the typed client.

This is a hard cut: `/api` aliases and deprecated pairing-code paths are removed.
Deploy the relay and web client together when service resumes; edge desktop clients update silently.
There is no v1 compatibility handler or separate ciphertext format negotiation. Existing opaque
ciphertext and Blob compare-and-swap generations remain unchanged.

Canonical paths cover `/channel`, `/c/:id/:slot`, `/shares`, `/class-codes`, `/insights`
and `/ai`. One catch-all rewrite preserves the path for routing in code. The authenticated
nightly cron calls `/ai/maintenance` at 03:00 UTC.

Production is available at `https://relay.getlacuna.app`, attached to the existing
`lacuna-relay` Vercel project and its private Blob store. The legacy
`https://lacuna-relay.vercel.app` endpoint remains an alias, without a redirect,
for saved sync pairings, older app versions and stored share write credentials.
Adding the domain does not move or recreate channels, published shares or AI sessions.

Name.com DNS (configured 27 September 2026, TTL 300):

| Host | Type | Answer | Vercel destination |
| --- | --- | --- | --- |
| apex (blank host) | A | `216.150.1.1` | `lacuna` production |
| `www` | CNAME | `1569694c36fe1c59.vercel-dns-017.com` | 308 redirect to `getlacuna.app` |
| `relay` | CNAME | `da5705de4c43a022.vercel-dns-017.com` | `lacuna-relay` production |

Vercel provisions HTTPS for each domain. Use the current project Domains settings
as the authority if Vercel changes these DNS targets.

Set `RELAY_ALLOWED_ORIGINS` to a comma-separated list to allow additional browser origins,
such as a preview or self-hosted web build. The defaults live in [the CORS policy](src/cors.ts).

`https://preview.getlacuna.app` uses the production relay. Its exact origin is added through
`RELAY_ALLOWED_ORIGINS=https://preview.getlacuna.app` in the **Production** environment of
`lacuna-relay`, not the app project's Preview environment. Preserve any existing entries when
adding an origin. Redeploy the existing production relay deployment after changing this setting;
updating the environment alone does not change a running deployment. Both relay aliases must
continue to serve it. The app preview's Vercel Deployment Protection is separate from relay CORS.

## AI terminal pairing

The short-lived pairing code is a capability; do not paste it into an untrusted task.
Read [the AI handler](src/aiRelay.ts) and [the client transport](../web/src/ai/relayClient.ts)
for pairing and mailbox behaviour.

## Daily maintenance

Enable the Gaps mailbox with `RELAY_INSIGHTS_ENABLED=1`; the reporting boundaries and operator
procedures are in [Gaps](../../docs/gaps.md).

## Environment

On Vercel, connect a **private** Blob store to the project. The platform
injects `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` and `BLOB_WEBHOOK_PUBLIC_KEY`.
`@vercel/blob` reads them automatically.

`RELAY_MINT_SECRET` is an optional mint-rate-limit bypass. Leaving it unset allows public,
rate-limited minting; setting it does not disable the public path.

To give an operator bypass, generate a value and set it on the Vercel project. Do not commit it.

```sh
openssl rand -hex 32
```

In the Vercel dashboard: the relay project → **Settings** → **Environment
Variables** → name `RELAY_MINT_SECRET`, paste the generated value, apply to
Production (and Preview if you mint from previews). Redeploy after setting
or removing it. With the variable absent the relay still mints publicly.

Set a separate `CRON_SECRET` for daily maintenance. This is required even when
`RELAY_MINT_SECRET` is unset. Generate another independent value:

```sh
openssl rand -hex 32
```

In the Vercel dashboard: the relay project → **Settings** → **Environment Variables** → name
`CRON_SECRET`, paste the generated value and apply it to Production. Cron jobs run only against the
production deployment. Redeploy after adding or rotating it.

To run the same functions **off Vercel** against a Blob store, set
`BLOB_READ_WRITE_TOKEN` instead. The SDK uses OIDC when those variables are
present, and falls back to the token when they are not. Do not commit a token.

## Deploy

This directory is its own Vercel project. Do not deploy it as part of the app.

1. Create a new Vercel project with **root directory** `apps/relay`.
2. Create a private Blob store in the `lhr1` region and connect it to that
   project.
3. Leave the runtime as Node.js on Fluid Compute. Do not set `runtime = 'edge'`.
4. Framework preset **Other**. The only function file is `api/index.ts`.
   Public paths are rewritten onto `/api` in `vercel.json`. A non-framework
   Vercel project does not treat `api/[...path].ts` as a catch-all — that
   file matches one path segment, so `/c/:id/:slot` never reaches the
   handler. Do not put the handler back in a bracketed filename.
5. Set `CRON_SECRET` on the project so daily maintenance can authenticate and run. A missing
   value fails closed.
6. Optionally set `RELAY_MINT_SECRET` on the project (see Environment) to keep a private bypass.
   Minting works without it via the public path.
7. Deploy.

Deploy protocol v2 clients and relay together. Deployments are paused until approximately
22 November 2026; this change does not deploy or alter Vercel settings.

The app sets `Cross-Origin-Embedder-Policy: require-corp`, so the relay must
stay on a separate origin. CORS and `Cross-Origin-Resource-Policy: cross-origin`
are set on every response, including errors.

## Verify

Replace `$HOST` with the deployment URL.

```sh
# 1. Mint — public (no secret) or with secret to bypass rate limit
curl -sS -D - -X POST "$HOST/channel"
# with secret:
# curl -sS -D - -X POST "$HOST/channel" \
#   -H "Authorization: Bearer $RELAY_MINT_SECRET"

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

## Concurrency

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

Vercel Functions still reject inbound request bodies above 4.5 MB at the
platform. A real snapshot that large cannot transit this `PUT`. That ceiling
is accepted. Do not add client-direct Blob upload here.

## Official library publication retention

The operator procedure, withdrawal and expired-link recovery are in
[the library procedure](../../docs/library.md#official-publication-retention). Catalogue changes do
not silently change the relay's retention authority.
