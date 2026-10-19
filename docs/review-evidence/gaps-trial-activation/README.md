# Gaps production web trial activation

Activated on 19 October 2026 for the agreed daily-reporting trial of about 30 pupils.
The owner confirmed their human review and approval, then requested another Sol
review before activation. Sol's separate Standards and Spec reviews identified the
same UTC-midnight defect: collection could choose one day while the outbox chose
another. [PR #612](https://github.com/TJ7755/Lacuna/pull/612) fixed it and received
no findings on either follow-up axis. The additional AI review was not a formal
security audit.

## Released source and configuration

The release used a clean export of merged commit
`17b00e4d56a15355773df38f8370b40fde3e81c5`, whose source tree matched reviewed
candidate `3e5bf80ab2b6cc889625309243d0569d512a7fa0`. Unrelated edits in another
checkout were excluded. Both production builds were staged with `--prod
--skip-domain`, checked and then promoted without rebuilding.

| Project | Production gate | Activated deployment |
| --- | --- | --- |
| `lacuna` | `VITE_GAPS_REPORTING_ENABLED=true` | `dpl_5EV7ZkPjLmuasRd8D1zGPD9P8Gqg` |
| `lacuna-relay` | `RELAY_INSIGHTS_ENABLED=1` | `dpl_H71X52oCsRz3TNBkAKhKuAZ481Zv` |

The production targets were confirmed READY after promotion. The teacher site
remained on the separate `lacuna-gaps` project. This activation added no paid
service, desktop activation, schema migration or default-on pupil consent.
The planned class size is not a server-enforced class allowlist.

## Verification

- All jobs in the candidate's [replacement CI run](https://github.com/TJ7755/Lacuna/actions/runs/39259933724)
  passed, including the four unit shards, browser shards and aggregate browser gate.
- The deterministic midnight regression failed on the previous code. All 16 focused
  delivery, outbox and report-reading tests passed after the fix, as did web types
  and focused lint. The frozen synthetic browser flow also passed.
- Live verification adapted [the daily-flow scenario](../../../tests/e2e/gaps-daily-flow.spec.ts)
  to use the deployed learner and teacher sites and the real Blob-backed relay,
  without endpoint or asset interception. It passed in 39.4 seconds.
- A synthetic author published a course and exported its encrypted connection.
  A separate teacher browser verified ownership, prepared its key and published a
  pinned class code. A synthetic pupil joined with consent initially off, opted in,
  studied a card and sent one report for the completed UTC day. The test advanced
  the pupil browser's clock to simulate the reporting boundary.
- The outgoing encrypted packet contained neither the pupil label nor card prompt.
  Gaps decrypted and displayed the recall evidence. Desktop and 390-pixel layouts
  fitted; only the two teacher databases opened. Closing locked the report, and
  pupil opt-out persisted after reload without another upload.
- The completed scenario deleted its synthetic share and report: owner deletion
  returned 204 and a subsequent payload fetch returned 404. Traces and video were
  disabled. A relay server-error scan returned zero records with no excluded intervals.

The first live setup attempt exceeded the local test's five-second publishing
expectation. A 20-second live-network expectation passed without a product change.
That early attempt left a synthetic public course share whose owner capability
was not retained; it contained no pupil key or report and follows normal share
expiry. The successful full scenario's data was deleted as described above.

## Initial fallback deployments

These were the production targets immediately before activation. They captured
disabled reporting gates and are retained as the initial rollback reference.
For later releases, select a compatible deployment rather than blindly reverting
newer learner changes. Also disable the saved production gate values, as described
in [the operator procedure](../../gaps.md#disable-the-trial).

| Project | Previous production deployment URL |
| --- | --- |
| `lacuna-relay` | `https://lacuna-relay-mvunao6j1-tj7755.vercel.app` |
| `lacuna` | `https://lacuna-19fjbr0pb-tj7755.vercel.app` |
