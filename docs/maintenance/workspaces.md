# Workspace deployment migration

Run installation from the repository root using
`node apps/relay/scripts/security-bun.mjs install --frozen-lockfile`.

## Maintainer dashboard changes

These are required operator actions after the workspace change lands. Repository changes do not
apply dashboard settings. Preserve each project's production branch (`master`), domains, environment
variables, deployment protection and existing preview policy.

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
Update any dashboard Ignored Build Step override that references the former paths to the command in
that project's `vercel.json`. Preserve Gaps' production-only preview policy described in the
[Gaps procedure](../gaps-trial-operations.md).

Before promotion, verify the candidate deployment's source identity, assets, API routes and security
headers. For relay, verify scheduled maintenance authorisation and shared protocol imports. Keep a
verified prior deployment for rollback. This migration changes source ownership and build paths;
it does not migrate browser data, wire formats or production environment values.
