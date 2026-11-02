# Forge Studio — Feature Expansion & UI Specification V2

> Implementation brief for Codex. Use alongside `ROBLOX_STUDIO_UI_REDESIGN.md` and `design-reference.png`. This document is an **extension**, not a replacement. The supplied screenshots depict a reference product; adapt its patterns to Forge Studio's identity, architecture, and capabilities. Do not copy its name, logos, or sample data.

## 0. Non-negotiable workflow

1. Inspect the repository: package manifests, routes, components, design tokens, database schema, migrations, API endpoints, agent orchestration, background jobs, integration adapters, tests and README.
2. Produce a concise **feature audit**: `implemented`, `partial`, `missing`, `blocked by credentials/external APIs`, with file paths and evidence. Do not assume a feature is absent merely because its UI is not visible.
3. Reuse and improve existing components and services. Avoid duplicated routes, parallel state stores, duplicate database tables, or replacement of working functionality.
4. Implement in dependency order: shared shell/design system → data contracts → navigation/pages → functional interactions → integrations → tests.
5. Preserve existing backend, agent tools, OpenRouter configuration, prompts, project data, user settings, and workflows. Never overwrite user data or hardcode API keys.
6. Every visible button, filter, tab, badge, counter and status must have a meaningful behavior or clearly marked disabled/coming-soon state. Never present synthetic data as live data.
7. If Roblox APIs, Studio plugins, publishing permissions, telemetry, or market datasets are unavailable, implement an honest integration interface and useful empty states. Do not fabricate charts, rankings, playtime, approvals, or game assets.
8. Finish with a summary of changes, audit table, commands run, test results, unresolved limitations, and required configuration.

## 1. Visual system — apply consistently across the whole application

Reference images show a **dense but polished dark creative operations console**, not a typical Hyprland desktop imitation.

- App canvas: near-black charcoal (`#090A0F` to `#0D0E14`); elevated panels around `#12141D` to `#191B27`; hairline borders in muted violet/gray. These are suggested starting tokens, not sampled exact values.
- Sidebar: persistent narrow left rail (~220–240px desktop) with icon+label navigation, subtle selected-row lavender fill and border, section labels, small count pills, and agent avatar/status grid. Avoid heavy boxed outlines around every item.
- Header: compact sticky top bar; current project/game switcher, breadcrumbs/page title, live/last-updated indicator, refresh action, gradient **New task** primary button. No unnecessary window-manager title bars in web UI.
- Typography: clean UI sans, clear hierarchy, restrained uppercase micro-labels, compact readable body copy, muted secondary text; prioritize contrast and legibility over tiny screenshot-scale text.
- Geometry: rounded cards (~10–14px), consistent 8px spacing rhythm, thin separators, soft shadows only where useful; no giant floating panels, excessive neon glows, or thick Hyprland-style borders.
- Accent system: violet/lavender for navigation and primary actions; teal/green for active/approved; amber for pending/warning; red for rejected/failed; blue for queued/info. Agent colors should remain stable across pages.
- Buttons: primary gradient sparingly; secondary charcoal outline; approval green; destructive red; disabled clearly muted. Hover, pressed, keyboard focus, and loading states are required.
- Layout: sidebar + scrollable content; main content max-width where useful; desktop cards in 2–3 columns; responsive 1-column tablet/mobile; collapsible sidebar/drawer on small screens; sticky actions where appropriate.
- Media cards: aspect-ratio-preserving images/videos with dark overlays for captions, clear metadata, rounded corners, accessible lightbox/fullscreen preview.
- Motion: subtle 120–220ms transitions; no motion-heavy effects; honor `prefers-reduced-motion`.
- Global affordances: search/quick-jump with keyboard shortcut (e.g. Ctrl/Cmd+K), toasts, skeleton loading, helpful empty/error states, tooltips, consistent icons, accessible dialogs and confirmation for destructive actions.
- Maintain Forge Studio branding. The screenshots' sample game names, metrics, agents, labels and account names are illustrative, **not** content to insert.

## 2. Navigation / information architecture

Suggested left rail:

**WORKSPACE**: Home, Lead, Team, Tasks, Review

