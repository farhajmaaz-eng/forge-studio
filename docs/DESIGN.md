# Forge desktop workspace

## Direction

Forge is an operator’s workspace for Roblox development. The visual reference is a configured Linux desktop: Hyprland’s tiled work areas and numbered workspaces, Waybar’s compact status modules, and KDE’s application conventions. It is still a web application; no decorative close, minimize, CPU, RAM or network meters pretend to control or measure the host desktop.

The default is Nord: blue-gray surfaces, cyan selection, muted green success, amber attention and red failures. Graphite and Evergreen offer the same hierarchy with different palettes. Appearance and density are local browser preferences, independent of API credentials and runtime settings.

## Research and interpretation

- [KDE: Layout and navigation](https://develop.kde.org/hig/layout_and_nav/) describes logical grouping, consistent spacing and layouts that adapt when windows are narrow. Forge uses a small spacing scale, contextual toolbars, a global navigation pane and secondary runtime panes that stack on narrow screens. This is inspiration, not a claim of native KDE compliance.
- [KDE: Communicating status changes](https://develop.kde.org/hig/status_changes/) calls for sparing color, actionable errors and avoiding unnecessary notifications. Forge keeps neutral surfaces, labels every state, distinguishes failed actions from successful saves, and exposes connection setup and failed tasks directly.
- [KDE: Text and labels](https://develop.kde.org/hig/text_and_labels/) informed the plain control labels and concise copy.
- [Waybar configuration](https://github.com/Alexays/Waybar/wiki/Configuration) provides a reference for compact workspace and status modules. Forge’s numbered links navigate actual pages. The clock is the browser’s local time; worker status comes from the worker heartbeat.
- [Joshua Snoddy: Why AI-generated websites look the same](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/) identifies repeated purple gradients, glass panels, interchangeable component layouts and generic icon use as a recognizable pattern. These are design opinions, not a scientific classifier or proof of authorship. The useful response here is specific product decisions rather than chasing a detector score.

## Changes from the previous UI

- Replaced promotional headings and taglines with page names and operational descriptions.
- Replaced the homepage’s ornamental cards with a request editor, a real task queue, review/recovery links, agent states, registered places and a connection summary.
- Replaced library cards with a document index, preserving search, bookmarks and source attribution.
- Removed gradient primary buttons, glass effects, glowing avatars, arbitrary pill styling and oversized empty-state illustrations. Color now mostly communicates selection, authority or state.
- Added named surface, border, text and state tokens. Themes use the same component rules; the stylesheet does not stack another theme’s overrides on top of the old design.
- Added a bundled monospace font for IDs, timestamps, states and status modules. Ordinary reading text remains proportional.
- Retained reduced-motion support, keyboard focus outlines, control labels, non-color state labels and mobile layouts. Added a skip-to-content link.

## Useful controls

- **Ctrl/Cmd+K:** search pages, agents and tasks. Task results open the matching task inspector.
- **Alt+1…9:** switch pages in sidebar order.
- **Alt+F:** toggle focus mode, hiding navigation.
- **?:** show keyboard shortcuts.
- **Escape:** dismiss the current native dialog.

Navigation and focus shortcuts are disabled while editing text or while a dialog is open. These shortcuts are available through visible controls as well; some browser or desktop environments may reserve a shortcut first.

Settings → Workspace appearance controls the color scheme, density and focus preference. The top bar’s palette button cycles color schemes. Density adjusts row and pane spacing without changing the underlying task data.

Download diagnostics produces a local JSON file with connection flags, model names, task counts and budget totals. It deliberately selects those fields; it does not export the full snapshot, API keys, prompts, messages, game names, reference text or tool arguments. Nothing is uploaded.

## Live update payloads

Dashboard snapshots now omit the complete provider pricing catalog and agent conversation transcripts. Those remain persisted and available to the worker; the UI uses task metadata, results, model names and usage totals. This avoids transferring and parsing unused catalog and conversation text on every live refresh. The regression test verifies that dashboard payloads omit these fields while worker storage retains them.
