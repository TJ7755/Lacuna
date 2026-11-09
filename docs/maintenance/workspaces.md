# Workspace deployment migration

## Maintainer dashboard changes

| Vercel project | Root Directory |
| --- | --- |
| `lacuna` | Repository root (empty) |
| `lacuna-gaps` | `apps/gaps` |
| `lacuna-library` | `apps/library` |
| `lacuna-relay` | `apps/relay` |

For Gaps, library and relay, enable **Include source files outside of the Root Directory in the
Build Step**. Clear stale install, build, output and Ignored Build Step overrides. Preserve
the production branch (`master`), domains, environment values and deployment protection. Keep Git deployments disabled.

## GitHub-built production deployments

Keep `VERCEL_DEPLOY_ENABLED` absent or `false` during the cost pause. Follow the
[return checklist](vercel-return.md) to prepare credentials, verify the candidate and dispatch
production deployments. Keep a verified prior deployment for rollback.

Keep `.vercel` and pulled production environment files out of CI artefacts.
