# Roblox Agentic Studio — Complete UI Redesign Specification for Codex

## Mission
Transform the EXISTING Roblox agentic studio web app from its current boxy, Hyprland-inspired appearance into the premium, compact, dark agentic workspace shown in the user's attached reference screenshot. This is a VISUAL AND UX REFACTOR, not a rewrite. Preserve all existing working features, routes, agent orchestration, persistence, APIs, authentication, state, and backend contracts. Use the screenshot as the visual source of truth. Do not assume the screenshot's product names, game content, statistics, or example tasks belong to this app.

**Important:** The screenshot should be made available to Codex in the project workspace (for example `design-reference.png`). If it is not present, use this specification. Inspect the current repository before changing anything.

## 1. Visual Identity and Overall Layout
- Desktop-first, dense but readable, dark SaaS dashboard with a fixed left sidebar and a slim persistent top toolbar.
- Screenshot is approximately 1540 × 960. Left navigation is approximately 232px wide; top toolbar is approximately 88px tall in the content area (the very top includes a narrow window-title strip in the screenshot). Main canvas begins at x≈233.
- Background near-black, not grey. Sidebar slightly differentiated from content. Cards have restrained borders, subtle elevated surfaces, rounded corners and minimal shadows.
- The page should feel like a real operational command center: crisp typography, subtle gradients, tiny status dots, polished spacing, many useful controls, and careful visual hierarchy.
- Avoid Hyprland-like oversized panel outlines, terminal motifs, conspicuous neon borders, giant gaps, hard rectangles, or repetitive heavy boxes.
- Use a coherent 4/8px spacing system and CSS variables/design tokens. Prefer ~12–16px card radii, ~10–12px buttons, ~8–10px small controls. Small sidebar pills may be fully rounded.

## 2. Color Tokens (approximate from screenshot)
Define reusable CSS variables, then tune visually against reference:
```
--app-bg: #090a0f;
--sidebar-bg: #0c0d13;
--toolbar-bg: #0c0d13;
--surface: #12141e;
--surface-raised: #171924;
--surface-hover: #1b1d2a;
--border: #242633;
--border-soft: #1a1c27;
--text-primary: #ececf4;
--text-secondary: #a0a3b5;
--text-muted: #686d82;
--accent: #a68aff;
--accent-strong: #b47cff;
--accent-wash: rgba(164,126,255,.12);
--success: #31d6a0;
--success-wash: rgba(49,214,160,.12);
--warning: #ffc65d;
--danger: #f17c88;
```
Accent usage is restrained: purple for selected navigation and progress, green for live/approval/status, warm orange for media/review types, pink-purple gradient for primary create actions.

## 3. Typography and Density
- Use Inter, Geist, or an equivalent clean sans-serif; load locally or use existing font setup. Main body around 13–14px; sidebar labels 13–14px medium; small metadata 11–12px; section labels 10–11px uppercase with letter spacing; toolbar titles 14px semibold.
- Strong contrast for titles, muted secondary labels, quiet metadata. Avoid large hero headings in working views.
- Preserve truncation and line clamping for long names. Icons ~16–18px, consistent stroke weights (Lucide or existing icon system).

## 4. Sidebar — Exact Structure and Behavior
Fixed left navigation, full viewport height, width about 232px, 1px right border. Scroll internal content if necessary; keep the lower status/utility area accessible.

### Primary navigation at top
- `Home` with house icon, small yellow count badge aligned right if actionable count exists.
- `Lead` with sparkle/star-like icon (could map to orchestrator/lead agent).
- `Team` with group icon and green count pill for active agents.
- `Tasks` with clipboard/list icon and green count pill for active tasks.
- `Review` with overlapping cards/approval icon, selected in screenshot: translucent purple selection fill, thin purple outline, brighter text/icon, grey count badge aligned right.
- Each row ~38–40px tall, ~8px horizontal inset, consistent left icon and label alignment. Hover is subtle, not a full glow.

### Section: STUDIO
Small muted uppercase section label with generous top spacing. Items:
- `Games` with gamepad icon.
- `Pitches` with lightbulb icon and right-aligned muted count.
- `Market` with target/compass icon.
- `Library` with clustered shapes icon.
- `Pro` as a special row: gem icon, soft purple/pink gradient tint, subtle colored border. Adapt to actual subscription/settings capability; do not invent paid entitlements.

### Section: TEAM
- A compact 5-column grid of colorful square agent/avatar tiles, roughly 28–30px each with 7–9px gaps, 3 rows visible in screenshot.
- Tiles use varied muted saturated fills (purple, blue, cyan, orange, mint, yellow, red), centered white outline icons. Some active agents have a green border or tiny live indicator. Hover tooltip with agent name, role, status; click opens agent details/selection if available.
- Agent tile count and ordering MUST be data-driven from the real agent registry; do not hardcode the screenshot's 15 agents.