**STUDIO**: Games (including LiveOps), Pitches, Market, Library

**BOTTOM**: Usage/plan, Help, Settings

Place the team agent icon grid in the rail only if it is useful and connected to actual agent status. Use route-based active navigation, preserve deep links, and show count badges derived from real state (needs-attention, working agents, queued tasks, pending reviews). Avoid redundant pages if an existing route already serves the same purpose.

## 3. Home — command dashboard

Reference: screenshot headed `Home`.

- Friendly heading with project/user context, last sync time and live-status chip (only when truly live).
- Compact KPI chips: tasks requiring attention, working agents, pending reviews, active game, usage/budget where available.
- Primary natural-language task composer: input, send/assign, optional selected game, new task and pause-all actions. `Pause all` requires confirmation and must actually pause supported agent jobs.
- **Needs you** feed: actionable cards for approvals, questions, blockers and decisions, showing source agent, project, short description, age, priority and action buttons. Support resolve/open/details.
- **Up next**: small real-time or polled agent queue with statuses, progress and links to tasks.
- **Where each game is**: per-game summaries with lifecycle stage, latest task/review, launch status and optional live metrics. Provide create/select game affordances.
- The dashboard is an aggregation of actual task, agent, review and game records; do not create disconnected demo state.

## 4. Lead — orchestrator chat and planning

Reference: screenshot headed `The Team` indicates lead-generated instructions to subagents.

- Lead agent chat with persistent project-scoped conversation history, streaming responses, markdown/code rendering, attachments if already supported, timestamps, retry/cancel.
- Show the lead's plan and agent delegation: task title, intended assignee, dependencies, expected artifact, acceptance criteria and estimated budget if available.
- Allow user to approve/adjust a plan before expensive or irreversible actions, and see tool activity and task progress.
- Display clearly whether instructions came from the user, lead agent, or a subagent. Keep agent reasoning private; show concise action summaries, not hidden chain-of-thought.
- Provide escalation to human review for risky changes, publication, asset deletion and spending thresholds.

## 5. Team — agent roster + conversations

Reference: screenshot headed `The Team`.

- Two-pane desktop layout: searchable agent roster on left, selected agent conversation/work panel on right.
- Each row: colorful role icon/avatar, name, specialization, short current action, working/idle/blocked/failed status, optional task count and last update.
- Suggested roles, **only if supported by architecture**: Lead, Builder, Frame/visual QA, Scenic, Balance, Pulse/analytics, Architect, Playtest, QA/Tester, Splash/assets, Producer, Lineage/research, Merchant/monetization, Reviewer. Roles are examples, not a mandate to spawn 14 LLM processes.
- Selected agent: chat/transcript, assigned task, tool calls, outputs/artifacts, start/stop/retry, relevant permissions and message composer if agent messaging is supported.
- Lead agent should be able to dispatch work to specialized agents via existing orchestration, with dependency tracking and state transitions. Avoid merely drawing a roster with fake activity.
- Sidebar mini-grid should mirror this real roster and status.

## 6. Tasks — execution queue

Reference: screenshot headed `Tasks`.

- Distinct sections for **Working now**, **Queued**, and optionally **Completed/Failed/Blocked** (collapsible history).
- Dense horizontal task rows: agent icon, task title, game/project, requester, brief description, created/updated time, status chip, progress indicator when measurable, chevron to details.
- Task details: objective, owner, priority, dependencies, input context, artifacts, logs, retries, approvals, timestamps and failure reason.
- New task flow: project, objective, optional assignee, priority, dependencies, acceptance criteria. Agent assignment may be automatic via Lead.
- Actions: pause/resume, cancel, retry failed, reassign, change priority (only when backend supports them). Confirm destructive actions.
- Status model: queued → running → awaiting_review/blocked → completed; plus failed/cancelled. Define valid transitions and synchronize UI with backend.
- Search, filters, sorting, pagination or virtualized lists for larger queues.

## 7. Review / Approvals — media-first human-in-the-loop

References: screenshots headed `Review page` and `Approvals` plus the earlier large Review screenshot.

