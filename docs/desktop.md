# Desktop and automatic marking setup

### Optional Jev public beta

Jev is off by default. Anyone can enable it through **Settings → Integrations → Automatic
marking**, accept the warning and start marking without an account or invitation code.
The beta may give incorrect marks and diagnoses, including confident errors; reliability
has not been established for every subject or answer type. Learners can change or undo
marks and continue marking manually. The warning prohibits personal data about anyone
in submitted answers, questions, cards or mark schemes; it is not an age restriction.
Free-text input is not automatically anonymised. Turning Jev off cancels pending work
and stops new requests; it does not delete text already received by the provider.

Consent version 2 requires existing users to accept the updated warning. After acceptance,
the app generates a random installation credential, stores it on this device and exchanges
it for a one-hour session kept in memory. Neither the credential nor consent is included in
backups, exports or sync. The server derives a quota ID from the credential; it does not use
IP addresses or attach a learner profile to provider requests. Treat quota IDs as pseudonymous
identifiers. Clearing browser storage or using a different installation creates a new allowance;
these beta limits do not establish a person's identity.

Server configuration on the learner web project:

- `AI_SESSION_SIGNING_KEY`: at least 32 characters, server-only. Existing signing keys can be reused.
- `TYPESAFE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: server-only provider
  and quota-store credentials.
- `JEV_MONTHLY_INPUT_TOKEN_LIMIT`: defaults to 50,000,000. Zero or malformed values disable
  service admission rather than making it unlimited.
- `JEV_MONTHLY_REQUEST_LIMIT`: defaults to 100,000 admitted marking requests, including failed calls.
  Zero or malformed values disable admission.
- `JEV_MAINTAINER_INSTALLATION_IDS`: optional JSON array of approved quota IDs (64 lowercase hex
  characters each). Missing means no elevated installations; malformed configuration refuses service.
- `JEV_SERVICE_DISABLED=1`: stops session creation and marking. `AI_SERVICE_DISABLED=1` also stops
  new session exchanges; use Jev's own switch to stop already-issued sessions.

The old `AI_ACCESS_CREDENTIAL_HASHES` invitation registry is not used by the public Jev endpoints.
Do not publish old invitation credentials. Deploy reviewed server configuration and client code
together; saved environment changes do not update an existing deployment. Old clients using
invitation codes must update and accept the new warning.

### Allowances and maintainer access

Standard installations receive 100 requests per UTC day, 20 per minute and 2 in flight.
Approved maintainer installations receive 1,000 per UTC day, 60 per minute and 4 in flight.
A written-answer request can contain several mark-scheme lines. Cached decisions do not use
another hosted request. Session exchanges do not use an IP-based gate; sharing an institutional network does not
share an installation's marking allowance.

To grant higher limits, the maintainer enables Jev, selects **Copy quota ID** in Settings and
provides that ID privately to the operator. Add it to the server-only
`JEV_MAINTAINER_INSTALLATION_IDS` array and redeploy. Repeat for each authorised installation.
Removing the ID and redeploying restores standard limits, including for existing sessions.
The client cannot select elevated limits. All maintainers share the global ceilings.

Redis atomically checks daily/minute allowances, installation/global concurrency and monthly
budgets before provider dispatch. Redis admission failures stop marking with manual fallback.
The global concurrency limit is 20 and leases last 60 seconds, exceeding the provider timeout.
The monthly input budget reserves 65,536 tokens per admitted request: the provider documents
64k total request context, and Lacuna does not enable long context. Successful responses replace
that reservation with reported input usage. Failed calls, missing usage, interrupted handlers
and failed settlement retain the full reservation for the month. This deliberately favours
stopping early over treating an unknown charge as free. Existing monthly actual usage is included.
The cap can leave less than one maximum-size request unused; monthly budgets reset at UTC month start.

At TypeSafe's published Jev 1.14 input price of $0.042 per million tokens, 50 million tokens
correspond to $2.10 in inference. Output tokens are free. This is not a total hosting budget:
Vercel, Redis, taxes and provider price changes remain separate. Recheck the
[official model pricing and context limits](https://docs.typesafe.ai/models) when changing budgets.
Monitor actual and reserved monthly tokens, admitted requests and settlement failures; do not log
learner text or credentials. Repeated failed calls can consume the conservative budget quickly.

Quota responses include their limit and actual reset time. Settings shows when marking can be
retried; the next answer after that time retries without background polling. Unlabelled or malformed
429 responses use a short backoff. Manual marking remains available throughout. The removed
hosted chat endpoint returns HTTP 410 and cannot forward inference requests.

TypeSafe is US-hosted. Its [privacy policy](https://typesafe.ai/legal/privacy-policy) states
that inputs are not used for training or fine-tuning and are disclosed only to service providers.
Retention is open-ended: there is no fixed deletion period. Treat submitted text as retained.
See the official [API reference](https://docs.typesafe.ai/api/system-one),
[score contract](https://docs.typesafe.ai/primitives/score) and
[model versions](https://docs.typesafe.ai/models).

Mark provenance is additive on review events and self-mark decisions, including frozen first
marking snapshots. No application schema/index or backup version changes: old records need no
migration. Updated backup validators retain the optional field through import and sync; older
clients with strict attempt validators may reject these newer backups. Update both devices
before exchanging them. Existing undo removes the whole review event and its provenance.

For a manual paid smoke check, run `bun scripts/jev-smoke.ts` with `TYPESAFE_API_KEY` supplied
privately in the environment. It makes one noul call and one score call. Automated tests use
fixtures and never require the key.

## Data MCP access

The separate **Settings → MCP server** configuration exposes the broader data tool surface.
Copy its generated configuration, including `--mcp-companion` and both profile arguments.
The companion attaches to the open application over a token-authenticated local socket or
Windows named pipe; the renderer must remain open because it owns IndexedDB.

## Synthetic AI benchmark

The [benchmark harness](../scripts/ai-benchmark.ts) compares Groq's GPT-OSS models with synthetic
fixtures. Confirm that the key's organisation remains on the Free plan before running. A model
name or API key does not establish billing status; there are no paid fallbacks or configurable
endpoints. Keep credentials in a local ignored environment file, never in chat or command arguments.

```sh
bun scripts/ai-benchmark.ts --dry-run
bun --env-file=.env.groq.local scripts/ai-benchmark.ts --repetitions 2
```

The environment file must set `GROQ_API_KEY` and `GROQ_FREE_PLAN_CONFIRMED=true`. Results go to
ignored `artifacts/ai-benchmark/` with owner-only permissions. Mechanical scores and synthetic
read adapters do not establish subject accuracy, deployed database/approval behaviour or shared
provider capacity. Inspect the full answers; keyword matches alone are not quality evidence.

Gateway stealth routes such as Cat Jam must not process personal data, and providers may train
on inputs. The dismissible AI notice explains the boundary but does not remove personal data
from learner prompts or tool results. Disable stealth routes if the application cannot satisfy
that restriction. Review [Vercel's AI Product Terms](https://vercel.com/legal/ai-product-terms)
and the [acceptable use policy](https://vercel.com/legal/acceptable-use-policy) before enabling
providers for the intended audience; an adult-owned API key does not resolve end-user restrictions.
