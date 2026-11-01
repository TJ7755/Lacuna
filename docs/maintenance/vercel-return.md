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
- [ ] In **Vercel → tj7755 → Settings → Billing → Spend Management**, set the maintainer-approved
  spend limit and alert threshold; confirm the alert recipients before resuming service.
- [ ] Preserve production domains, environment variables and deployment protection. Keep Git
  deployments disabled. Resume paused projects only when ready to return service.

## Run the final checks on master

- [ ] Require about a week of clean desktop nightlies on the same code before re-enabling web
  deployments. Record the nightly versions, source SHAs and soak result. Restart the relevant soak
  after a material change.
- [ ] Wait for #1043 to merge. Fetch and check out current `master`; record its full commit SHA.
- [ ] Require successful **CI** and **Security** runs for that exact SHA. Check the full post-merge
  browser results, including functional shards, isolated image/study timing and standalone sites;
  do not substitute a PR smoke run.
- [ ] Run `gh workflow run performance.yml --ref master`. Require both jobs to pass; download and
  retain the web and relay performance artefacts with the tested SHA. Check the full large-library
  budgets, asset and first-interaction gates, and relay stress probes. Compare equivalent workloads
  with the retained baseline in the [performance procedure](../PERFORMANCE.md).
- [ ] Rerun the schema-floor maintenance upgrade test against the final master SHA, following its
  merged upgrade procedure. Retain the report with that SHA. Require the production DB/export
  regression fixture result before approving the return; do not substitute a source compatibility
  audit or relay unit tests for that evidence.
- [ ] Fix failures before proceeding. If master changes, repeat the final checks on the new SHA.
- [ ] Before any deployment, record the last good production deployment URL/ID and source SHA for
  each project: `lacuna`, `lacuna-relay`, `lacuna-gaps` and `lacuna-library`. Check that each is
  available under **Vercel → project → Deployments**. Record this rollback step alongside each:
  open the saved deployment, choose **Promote to Production**, and confirm the project/domain.
  Keep this record outside the deployment workspace.

## Make one preview deployment

- [ ] Keep `VERCEL_DEPLOY_ENABLED=false`. On a GitHub-hosted runner at the final validated master
  SHA, select the `lacuna` project with its existing team/project IDs and `VERCEL_TOKEN`. Run:

  ```sh
  vercel pull --yes --environment=preview
  vercel build
  vercel deploy --prebuilt
  ```

- [ ] Retain the preview URL and source SHA. Make this single operator-requested preview only;
  do not enable Git-triggered or PR previews. Use approved preview environment values and disposable
  data; keep production secrets out of logs and artefacts.
- [ ] On the real Vercel preview URL, smoke-test direct and refreshed routes, CSP and response
  headers, relay rewrites and representative `/courses/` pages. Check relay destination and requests
  in the browser network panel. Resolve failures before production.
- [ ] Check `/sitemap.xml`, `/robots.txt` and `/courses/` canonical URLs. Confirm intended production
  URLs, sitemap entries and indexing rules; keep the preview itself out of the search index.

## Enable and deploy

- [ ] In **GitHub → Settings → Secrets and variables → Actions → Variables**, edit
  `VERCEL_DEPLOY_ENABLED` to exactly `true`.
- [ ] In **GitHub → Actions → Vercel production → Run workflow**, select branch `master` and
  project `lacuna-relay`. Preserve its storage and credentials. Require success and verify canonical
  sync, share, insights and AI endpoints with the previously deployed client before proceeding.
  Then deploy `lacuna`, `lacuna-gaps` and `lacuna-library`, and verify the desktop rollout.
- [ ] Before lifting the freeze, confirm compatibility against the actual production client and
  any supported older clients. If that compatibility is unverified, keep public access paused;
  resolve it before resuming service. Do not rely on service-worker registration to replace
  open-tab or offline clients promptly.

## Verify the first production deployments

- [ ] Check each Actions run and Vercel deployment for the intended source SHA and successful
  production promotion. Check production domains, TLS and security headers.
- [ ] Open the learner app, Gaps and library in a fresh desktop browser session. Check initial load,
  navigation, assets and service-worker refresh; repeat in an existing session.
- [ ] With disposable accounts/data, check relay health, synchronisation, sharing, class-code access
  and an AI session. Check relay scheduled-maintenance authorisation and server logs for errors.
- [ ] In **Google Search Console → production property → Sitemaps**, submit the production sitemap
  URL and check its fetch result.
- [ ] Inspect Vercel deployment activity and usage for unexpected builds or previews.
- [ ] If verification fails, set `VERCEL_DEPLOY_ENABLED=false` in the repository Variables tab,
  roll affected projects back to the verified deployment, and rerun validation before retrying.
