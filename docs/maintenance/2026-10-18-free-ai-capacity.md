# Free AI capacity for a small Lacuna group

Research date: 18 October 2026. Primary sources were opened live. This is a dated
capacity and terms assessment, not a promise that a provider will retain its free
offer. No credentials, accounts, billing settings or deployments were changed by
this research.

## What can be promised

Zero payment can be enforced by refusing paid routes and stopping when free
capacity runs out. Generous uninterrupted capacity for twelve people cannot be
guaranteed from uncontracted free services. A model catalogue is not a capacity
allocation: several model IDs can share an account quota, provider capacity or
upstream infrastructure.

For adult users of a non-commercial project, Gateway's genuinely zero-priced
eligible models are worth trying first, with OpenRouter as a small reserve. Groq
is the strongest additional candidate with published recurring allowances.
Cloudflare Workers AI offers another recurring allowance with a particularly
clear hard stop. The age of the intended users materially changes this shortlist.

The maintainer clarified that Lacuna is a general-purpose service with some
under-18 users, rather than a service directed at children. Mixed-age use alone
does not establish that the child-directed restriction applies. Keep that
distinction separate from Gemini's explicit likely-under-18 restriction and
from applicable end-user age/parental-permission requirements.

## Existing providers

### OpenRouter

The current official documentation source defines 20 free-model requests per
minute and 50 per UTC day for accounts below the historical purchase threshold.
The higher allowance is 1,000 per day after sufficient lifetime credit purchases;
the documented threshold is $10. Buying credits does not meet a zero-payment
requirement. The live HTML parser dropped the interpolated numbers, so these
were checked in the [official source constants](https://github.com/OpenRouterTeam/docs/blob/main/snippets/exports/constants.mdx).

The account's `GET /api/v1/key` response reports its actual daily counter and
limit. Extra API keys do not increase the account allocation, and creating extra
accounts to evade that allocation is prohibited. Provider-side
model limits can differ, but changing models does not multiply the platform's
daily allowance. Honour `Retry-After` and rate-limit reset headers. See
[OpenRouter limits](https://openrouter.ai/docs/api_reference/limits).

For twelve people, 50 daily calls means approximately four calls each. A
five-call audit gives the whole group only ten audits daily before retries.
These are arithmetic examples, not measured Lacuna demand.

OpenRouter's terms explicitly contemplate incorporation into customer products,
require applicable model terms to flow down to end users, prohibit account
creation to circumvent limits, and prohibit reselling raw API access. The
service account requires an adult; eligibility of younger downstream users must
be established against the applicable service and model terms rather than
assumed. Models are provided as available and can be withdrawn. See
[OpenRouter terms, sections 2, 5 and 7](https://openrouter.ai/terms).

### Vercel AI Gateway

Live pricing documentation distinguishes the $5 monthly credit allowance from
zero-priced models. Free credits cover a subset of the catalogue; a model being
credit-eligible does not make its token price zero. Optional reporting and other
add-ons can incur charges independently of token prices. Auto top-up is disabled
by default and must stay disabled. See [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing).

Free-tier rate limits apply per model. Vercel deliberately does not publish fixed
numerical thresholds because they change; Support can confirm a model's current
limit. Upstream providers can also return 429. Bounded retries with backoff and
`Retry-After` are documented. It is therefore unjustified to multiply an invented
per-model RPM by the number of free models and promise that capacity. See
[Gateway rate limits](https://vercel.com/docs/ai-gateway/rate-limits).

Gateway expressly permits applications serving end users, subject to third-party
terms, application terms and privacy disclosures. Crucially, stealth models may
not process personal data and providers can train on inputs. The account/AI
product age rules and parental permission requirements also apply. See
[Vercel AI Product Terms, sections 3 and 8](https://vercel.com/legal/ai-product-terms).

The [Vercel acceptable use policy](https://vercel.com/legal/acceptable-use-policy)
prohibits evading limits, including through multiple accounts, and lists online
services directed at children among prohibited AI-service uses. Whether Lacuna's
actual audience and operation fall within that restriction needs resolving
before claiming a compliant school-age deployment. Adult ownership of the API
key does not by itself resolve an end-user restriction. The policy does not
define children as all under-18s. Its separate personal-information restriction
uses under 13 or the applicable digital-consent age. Gateway is covered by the
AI Product Terms; the scope of the AI-service restriction for ordinary hosting
that calls an external inference service is not expressly resolved by these
pages. Do not assume an inference-provider switch clears hosting obligations.

## Additional providers

### Groq: strongest additional candidate

The current Free table lists `openai/gpt-oss-120b` and `openai/gpt-oss-20b` each
at 30 RPM, 1,000 requests per day, 8,000 tokens per minute and 200,000 tokens per
day. Limits are at organisation level and the actual account Limits page is
authoritative. Tokens, rather than RPM, are likely to constrain large card
audits: a 6,000-token request permits little other traffic that minute. See
[Groq rate limits](https://console.groq.com/docs/rate-limits).

Both GPT-OSS models are listed as production models. Preview models are intended
only for evaluation and should not be used for production. Use local function
calling and avoid optional paid built-in tools. See [Groq models](https://console.groq.com/docs/models).

No Free-plan-only evaluation restriction was found in the current agreement or
billing documentation. That is distinct from the explicit preview-model
restriction, and does not promise future free availability.

The Free plan is separate from Developer billing; upgrading requires adding a
payment method and activates usage-based charges. Remain on Free. See
[Groq billing](https://console.groq.com/docs/billing-faqs).

The Services Agreement permits customer applications and their end users.
Section 2 requires an adult to access the Cloud Services; section 6.3 expressly
addresses customer applications directed at or likely accessed by people below
the age of majority and assigns compliance obligations to the customer. This
supports considering a properly operated end-user app, but is not blanket
approval for every minor audience or model. Check the applicable model terms.
The agreement prohibits training on inputs/outputs absent customer permission.
See [Groq Services Agreement](https://console.groq.com/docs/legal/services-agreement).

Ordinary inference inputs/outputs are not retained by default, with limited
reliability/abuse exceptions up to 30 days. All customers can enable zero data
retention; stateful features have separate rules. See [Groq data controls](https://console.groq.com/docs/your-data).

### Cloudflare Workers AI: recurring allowance with a hard stop

Workers Free includes 10,000 neurons daily, resetting at 00:00 UTC. Requests fail
when the free allocation is exhausted; continuing requires opting into paid
service. This is a compute allowance, not 10,000 requests or tokens. Several
frontier models require a paid billing method and must be excluded. See
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

The default text-generation limit is 300 RPM, with exceptions and separate
limits for paid-only models. This rate does not remove the daily neuron cap.
See [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/).

For example, `@cf/openai/gpt-oss-120b` supports function calling and has published
unit prices. These are needed to estimate consumption of the free allocation;
the route itself is not inherently zero-priced. See the
[model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/).

Workers AI does not train on customer content and provides zero retention for
ordinary inference, with stateful and legal exceptions. Individual model
licences still apply. See [Workers AI data use](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
The [Cloudflare agreement](https://www.cloudflare.com/terms/) prohibits evading
quotas. This research did not establish a complete age/child-audience clearance
for every Workers AI model; treat this as a candidate requiring that check,
not a certified school-age alternative.

### Gemini Developer API: unsuitable for this zero-payment UK use case

The current terms require API clients offered to UK, EEA or Swiss users to use
Paid Services. They also exclude clients directed at, or likely to be accessed
by, under-18s. Unpaid quotas elsewhere do not override those restrictions.
Unpaid data can be used for improvement and human review; regional data-use
exceptions do not remove the usage restrictions. See
[Gemini API terms](https://ai.google.dev/gemini-api/terms).

### Cerebras: trial, no longer recurring free

The live rate-limit page explicitly says there is no permanently free tier.
New accounts receive $5 trial credits after adding a verified payment method;
these expire after 30 days, then API access stops until credits are purchased.
The trial currently lists 5 RPM and 30,000 uncached TPM for GPT-OSS-120b, not
the old 30 RPM recurring-free offer circulated in older guides. Exclude it
from a sustainable zero-payment architecture. See
[Cerebras rate limits and trial FAQ](https://inference-docs.cerebras.ai/support/rate-limits).

## Lacuna changes worth making

These are engineering recommendations, not claims of implemented behaviour.

1. Keep one genuine service account per provider. Do not pool artificial
   identities, rotate keys to evade limits, or borrow users' quotas.
2. Keep a reviewed model allowlist and validate current price/capability data.
   Gateway and OpenRouter routes must have all applicable charges equal to zero;
   missing or stale pricing fails closed. Restrict provider/model fallback to
   this set. Disable paid tools, auto top-ups and chargeable Gateway add-ons.
3. Put a fair admission queue in front of providers. Separate user turns from
   tool continuations: admit one turn, allow a bounded tool-step budget within
   it, and record actual provider calls/tokens separately. Raising the existing
   six-steps-per-minute cap alone cannot create provider capacity.
4. Budget per provider and model, with token-aware reservations, bounded
   concurrency, cooldowns and bounded jittered retries. A provider-wide daily
   exhaustion should suspend that provider until reset, not try every model.
   Do not sleep through long cooldowns inside an HTTP function.
5. Reduce calls and prompt volume: batch card reads, return compact tool
   results, retrieve only relevant cards, reuse stable context and cache safe
   repeated results. Measure average and high-percentile calls/tokens per turn
   before promising any daily per-person allowance.
6. Show a specific cooldown/reset message and let the user resume a stopped
   audit. Preserve hard global resource caps so excess demand produces a wait
   or refusal rather than a paid fallback.

The present application limits (six steps per user per minute, 50 daily and
600 monthly; 1,000 globally daily) are app policies, not provider entitlements.
Twelve users making ten turns daily with five provider calls per turn would
need 600 calls daily before retries. OpenRouter's unpaid quota cannot cover it;
Gateway's unpublished capacity cannot be assumed to cover it. Groq's published
token budget still requires prompt sizing and empirical checks.

## Hosting and quota-store constraints

Vercel Hobby is restricted to non-commercial personal use. Financial gain,
including being paid to develop or host the project, can put a project outside
Hobby even if visitors are not charged. See [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines).
Hobby overages generally suspend the affected resource rather than providing
unlimited free operation; see [Vercel plans](https://vercel.com/docs/plans).

Upstash Redis currently advertises 500,000 monthly commands, 250 MB storage and
10 GB bandwidth on Free. Remain on that plan and account for quota checks,
leases, polling and retries, not just successful AI calls. Do not assume that
500,000 commands means 500,000 user turns. See [Upstash Redis pricing](https://upstash.com/pricing/redis).

## Quality and capacity benchmark before choosing a default

GPT-OSS-120b and GPT-OSS-20b are candidates, not established replacements for
Lacuna's current models. Compare their production Groq routes with eligible,
terms-compatible Nemotron and Cat Jam routes using the same instructions,
tools, context and output budget. A provider's inference implementation also
needs verification: OpenAI distinguishes basic tool/API compatibility checks
from full model-quality evaluation in its
[implementation verification guide](https://developers.openai.com/cookbook/articles/gpt-oss/verifying-implementations).

Cat Jam must receive no personal data under the Stealth Model terms. The
maintainer chose to retain it in routing with a dismissible notice instructing
users not to share personal information. Dismissal is remembered locally; the
notice is a disclosure, not automatic personal-data detection or removal.

Build a small, human-reviewed set of course tasks with expected findings and
source excerpts: correct cards that should be retained, seeded factual errors,
ambiguous questions, duplicates, missing context, and an audit large enough to
require several tool steps. Use synthetic or explicitly authorised material;
exclude student personal data. Keep some cases held out when adjusting prompts.

Score factual correctness and grounding, missed errors and false positives,
usefulness of suggested cards, tool/argument correctness, and respect for
read-only requests and ordinary approval rejection. Do not conduct adversarial
red-team tests against providers without establishing permission under their
terms. Human review should be blind to model identity where practical. Repeated
runs help expose inconsistent answers; fluent prose is not an accuracy score.

Record task completion, calls and input/output tokens per completed task,
latency, truncation, retries and rate-limit failures. Token and failure budgets
must use the full tool sequence. Any unapproved write is a hard failure; the
application must enforce approval independently of the model. Set the quality
rubric before running the comparison. No comparative GPT-OSS benchmark has yet
been run for Lacuna, so there is no measured basis for choosing a winner or
promising an allowance to twelve users.

## Evidence limitations

Search excerpts were materially stale: old Gateway snippets said all models
were credit-eligible, and old Cerebras pages described a recurring free tier.
The live pages above supersede those snippets. No provider load test or
age/audience determination was performed. Catalogue membership and a successful
test response establish neither future capacity nor permission for every use.
