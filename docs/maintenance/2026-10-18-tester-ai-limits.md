# Hosted AI tester admission, 18 October 2026

The former six-step minute allowance could interrupt one permitted nine-step tool run.
Application admission now allows twenty steps per minute, 200 daily and 3,000 monthly per access
code. The shared ceilings are 400 daily and 6,000 monthly. Two steps per code and four
globally may be in flight. Counters use UTC calendar windows; releasing a concurrent lease does
not refund a consumed step. A step that fails upstream still consumes its reservation.

Twenty steps accommodate two maximum-length tool runs in one minute. This initial beta has two
testers, with access-code distribution controlled by the operator. Each can use 3,000 steps over
the month, roughly twenty five-step turns daily over thirty days. The higher daily limit permits
concentrated testing. The twenty issued codes share the same aggregate limits even if more are
distributed; issuing extra codes does not create capacity. Existing user counters remain intact;
the new shared monthly counter
starts with the first reservation after this policy is deployed.

The extra monthly counter keeps accepted traffic within a sensible part of the free Redis budget.
A successful reservation makes one EVAL plus 23 internal Redis calls; release makes one EVAL plus
two internal calls. That is 27 commands per completed inference step, or 162,000 for the full
6,000-step aggregate allowance. Against the advertised 500,000-command Free plan, this leaves
338,000 for access-code exchanges, refusals and other use of the database. Replicated writes can
increase command accounting; the estimate assumes no additional read regions. Refused attempts
also use commands, so this is not an absolute database-usage guarantee. Keep the database on Free
and monitor its usage rather than enabling automatic upgrades. See
[Upstash command accounting](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs) and
[Free plan pricing](https://upstash.com/pricing/redis).

These application ceilings do not enlarge upstream request or token allowances. The
[provider capacity research](https://github.com/TJ7755/Lacuna/blob/b7995873874bbf4d5074430b34481491cc59588c/docs/maintenance/2026-10-18-free-ai-capacity.md) records their separate constraints.
The free-model allowlist, live zero-pricing checks and absence of paid fallback remain mandatory.
