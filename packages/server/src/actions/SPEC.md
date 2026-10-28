---
id: submodule-server-actions
type: submodule-design
status: active
title: actions — user-configured host commands
parent: module-server
---

## Responsibility

Host-owned, explicitly clicked custom actions, independent of Pi. The global ordered catalog lives in
`custom-actions.json` under the app data directory, never in a cloned repository. Definitions contain an
executable, literal argv, an absolute working directory, optional project visibility and result URL,
and a bounded timeout. Credentials come from the host environment or the CLI's own configuration.

## Boundary

- Owns validation, revision-checked catalog updates, latest-run snapshots, process execution and disposal.
- Public surface: `listActions`, `saveActions`, `runAction`, `stopAction`, `disposeActions`.
- Allowed deps: contracts, persistence's narrow catalog read/write, Node built-ins.
- Forbidden: agent, terminal, web, host imports; automatic execution from repository content.

## Execution

Run requests carry only a saved action id and expected catalog revision. The host resolves the saved
executable and arguments without a shell, resolves the scope against the host-provided selected project,
and launches with the live host environment. Shell logic is possible by explicitly selecting a shell
and supplying its arguments. At most four commands run at once, one per action across clients; repeats
while running return that run. Catalog updates cannot edit/delete a running action.

Latest output is a bounded 128 KiB tail per action (both streams, collected in arrival order). Snapshots
are polled; definitions survive restart, run records do not. Exit 0 means command completion only, never
proof of a successful remote deployment. Scripts may poll remote pipelines to provide that guarantee.
Expiry, Stop and host disposal kill the POSIX process group; Windows uses taskkill /T /F with a direct
child fallback. Exit (not pipe EOF) completes execution; a 250 ms grace drains buffered output and then
closes readers, so inherited pipes cannot hang the UI. Closing the UI does not cancel a run. Stop cancels
the local command, not a remote pipeline it has already triggered. Output stays host-local/on the wire
and never enters diagnostic logs or analytics. A stopped host does not replay any command on restart.

Catalog mutations are atomic within one host; a stale revision fails rather than overwriting another
client. As elsewhere in the app, multiple host processes sharing a data directory are not coordinated.
