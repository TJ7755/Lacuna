# Return to Vercel — 22 November 2026

## Prepare settings

- [ ] In **GitHub → TJ7755/Lacuna → Settings → Secrets and variables → Actions → Secrets →
  New repository secret**, add `VERCEL_TOKEN` with a Vercel token authorised for all four projects
  in the `tj7755` team.
- [ ] In the same GitHub Actions settings, open **Variables → New repository variable** and add
  `VERCEL_DEPLOY_ENABLED` with value `false`. Leave it `false` until the checks below pass.
- [ ] Under **Actions → Secrets → New repository secret**, add `TYPESAFE_API_KEY` with the TypeSafe
  API key for manual Jev evaluations. Do not put this key in a browser environment variable.
- [ ] In **Vercel → tj7755 → each project → Settings → Build and Deployment → Root Directory**, set:

  | Project | Root Directory |
  | --- | --- |
  | `lacuna` | Empty (repository root) |
  | `lacuna-relay` | `apps/relay` |
  | `lacuna-gaps` | `apps/gaps` |
  | `lacuna-library` | `apps/library` |

- [ ] In those Root Directory settings, enable **Include source files outside of the Root Directory
  in the Build Step** for relay, Gaps and library.
- [ ] In each project's **Settings → Build and Deployment**, clear stale install/build overrides
  and the **Ignored Build Step** override. Apply the command/output settings in the
  [workspace deployment procedure](workspaces.md#maintainer-dashboard-changes).
- [ ] Preserve production domains, environment variables and deployment protection. Keep Git
  deployments disabled. Resume paused projects only when ready to return service.

## Run the final checks on master

- [ ] Wait for #1043 to merge. Fetch and check out current `master`; record its full commit SHA.
- [ ] Require successful **CI** and **Security** runs for that exact SHA. Check the full post-merge
  browser results, including functional shards, isolated image/study timing and standalone sites;
  do not substitute a PR smoke run.
- [ ] Run `gh workflow run performance.yml --ref master`. Require both jobs to pass; download and
  retain the web and relay performance artefacts with the tested SHA. Check the full large-library
  budgets, asset and first-interaction gates, and relay stress probes. Compare equivalent workloads
  with the retained baseline in the [performance procedure](../PERFORMANCE.md).
- [ ] Fix failures before proceeding. If master changes, repeat the final checks on the new SHA.
- [ ] Keep a verified previous production deployment available for rollback.

## Enable and deploy

- [ ] In **GitHub → Settings → Secrets and variables → Actions → Variables**, edit
  `VERCEL_DEPLOY_ENABLED` to exactly `true`.
- [ ] In **GitHub → Actions → Vercel production → Run workflow**, select branch `master` and
  project `lacuna-relay`. Require success, then repeat for `lacuna`, `lacuna-gaps` and
  `lacuna-library`. Resume relay and web clients together; do not leave mixed protocol versions live.

## Verify the first production deployments

- [ ] Check each Actions run and Vercel deployment for the intended source SHA and successful
  production promotion. Check production domains, TLS and security headers.
- [ ] Open the learner app, Gaps and library in a fresh desktop browser session. Check initial load,
  navigation, assets and service-worker refresh; repeat in an existing session.
- [ ] With disposable accounts/data, check relay health, synchronisation, sharing, class-code access
  and an AI session. Check relay scheduled-maintenance authorisation and server logs for errors.
- [ ] Inspect Vercel deployment activity and usage for unexpected builds or previews.
- [ ] If verification fails, set `VERCEL_DEPLOY_ENABLED=false` in the repository Variables tab,
  roll affected projects back to the verified deployment, and rerun validation before retrying.
