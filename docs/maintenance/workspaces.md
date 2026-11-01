# Workspace deployment migration

The root `bun.lock` and pinned Bun release own installation for all applications and packages.
Run commands from the repository root; do not install or generate lockfiles in individual workspaces.
Application sources live under `apps/`; shared domain code lives in `packages/core` and wire contracts
in `packages/protocol`. Import shared contracts through `@lacuna/core` and `@lacuna/protocol` exports.
The former root source-directory compatibility links are removed.

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

`.github/workflows/vercel-deploy.yml` runs only on `master` pushes or a manual dispatch on `master`.
It uses the existing CI change classifier; shared frontend build dependencies deliberately select all
three frontends together. Unknown changes select every project. Independent matrix jobs pull production
settings after CI and Security pass for the exact master commit, run `vercel build --prod` on GitHub, then upload with `vercel deploy --prebuilt --prod`.
No Vercel build machine is started by Git pushes: every project sets `git.deploymentEnabled` to `false`.
See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration) and
[prebuilt builds](https://vercel.com/docs/cli/build).

The maintainer must perform these steps; the workflow does not configure accounts or repository settings:

1. Keep repository Actions variable `VERCEL_DEPLOY_ENABLED` absent or `false` throughout the cost pause.
   Both automatic and manual deployments are inert until it is exactly `true`.
2. Add repository Actions secret `VERCEL_TOKEN`, with access to the four projects in the `tj7755` team.
   Never commit the token. The non-secret team/project IDs are committed in the workflow and scope script.
3. Apply the Root Directory, external-source access and command settings above. Clear old Ignored Build
   Step overrides for all four projects. Keep Git deployments disabled and preserve existing production
   domains, environment values and deployment protection. If projects were paused in the dashboard,
   resume them manually when service should return; do not resume them merely to merge this workflow.
4. When ready to return to Vercel (approximately 22 November), set `VERCEL_DEPLOY_ENABLED=true`.
   Dispatch the workflow separately for each project to establish a complete baseline after the pause.
   Subsequent pushes deploy affected projects only; manual dispatch can retry a failed project.

Do not upload `.vercel` or pulled production environment files as CI artefacts. The workflow serialises
production runs without cancelling active deployments; projects within each run build in parallel.
