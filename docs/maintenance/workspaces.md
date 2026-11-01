# Workspace deployment migration

Run installation from the repository root using
`node apps/relay/scripts/security-bun.mjs install --frozen-lockfile`.

## Maintainer dashboard changes

These are required operator actions after the workspace change lands. Repository changes do not
apply dashboard settings. Preserve each project's production branch (`master`), domains, environment
variables and deployment protection. Git-triggered production and preview deployments are disabled.

| Project | Root Directory | Build command | Output directory |
| --- | --- | --- | --- |
| `lacuna` | Repository root (empty) | `node apps/relay/scripts/security-bun.mjs run build` | `dist` |
| `lacuna-gaps` | `apps/gaps` | `cd ../.. && node apps/relay/scripts/security-bun.mjs run build:gaps` | `dist` |
| `lacuna-library` | `apps/library` | `cd ../.. && node apps/relay/scripts/security-bun.mjs run build:library` | `dist` |
| `lacuna-relay` | `apps/relay` | No build override; retain the serverless API configuration | No output override |

For Gaps, library and relay, enable **Include source files outside of the Root Directory in the
Build Step**. They require the root lockfile and shared packages. Clear stale dashboard install/build
command overrides so each project's `vercel.json` supplies its commands. The main project's install
command is `node apps/relay/scripts/security-bun.mjs install --frozen-lockfile`; the other projects
must run that command from the repository root after `cd ../..`.

The application-relative Gaps and library output directories are `dist`; the corresponding repository
paths are `apps/gaps/dist` and `apps/library/dist`. The learner build remains root `dist`.
Clear dashboard Ignored Build Step overrides: the ignored-build script has been retired.
There are no pull-request preview deployments, including the former preview exceptions.

Before promotion, verify the candidate deployment's source identity, assets, API routes and security
headers. For relay, verify scheduled maintenance authorisation and shared protocol imports. Keep a
verified prior deployment for rollback. This migration changes source ownership and build paths;
it does not migrate browser data, wire formats or production environment values.

## GitHub-built production deployments

1. Keep repository Actions variable `VERCEL_DEPLOY_ENABLED` absent or `false` during the cost pause.
2. Add repository Actions secret `VERCEL_TOKEN`, authorised for all four projects in the `tj7755` team.
3. Apply the dashboard settings above. Clear old Ignored Build Step overrides. Preserve domains,
   environment values and deployment protection; keep Git deployments disabled.
4. Follow the return-to-Vercel checklist before enabling deployments around 22 November.
5. When ready, set `VERCEL_DEPLOY_ENABLED=true` and dispatch **Vercel production** on `master`
   separately for each project. Retry failed projects only after fixing their errors.

Do not upload `.vercel` or pulled production environment files as CI artefacts.