### Sidebar bottom
- Compact `Plan usage` panel, dark rounded card with top title and percent, two horizontal progress bars, secondary reset/time labels, and a `See all usage` link. Render ONLY when real usage/quota information exists; otherwise use actual available metrics or omit the panel. Never invent quotas or reset times.
- `Help` and `Settings` utility rows with icons.
- Bottom agent-work indicator card: green live dot, `N agents working`, muted context such as `All on this game`, and optional right badge. Bind to real running agent count and active project.
- On shorter screens allow scrolling rather than overlapping or clipping bottom controls.

## 5. Top Toolbar / Breadcrumb Bar
- Content starts to the right of sidebar. Top bar remains visible while content scrolls, height roughly 70–88px depending on app chrome.
- Left side: a compact active-project selector chip with small square project avatar, project title, and a small count pill; adjacent `N need you elsewhere` alert/queue chip; slash separator; current page label (`Review` in screenshot). Use real project and attention counts.
- Right side: small `Live · updated just now` status pill with green dot; `Refresh numbers` action with refresh icon; outlined purple update/version button (only if the app actually supports updates); a vivid pink-to-orange `+ New task` primary button.
- Right buttons should be 30–34px tall, compact, with minimal shadows. Preserve working functionality and disable/omit unsupported actions rather than fake them.
- Narrow screens: compress breadcrumbs, hide secondary button labels, move less important actions into overflow.

## 6. Main Content Canvas and Page Rhythm
- Main background near-black, with an inner max width appropriate for desktop and ~60px side padding in screenshot (content starts around x≈294).
- Use vertical sections separated by ~22–30px, not giant boxed dashboards.
- First content element on Review page: a small project budget/usage card about 290px wide. Title row has icon, project title, `Change` text action; thin purple progress bar; compact caption `$spent of $budget spent on art and sound`. This is EXAMPLE DATA: map to actual budgets if present, otherwise use a meaningful project summary or omit.
- Sections are grouped by review type or task. Each section has a tiny colored icon tile, bold title (e.g. `Packaging`), muted subtitle (`media`, game name, etc.), count near the section's right side, and right-aligned batch actions (`Approve all N`, `Reject all`).
- Review items should be media-forward cards with consistent border and radius, restrained hover elevation, metadata footer, and selection/open interactions.

## 7. Review Page — Detailed Screenshot Mapping
This is the page displayed in the screenshot. Reproduce its component grammar even if app's data differs.

### First review group
- Header row: orange image icon tile (~24px), `Packaging` in bold, `media` muted, count `2`, green outlined `Approve all 2` pill/button at far right, adjacent low-emphasis `Reject all` text action.
- Two large side-by-side media cards, each roughly 388px wide × 333px tall in screenshot.
- Left card shows a contact-sheet-like image of several candidate icons at top with ample dark surface below, and a footer containing a truncated review instruction plus muted file/project reference.
- Right card shows a widescreen promotional image on top, a thin strip of smaller thumbnail variants beneath it, then a footer with truncated instruction and metadata.
- Media images should be contained or covered according to asset type, preserve aspect ratio, use dark fallback placeholders, and never stretch.

### Second review group
- Header: same orange icon tile, `Packaging`, muted project name, count `4`, right aligned `Approve all 4` and `Reject all`.
- Four portrait artwork cards in a single row on a wide desktop screen, each around 188px wide and 220px tall, with image occupying most of card and a dark footer containing image icon and truncated filename/task reference.
- In screenshot the art is stylized wolf/spinning-top game imagery; this is example content ONLY. Use actual Roblox game thumbnails, generated assets, icons, screenshots, or task deliverables from the app.

### Third group, partly visible
- Header with pink screenshot/frame icon, `Frame screenshots`, count `1`.
- Below, screenshot comparison cards. Preserve ability to show before/after visual review if current app supports it.

### Review interaction rules
- Each item opens a detailed review modal/drawer with large preview, task context, agent responsible, iteration/version, creation time, review comments, approve/reject/request-changes controls, and download/open asset where supported.
- Approve/reject buttons must use existing mutation APIs; provide pending states, error handling, confirmation where destructive, success feedback, and refresh/optimistic cache updates.
- `Approve all` / `Reject all` must operate on the actual group and respect backend constraints. Do not merely change UI labels.
- Empty states should show helpful copy and next action; loading states use skeleton cards with matching dimensions.

