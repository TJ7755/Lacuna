# Desktop and automatic marking operations

Server configuration on the learner web project:

- `AI_SESSION_SIGNING_KEY`: at least 32 characters, server-only. Existing signing keys can be reused.
- `TYPESAFE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: server-only provider
  and quota-store credentials.
To configure marking limits and emergency admission controls, inspect
[the server configuration](../apps/ai/server/jev/). Keep credentials server-only and redeploy
after changing configuration. Do not publish invitation credentials.

For a manual paid smoke check, run `bun scripts/jev-smoke.ts` with `TYPESAFE_API_KEY` supplied
privately in the environment.

## Synthetic AI benchmark

The [benchmark harness](../scripts/ai-benchmark.ts) compares Groq's GPT-OSS models with synthetic
fixtures. Confirm that the key's organisation remains on the Free plan before running. A model
name or API key does not establish billing status. Keep credentials in a local ignored environment file, never in chat or command arguments.

```sh
bun scripts/ai-benchmark.ts --dry-run
bun --env-file=.env.groq.local scripts/ai-benchmark.ts --repetitions 2
```

Set `GROQ_API_KEY` and `GROQ_FREE_PLAN_CONFIRMED=true` in the environment file.
Inspect the results under `artifacts/ai-benchmark/`. Mechanical scores and synthetic
read adapters do not establish subject accuracy, deployed database/approval behaviour or shared
provider capacity. Inspect the full answers; keyword matches alone are not quality evidence.

Gateway stealth routes such as Cat Jam must not process personal data, and providers may train
on inputs. The dismissible AI notice explains the boundary but does not remove personal data
from learner prompts or tool results. Disable stealth routes if the application cannot satisfy
that restriction. Review [Vercel's AI Product Terms](https://vercel.com/legal/ai-product-terms)
and the [acceptable use policy](https://vercel.com/legal/acceptable-use-policy) before enabling
providers for the intended audience; an adult-owned API key does not resolve end-user restrictions.
