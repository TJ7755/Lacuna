# Desktop and automatic marking operations

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

To grant higher limits, the maintainer enables Jev, selects **Copy quota ID** in Settings and
provides that ID privately to the operator. Add it to the server-only
`JEV_MAINTAINER_INSTALLATION_IDS` array and redeploy. Repeat for each authorised installation.
Removing the ID and redeploying restores standard limits, including for existing sessions.
The client cannot select elevated limits. All maintainers share the global ceilings.

For a manual paid smoke check, run `bun scripts/jev-smoke.ts` with `TYPESAFE_API_KEY` supplied
privately in the environment. It makes one noul call and one score call. Automated tests use
fixtures and never require the key.

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
