# Automatic marking operations

Provision `AI_SESSION_SIGNING_KEY` (at least 32 characters), `TYPESAFE_API_KEY`, `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` on the learner web project as server-only secrets. Redeploy after
changing configuration. Keep invitation credentials private.

For a manual paid smoke check, run `bun scripts/jev-smoke.ts` with `TYPESAFE_API_KEY` supplied
privately in the environment.

## Synthetic AI benchmark

Confirm the Groq key's organisation is on the Free plan. Put `GROQ_API_KEY` and
`GROQ_FREE_PLAN_CONFIRMED=true` in a local ignored environment file.

```sh
bun scripts/ai-benchmark.ts --dry-run
bun --env-file=.env.groq.local scripts/ai-benchmark.ts --repetitions 2
```

Review the full answers in `artifacts/ai-benchmark/`. Assess subject accuracy and hosted capacity
separately from the synthetic benchmark.

Keep personal data out of Gateway stealth routes. Review the provider's data-use terms and
audience restrictions before enabling access. See [Vercel's AI Product Terms](https://vercel.com/legal/ai-product-terms)
and [acceptable use policy](https://vercel.com/legal/acceptable-use-policy).
