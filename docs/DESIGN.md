# Forge Studio design

Forge is a compact workspace for Roblox development, based on `design-reference.png` and the requirements in `ROBLOX_STUDIO_UI_REDESIGN.md`. The interface uses a near-black canvas, a 232px navigation sidebar, a persistent 76px project toolbar, restrained purple selection, green approval controls, and a pink-to-orange primary action. Locally bundled Geist provides the interface typography; monospace is reserved for code and exact tool arguments.

Shared tokens in `src/app/globals.css` define surfaces, text, borders, status colors, spacing, and radii. Graphite and Evergreen retain their persisted preference keys and adjust the accent within the same visual system. The default palette retains the `nord` preference key for compatibility with saved settings. Comfortable density and focus mode continue to work.

`WorkspaceShell` owns shared navigation and toolbar presentation. Navigation counts, agent tiles, active agents, projects, connection status, and spending all come from the existing snapshot. The budget card displays actual workspace API spending and reservations; it does not imply a subscription or a per-project media budget. Unsupported reference features such as Pitches, Market, Pro, and app updates are omitted.

The sidebar scrolls independently when its contents exceed the available height. Tablet widths use an icon rail, and phones use a native modal navigation drawer with keyboard dismissal and focus management. The main canvas scrolls beneath the persistent toolbar. Each of the nine existing views retains its own purpose and controls.

## Reviews

Pending tool approvals are grouped by game, agent, and change category. Code changes display their actual arguments; explicit image deliverables display media previews. Two-card media groups and compact four-card asset groups follow the reference's visual grammar. No example art or production data is seeded to fill the gallery.

The detail drawer exposes task context, ownership, attempt count, timestamps, complete arguments or results, and links to tasks and available images. Existing run acceptance, revision feedback, and uncertain-operation reconciliation remain available. Approved runs remain visible in review history.

Individual and batch approval actions use the existing endpoints. Batch decisions are sequential because the backend accepts one approval per request. On failure, processing stops, already recorded decisions remain recorded, the error is surfaced, and the remaining items stay reviewable. Rejections require a confirmation dialog; canceling it sends no mutation. Worker-side validation remains authoritative if an item changes during review.

V2 extends the existing design with a local asset/system catalog, immutable pitch versions, persistent verdict notes/history, and linked artifact revisions. Previews support explicit image and video deliverables; missing media falls back to inspectable output. Market and LiveOps use source-attributed imports until an external data adapter is configured. See [the V2 audit](FEATURE_AUDIT_V2.md) for implementation and verification details.

## Preserved controls

- Ctrl/Cmd+K opens page, agent, and task search.
- Alt+1…9 preserves the established workspace order: Home, Lead, Team, Tasks, Games, Review, Library, Activity, Settings.
- Alt+F toggles focus mode; `?` opens keyboard shortcuts.
- Escape closes native dialogs, restoring keyboard focus.
- Settings retains model configuration, Studio connection, spending limits, approval policy, density, and themes.
- Diagnostics exports remain local and exclude credentials, prompts, messages, and tool arguments.

Snapshots, WebSocket updates, polling, orchestration, persistence, task dependencies, retries, and backend APIs retain their existing contracts. UI tests use an isolated worker data directory or browser-intercepted fixtures; populated review fixtures never enter the production database.

## Verification

Run `npm run build`, `npm run typecheck`, and `npm test`. With the local web app and worker running, `scripts/ui-smoke.mjs`, `scripts/desktop-smoke.mjs`, and `scripts/library-smoke.mjs` check existing routes and workflows. `scripts/redesign-smoke.mjs` adds populated media reviews, partial batch failures, confirmation cancellation, individual decisions, revision feedback, run acceptance, uncertain-operation recovery, mobile navigation, and responsive widths from 320px to 1540px. It captures review screenshots under `artifacts/`; those populated screenshots use browser-only fixtures.
