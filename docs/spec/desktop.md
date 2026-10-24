# Desktop transport and authority boundaries

[Main process](../../electron/main.ts), [preload](../../electron/preload.ts) and
[security policy](../../electron/securityPolicy.ts) own native capabilities. Keep the renderer
sandboxed and expose narrow validated bridges, not raw IPC or sockets. CSP/CORS exceptions remain
restricted to the exact trusted renderer and supported origins. Update notes are untrusted content.

The renderer owns IndexedDB. Native MCP servers and companions transport handler-free contracts;
executable database handlers remain in the renderer. [MCP build](../../electron/mcp/build.mjs) guards
the bundle boundary. A missing renderer must return a bounded failure rather than leaving a bridge
request waiting forever. Always reply to correlated requests, including errors.

## MCP and AI

Native attachment uses authenticated local sockets or Windows named pipes, not a new TCP service.
Generated commands preserve installation/profile arguments. Direct AI companions run in Electron's
Node mode rather than starting a second browser instance. The local AI companion and broader data
MCP surface have separate authority even when they share a native broker.

Data MCP grants are connection-scoped, Course-scoped and destroyed on disconnect. The first write
or destructive action waits for in-app approval; cross-Course calls cannot bypass resolution and
permission checks. Internal Undo snapshots never become client payloads. The supported surface
excludes raw FSRS writes, review recording and general backup/share operations. Expanding it needs
an explicit product/safety decision, not just a convenient automation use case.

The AI renderer remains authoritative for session ownership, Stop, stable call receipts and exact
one-shot approvals. Sanitise native companion failures so paths, account names and endpoints do not
leak into model-visible error text. Protocol constants and schemas live in
[Electron MCP](../../electron/mcp/) and [renderer contracts](../../src/mcp/), not a version table here.

## Packaging and updates

[Packaging configuration](../../electron/electron-builder.yml) owns targets and artefact names.
[Setup](../desktop.md) and [release maintenance](../maintenance/release.md) own operator procedures.
Downloaded updates require explicit Restart and install; ordinary quit must not install them.
During Windows upgrades, relaunching companions must honour the live installer marker across profiles.

Provenance and hashes establish artefact identity, not application signing or native behaviour.
Use exact-release, isolated-profile tests; never install over the maintainer's working profile to
obtain upgrade evidence.