- Review gallery: responsive 3-column desktop thumbnail grid (1–2 columns on smaller screens); image/video media, project and task name, creator/agent, time, pending/approved/rejected badge, quick-open action.
- Review detail: large media viewer on left with playback, image zoom, carousel/next/previous, fullscreen, filename and item counter; sticky context/action panel on right.
- Context panel: producing agent, source task, requested decision, description of changes, evidence, before/after comparison if available, reviewer comments and status history.
- Human verdict actions: **Approve**, **Ask for changes**, **Reject**; optional notes textbox. Asking for changes should create a real revision request routed to the producing agent and linked to the original item.
- Bulk approve/reject for homogeneous pending items with confirmation and clear counts. Never apply to already-decided items silently.
- Optimistic updates only with rollback on API failure. Show pending submission state and audit log (who, what, when, notes).
- Explicit gate: external publishing, paid actions and destructive changes require appropriate user authorization; review approval does not automatically imply publish permission.

## 8. Games + LiveOps analytics

Reference: screenshot headed `LiveOps`.

- Game switcher and per-game overview, project lifecycle, Roblox universe/place identifiers if connected, build status, agent tasks and reviews.
- Tabs: Overview, Charts, Players, Sessions/Retention, Trends, Benchmarks, Fixes & Reports (adapt to available data).
- Charts suggested by screenshot: daily active users, players online, Robux/revenue spent or earned where authorized, first-minute retention/drop-off, session time and playtime per daily user.
- Date range selectors, legends, axes, units, comparison periods, refresh timestamp and empty/error states. Distinguish sampled, delayed, estimated and live data.
- If official Roblox telemetry/API access is unavailable, show connection instructions and integration status rather than inventing values. Secure credentials server-side.
- Surface insights as recommendations with evidence and optional tasks, not ungrounded claims.

## 9. Market — research and opportunity discovery

Reference: screenshot headed `Market Analysis that finds breakout game ideas and alterations`.

- Tabs for Roblox charts, comparable games, benchmarks, breakouts/opportunities.
- Filter chips for trending, up-and-coming, top-playing, growth, visits, genre and time window as supported.
- Data table with rank, title, players, likes/ratio, visits, velocity, source and fetched-at time; sortable and searchable.
- A source-status banner should explain provenance, refresh cadence, API limits and incomplete snapshots. Distinguish scraped data from verified APIs and obey platform terms/rate limits.
- Comparable-game detail with differentiators, game loop, monetization observations and links to source data.
- Generate **pitch candidates** from market evidence, explicitly labeling AI inference versus observed metrics.
- Do not imply access to proprietary analytics or claim real-time rankings without a genuine feed.

## 10. Pitches — game concepts with evidence

Reference: screenshot headed `Game pitches and WHY`.

- Pitch overview hero: concept title, one-sentence hook, genre/tags, confidence/validation state, concise visual identity.
- **How we're different** section: core differentiator, comparable games and rationale.
- KPI/market evidence strip: rank/players/likes/competitors only when sourced; show source, collection date and uncertainty.
- Structured design document: how it plays, first 60 seconds, 5–15 minute goal, 20+ minute progression, economy, social loop, content cadence, MVP scope and risks.
- Decision actions: accept pitch, request revision, archive, convert to game/project and create implementation tasks.
- Store versioned pitch data and link it to market research, tasks and games.

## 11. Library — reusable game assets

Reference: screenshot headed `Manage your asset Library`.

- Tabs: Assets and Systems; search field, asset-type chips (models/icons/sounds/UI/scripts etc.), project scope selector, sort and grid/list switch if useful.
- Grid cards with thumbnail, asset name, type, game association, source/import status, asset ID and usage/license metadata when available.
- Asset detail: larger preview, metadata, tags, dependencies, where used, revision history, download/export or insert/reference action as technically supported.
- Upload/import flow with file type validation, size limits, safe storage and error handling; never treat arbitrary user files as executable code.
- Reusable systems catalogue: modules/components, compatibility, dependency metadata and install/reference workflow.
- Roblox asset IDs and links should be real; no fake IDs or auto-upload promises without authorized integration.

## 12. Cross-feature data architecture

Prefer existing persistence. If missing, design minimal entities or compatible extensions for:

