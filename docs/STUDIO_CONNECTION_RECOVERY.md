# Studio instance recovery and reset

A Studio instance ID identifies an open Studio session, not a persistent Roblox game. A restart can change it. Forge previously retained a run's original pin and its saved model/tool context after the project connection changed, producing `Tool target differs from the pinned Studio instance` when a model supplied a different ID.

## Recover a disconnected instance

1. Open the **same game/place** in Roblox Studio and enable its MCP server.
2. In Forge, pause the team and wait for active operations to finish. Resolve any uncertain Studio operations in Reviews before changing an existing work target.
3. Open **Games → select the project → Studio connection**. Use **Connect / refresh Studios** to get the current instance list.
4. Select the previous run target and paste the new ID into **New Roblox Studio instance ID**. IDs can be entered manually; the replacement must still be present in a fresh live discovery response before unfinished work can be switched.
5. Click **Review Studio switch**. Verify the project, previous/new IDs, Studio name and Place ID. Check the same-game confirmation and type the exact project name, then **Confirm switch**.
6. The team stays paused. Review queued work and resume when ready. Tasks paused individually still require their normal Resume action.

For the reported case, select previous target `f6a42404-67b3-4ade-b58b-c6b30f3e2753` and enter replacement `6465ed97-8651-49fb-8de5-853936ddf645`. These are diagnostic examples, not hardcoded application defaults. Future sessions can have different IDs.

The switch is project-specific and only allowed once the previous instance is absent. A known Place ID must match; conflicting project/previous-session identity, an unavailable replacement, or an unresolved operation blocks switching. Unsaved/local places without identity metadata require explicit same-game acknowledgement. Forge cannot prove their identity from a UUID alone; inspect their contents yourself. Reconnect and discovery never silently change a project or run pin.

A confirmation token expires after five minutes, is single-use, and is bound to the previewed work and target metadata. Confirmation rechecks discovery and workspace state. Another target cannot be substituted using the token.

## What happens to queued work

Unfinished matching runs receive the confirmed pin and a new pin revision. Unstarted tasks retain an empty conversation so the normal task/request context is built afresh. Existing structured task context gets the current ID. Unexecuted Studio calls are withdrawn with cancellation results, and their old approvals are cancelled. Pending verification intents are also withdrawn. The model must inspect again and propose new operations with new approvals.

Completed tool results and accepted/cancelled runs remain historical evidence. An audit record preserves the previous state; no global search-and-replace modifies Luau source, human instructions or historical results. Internal delegation and completed tool IDs remain intact to avoid duplicate work. Cached cancelled calls cannot execute after restart. The LangGraph checkpoint stores task/phase state; authoritative selection is read from the persisted run on every turn.

Models no longer choose `studio_id`: that field is removed from model-facing tool schemas, and the worker injects the confirmed run pin. A supplied conflicting ID is still rejected. Native calls record their target and pin revision, and completion/verification evidence is scoped to that revision. Existing completed Tester evidence cannot certify a reopened session; fresh testing is required. Per-Studio locks, stale-inspection protection, role permissions and mutation approvals remain enforced. Explicit Place ID metadata is also checked during execution, including manually configured projects.

## Reset and manual setup

Open **Settings → Reset & manual setup**, pause the team, choose a scope and click **Review reset**. Nothing resets at preview time.

- **Studio connection and instance pins**: type `RESET STUDIO` and confirm. This clears MCP command/arguments and project/unfinished-run pins, withdraws pending Studio calls/approvals, and keeps projects, tasks, completed evidence, API keys and usage. Uncertain operations must be reconciled first. Re-enter the MCP command/arguments in Settings and connect. In Games, choose the unassigned previous target and explicitly confirm the discovered replacement before resuming old work.
- **Everything in Forge Studio**: type `RESET FORGE` and confirm. This clears local projects, runs, task/approval history, memories, assets, personal references, usage and checkpoints, resets agent settings, removes saved API keys and disables environment-key fallback. Official reference guides are restored. The current browser's Forge preferences are cleared. The team remains paused, with no Studio target configured. `.env` and Roblox places are not deleted or modified; provider charges are not undone. Existing recovery backups are retained.

Each reset first creates a private recovery backup under `FORGE_DATA_DIR/backups/reset-<id>/`, including SQLite, checkpoints, saved provider credentials and assets. Backups can contain secrets: they are excluded from Git and must not be shared. A reset fails safely if work changes during the preview/backup. The last backup path is shown in Settings. To restore, stop worker and dashboard, move current database/checkpoint files and their `-wal`, `-shm` and `-journal` sidecars aside, then restore the backup files into the data directory as described in its `restore.txt` before restarting. Do not mix stale SQLite journals with a restored database. Restoring resurrects the saved state; reconcile any uncertain effects before resuming.

After a full reset, manually configure your provider key and **Settings → Roblox Studio connection** executable/JSON arguments. In **Games → Add project**, enter the game name, Studio instance ID, and optional Roblox Place/Universe IDs. These fields configure new work. To reconnect existing work after a connection-only reset, use the confirmed switch flow instead. An ID pasted for new work does not silently retarget another run.

## Verification

Regression coverage uses the two reported IDs and includes preview/no-mutation semantics, explicit confirmation, wrong-game and stale-preview rejection, uncertain-operation blocking, scoped persistence changes, cancellation of old approvals/calls, preserved evidence, fresh verification revisions, actual queued-task binding, private backups, typed reset confirmation, full reset and disabled credential fallback. Existing SDK lifecycle/workflow tests are retained. A focused production-browser check exercises confirmation/cancellation, reset and manual setup against an isolated SDK fixture. No live Roblox Studio on another computer or real provider inference is claimed.

Verified for this change: TypeScript and production build passed; `npm test` passed all **71 tests in 10 files**. Production-browser checks passed manual project metadata, switch cancellation/confirmation, queued-pin updates, old-approval withdrawal, mobile layout, connection reset with preserved work, manual MCP/instance setup, full reset/private backups, removed credentials and browser-console checks. These checks used an isolated real worker/SQLite database and an explicit MCP SDK peer, with no inference requests or live Roblox changes. The browser checks completed in stages: a task-count assertion was corrected to include the fresh Tester task, a legacy textarea locator was corrected, and the remaining checks resumed from the connection-reset checkpoint to avoid repeating completed flows.

For the focused browser check, launch worker and production Next with the same disposable `/tmp/forge-pin-*` data directory, with `tests/mcp-fixture.mjs` as the MCP command's Node script (arguments: output file, `default`, replacement instance ID, `123`), then run `FORGE_DATA_DIR=/tmp/forge-pin-check node scripts/studio-selection-smoke.mjs`. The script checks that the running worker uses the test directory before changing data. Its optional `FORGE_SMOKE_RESUME=connection-reset` mode resumes only after the fixture's connection reset has already completed and validates that checkpoint before proceeding.