## 8. Shared Components for Every App View
Build reusable design-system components and migrate all existing pages:
- `AppShell`, `Sidebar`, `SidebarNavItem`, `SectionLabel`, `AgentAvatarTile`, `UsagePanel`, `AgentActivityStatus`.
- `TopBar`, `ProjectSwitcher`, `StatusPill`, `NotificationCount`, `PrimaryButton`, `SecondaryButton`, `IconButton`.
- `PageHeader`, `SectionHeader`, `SurfaceCard`, `MediaReviewCard`, `TaskCard`, `AgentCard`, `ProgressBar`, `EmptyState`, `Skeleton`, `Toast`, `ConfirmDialog`, `DetailDrawer`.
- Apply the screenshot's tokens to Home, Lead, Team, Tasks, Games, Pitches, Market, Library, Settings, and other routes that exist. Adapt each page to its purpose; DO NOT replace them all with the Review page.
- Preserve route-specific data and functionality. A tasks page should show task states and ownership; a team page should show agent roles and activity; a lead page should show orchestration and decisions; a game page should show project-specific resources.

## 9. Remove the Existing Boxy / Hyprland Look
Audit current CSS and components for:
- Hard 0–4px corners, oversized thick borders, visible outlines on every container.
- Excessive terminal/monospace type, blocky grid layouts, high-contrast neon fills and glowing borders.
- Giant dashboard tiles and too much padding; multiple nested boxes for the same piece of information.
- Uniform cards with no hierarchy and unnecessary decorative gradients.
Replace with:
- Thin 1px low-contrast borders, softer surface layering, carefully rounded corners.
- Smaller, calmer buttons; dense well-aligned information; purple only where interaction or selection matters.
- Borderless section grouping where possible; cards mainly for media, content, and actions.
- One consistent icon family and a coherent scale of font weights/sizes.
- Subtle interactive motion, not constant animation.

## 10. Motion and Microinteractions
- Hover transitions 120–180ms for background, border, opacity and slight translation; no distracting spring effects.
- Sidebar selection indicator fades smoothly. Buttons show pressed/disabled/loading states. Media cards get a slight border brightening on hover.
- Live dots may pulse gently only for truly active processes; respect `prefers-reduced-motion`.
- Modal/drawer enter transitions 180–240ms. Skeleton shimmer optional and low contrast.
- Tooltips for icon-only controls and agent tiles.

## 11. Responsiveness
- >=1440px: full sidebar, full toolbar, review media grids (2 large / 4 portrait cards).
- 1024–1439px: sidebar can reduce slightly, review grids auto-fit, avoid clipped actions.
- 768–1023px: collapsible sidebar or icon rail, 2-column media grid, toolbar overflow.
- <768px: off-canvas sidebar, compact header, single-column review cards, touch-friendly targets, no horizontal page overflow.
- Test keyboard navigation, visible focus rings, accessible contrast, semantic headings, button labels, alt text, and dialogs.

## 12. Implementation Plan for Codex
1. Inspect repository: framework, router, styling system, state management, component tree, existing pages, agent/task/review data models and APIs. Identify what already works.
2. Save a baseline and identify relevant tests. Do not overwrite configuration, secrets, API keys, DB migrations, or backend code unnecessarily.
3. Create design tokens, global typography, surface styles, icon sizing, responsive breakpoints, and core primitives.
4. Refactor AppShell/sidebar/topbar to closely match reference. Verify route navigation, counts, agent statuses, project selection, and active state.
5. Refactor Review page with group headers, responsive media grids, approval actions, loading/empty/error states and detail drawer.
6. Apply same visual language to all other existing pages, maintaining their own workflows and information architecture.
7. Audit all interactive controls for real functionality. Do not add fake buttons or hardcoded sample counts, images, balances, agent statuses, or versions.
8. Run lint/typecheck/tests/build; fix errors. Capture desktop and mobile screenshots; visually compare screenshot and tune dimensions, spacing, colors, type, and card aspect ratios.
9. Provide a short summary of changed files, preserved functionality, tests run, and any missing backend features needed for full parity.

## 13. Acceptance Criteria
- At desktop screenshot dimensions, visual feel strongly matches reference: near-black canvas, ~232px left sidebar, narrow top toolbar, compact purple selected row, colored agent tile grid, subtle usage/status panels, clean section headings, media-heavy review grids, green approval controls, pink/orange new-task action.
- No oversized blocky Hyprland styling remains in the main interface.
- No regression in agent orchestration, task creation, task execution, review approvals, navigation, persistence, or project selection.
- Counts, statuses, images, tasks, budgets and usage are real or clearly empty—not invented.
- UI works on tablet/mobile, with accessible interactions and no horizontal overflow.
- Existing product identity and Roblox-specific terminology are preserved where appropriate; screenshot labels are design references, not a mandate to rename features.

## 14. Codex Execution Prompt
**Implement this redesign in the current repository now.** Read this entire specification and inspect the reference image if provided. First inspect the existing app and preserve its architecture and working features. Prioritize high-fidelity recreation of the reference's shell, sidebar, toolbar, card language, and Review page, then apply the same visual system to the remaining pages. Make real code changes, not mockups. Do not replace working functionality with static examples. Run relevant checks and report results plus any limitations.