- `projects/games`: id, displayName, Roblox identifiers (optional), state, timestamps.
- `agents`: id, role, displayName, status, activeTaskId, heartbeat.
- `tasks`: id, projectId, ownerAgentId, parentTaskId, status, priority, description, acceptanceCriteria, progress, timestamps, error.
- `agent_messages/events`: taskId/conversationId, actor, message, tool/action summary, timestamp.
- `reviews`: id, taskId, projectId, artifactIds, status, reviewer, note, decision timestamps and revision linkage.
- `artifacts/assets`: id, projectId, taskId, media type, safe path/URL, provenance, tags, source identifiers.
- `market_snapshots`: source, fetchedAt, data freshness, normalized metrics and provenance.
- `pitches`: projectId (optional), content sections, evidence refs, status, version.
- `telemetry_snapshots`: gameId, metric, timestamp, units, source, quality.

Implement validated API contracts, migrations and authorization boundaries. Use server-side secret handling, job cancellation, deduplication/idempotency for approvals and tasks, resilient polling or events, and safe handling of generated media. Avoid unnecessary new dependencies.

## 13. Reference-image mapping

The uploaded reference images are screenshots of a Discord discussion containing smaller desktop UI screenshots. **Ignore the Discord chrome** (phone status bar, channel name, messages, timestamps, bottom overlay). Reconstruct only the embedded app UI.

- `11354.jpg`: Review gallery; LiveOps charts; market page header.
- `11356.jpg`: Market analytics table; asset library; pitch overview.
- `11358.jpg`: Pitch detail; team roster + agent chat; Home/Tasks preview.
- `11360.jpg`: Home dashboard; Tasks execution queue; approvals preview.
- `11362.jpg`: Tasks queue; full review/approval detail with large video and right-hand verdict panel.
- `design-reference.png`: Primary high-resolution visual baseline for overall shell, sidebar, cards and review layout.

Prioritize `design-reference.png` for colors, spacing and component polish; use the other five images for **page structure and functionality**. Do not reproduce blurry unreadable text, screenshot-specific sample names, or Discord elements.

## 14. Implementation milestones / acceptance criteria

### Phase A — audit and foundations
- Inspect codebase; create a concise gap report; identify the existing design system and data flows.
- Centralize tokens and common components (AppShell, Sidebar, Topbar, StatusChip, AgentAvatar, TaskRow, MediaCard, ReviewViewer, EmptyState, ChartPanel).
- Confirm route structure and keyboard/accessibility behavior.

### Phase B — core workflow
- Wire Home, Lead/Team, Tasks and Review to actual backend state.
- Verify a task can be created → assigned → run → produce an artifact → enter review → be approved or sent back for changes.
- Handle refresh, disconnect, retries, empty states, failures and permission checks.

### Phase C — studio intelligence
- Add Games/LiveOps, Market, Pitches and Library using real available data and clear integration placeholders for unsupported sources.
- Ensure project scope and cross-links are consistent.

### Phase D — visual QA and tests
- Compare screenshots at desktop (~1440px), tablet (~768px), mobile (~390px) if browser screenshot tooling is available.
- Check overflow, image crop, typography, sidebar selection, hover/focus, status contrast, loading skeletons, modal stacking, empty states and reduced motion.
- Run formatter, typecheck, lint, unit tests, build and any relevant integration tests. Fix regressions rather than suppressing failures.

**Definition of done:** Functional navigation, no fake live data, no dead controls, no regressions in agent orchestration, accessible/responsive UI, traceable approvals, working task lifecycle, honest external integration states, and documented remaining gaps.

## 15. Suggested prompt to start Codex

> Read `ROBLOX_STUDIO_UI_REDESIGN.md` and `FORGE_STUDIO_FEATURES_AND_UI_V2.md`. Inspect `design-reference.png` and the five `1135*.jpg`/`1136*.jpg` screenshots. Audit the existing Forge Studio repo first and identify which features already exist, which are partial, and which are missing. Then implement the missing functionality and unify the UI to match the references, keeping Forge Studio branding and all current agent/backend integrations. Do not add mock live metrics or nonfunctional buttons. Work incrementally, validate each phase, run tests/build, and report changes and blockers.
