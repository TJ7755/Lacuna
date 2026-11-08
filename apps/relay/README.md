# Lacuna relay

Deploy the relay and web client together when service resumes.

Production is available at `https://relay.getlacuna.app`, attached to the existing
`lacuna-relay` Vercel project and its private Blob store. The legacy
`https://lacuna-relay.vercel.app` endpoint remains an alias, without a redirect,
for saved sync pairings, older app versions and stored share write credentials.

Name.com DNS (configured 27 September 2026, TTL 300):

| Host | Type | Answer | Vercel destination |
| --- | --- | --- | --- |
| apex (blank host) | A | `216.150.1.1` | `lacuna` production |
| `www` | CNAME | `1569694c36fe1c59.vercel-dns-017.com` | 308 redirect to `getlacuna.app` |
| `relay` | CNAME | `da5705de4c43a022.vercel-dns-017.com` | `lacuna-relay` production |

Vercel provisions HTTPS for each domain. Use the current project Domains settings
as the authority if Vercel changes these DNS targets.

`https://preview.getlacuna.app` uses the production relay. Its exact origin is added through
`RELAY_ALLOWED_ORIGINS=https://preview.getlacuna.app` in the **Production** environment of
`lacuna-relay`, not the app project's Preview environment. Preserve any existing entries when
adding an origin. Redeploy the existing production relay deployment after changing this setting;
updating the environment alone does not change a running deployment. Both relay aliases must
continue to serve it. The app preview's Vercel Deployment Protection is separate from relay CORS.

## AI terminal pairing

The short-lived pairing code is a capability; do not paste it into an untrusted task.

## Daily maintenance

Enable the Gaps mailbox with `RELAY_INSIGHTS_ENABLED=1`; the reporting boundaries and operator
procedures are in [Gaps trial operations](../../docs/gaps-trial-operations.md).

## Environment

On Vercel, connect a **private** Blob store to the project.

Set `RELAY_MINT_SECRET` only when an operator needs a mint-rate-limit bypass.

To give an operator bypass, generate a value and set it on the Vercel project. Do not commit it.

```sh
openssl rand -hex 32
```

In the Vercel dashboard: the relay project → **Settings** → **Environment
Variables** → name `RELAY_MINT_SECRET`, paste the generated value, apply to
Production (and Preview if you mint from previews). Redeploy after setting
or removing it.

Set a separate `CRON_SECRET` for daily maintenance. This is required even when
`RELAY_MINT_SECRET` is unset. Generate another independent value:

```sh
openssl rand -hex 32
```

In the Vercel dashboard: the relay project → **Settings** → **Environment Variables** → name
`CRON_SECRET`, paste the generated value and apply it to Production. Cron jobs run only against the
production deployment. Redeploy after adding or rotating it.

To run the same functions **off Vercel** against a Blob store, set
`BLOB_READ_WRITE_TOKEN` instead. Do not commit a token.

## Usage analytics rollout

Before rollout, record the assessment for the UK
[PECR statistical purposes exception](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/).
Confirm hosting request-log access and retention, the lawful basis for any
personal data processed by the hosting service, and the assessment where the service is likely to be accessed by children
under the [Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/).

Generate an independent secret with `openssl rand -hex 32` and set it as
`USAGE_ANALYTICS_ADMIN_SECRET` in the Production environment of `lacuna-relay`.
Deploy the relay and check `/usage/dashboard` using HTTP Basic username
`analytics` and the secret as the password. Check that the existing daily
maintenance schedule is running. Then deploy the learner app. To suspend the
feature, deploy the relay with `USAGE_ANALYTICS_ENABLED=false` and the learner
build with `VITE_USAGE_ANALYTICS_ENABLED=false`.

Deploy relay and learner releases together when the learner minor version changes. Check relay
429 and 422 response rates before increasing analytics capacity.

## Deploy

Use the [workspace deployment procedure](../../docs/maintenance/workspaces.md). Connect a private
Blob store in `lhr1` and use Node.js on Fluid Compute with the **Other** framework preset.

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

Use the production host. Vercel preview deployments are behind Deployment
Protection and redirect unauthenticated requests to SSO, so they cannot be
smoke-tested this way.

## Official library publication retention

The operator procedure, withdrawal and expired-link recovery are in
[the library procedure](../../docs/library.md#official-publication-retention).

## Concurrency measurement provenance

On 15 August 2026, 25 production relay trials in `lhr1` found exactly one winning
first write per channel: ten trials with two writers and fifteen with three.
Every subsequent read returned the winner's body. This measured atomic creation;
it is not a documented Blob guarantee or proof of atomicity. Remeasure after
relevant Blob changes or before expanding multi-writer use.
