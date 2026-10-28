# Desktop and automatic marking setup

### Handing out beta access codes

Generate a batch from the repository root:

```bash
bun run ai:invites
```

1. Open `credential-hashes.json`. Set the web project's server environment variable
   `AI_ACCESS_CREDENTIAL_HASHES` to its complete contents and redeploy once for the batch.
2. Keep `codes.csv` private. Send each tester just one unused `access_code`, and record
   their name and the issue date in `issued_to` and `issued_on`. Do not send the whole CSV.
3. The tester opens **Settings → Integrations → Automatic marking**, turns it on, accepts
   the consent warning, pastes their code and clicks **Connect**. Existing access codes still work.

When adding more codes, save the **current deployed** `AI_ACCESS_CREDENTIAL_HASHES` JSON
to a file inside `.ai-invites/`, then include it:

```bash
bun run ai:invites --count 20 --existing .ai-invites/current-hashes.json
```

The new configuration preserves those entries and adds the new batch; the new CSV contains
only the new codes. Replace the server variable with the combined JSON and redeploy.
Omitting `--existing` creates an independent list: deploying it would revoke earlier codes.
Do not reuse an old configuration containing revoked entries, as that would restore access.
To revoke a tester, remove their `learner_id` entry from the deployed configuration and
redeploy. Codes are reusable bearer credentials, not single-use invitations; distribute
them privately and keep the CSV in secure storage. Hashes cannot recover lost codes.

### Optional Jev marking

Jev requires the hosted access/session configuration and existing Upstash Redis variables
above. It caches the one-hour access session in device memory. `AI_SERVICE_DISABLED` disables
new shared session exchanges; already-issued sessions can still access Jev
unless its own kill switch is set. There are no per-learner Jev quotas. Session verification
uses a local signature check. The marking request never waits for Redis: each function instance
checks its in-memory monthly total, refreshed in the background at most once per minute.
It refuses only when that cached total exceeds the configured ceiling; `0` disables the fuse.
A cold instance initially admits requests while its first refresh runs. About a minute of
traffic may overshoot the ceiling across warm instances; cold starts and Redis outages can
extend cross-instance staleness. This is an eventually consistent bug fuse, not a spending cap.

Session throttles report their actual minute or UTC-day reset separately from the monthly
Jev ceiling. Settings shows when marking can be retried; the next marking request after that
time retries without background polling. Unlabelled or malformed 429 responses use a short
backoff rather than claiming monthly exhaustion. Manual marking remains available throughout.
The removed hosted chat endpoint returns HTTP 410 and cannot forward inference requests.

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
