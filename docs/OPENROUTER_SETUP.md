# OpenRouter setup and migration

Forge keeps its existing interface, seven agents, SQLite scheduler, approval workflow and official Roblox MCP integration. OpenRouter is now the primary provider at `https://openrouter.ai/api/v1`. NVIDIA remains an optional explicitly selected secondary provider.

## Start on your Studio computer

1. Run `git pull origin main` and `npm ci` using Node.js 22 or later. Do not copy Linux `node_modules` to Windows; SQLite is a native dependency.
2. Copy `.env.example` to `.env`. On Windows: `Copy-Item .env.example .env` in PowerShell. Set `MODEL_PROVIDER=openrouter` and `OPENROUTER_API_KEY` to your own key. Never commit `.env`.
3. Enable **Studio → Assistant → Manage MCP Servers → Enable Studio as MCP server**. Keep a place open. The worker must run on that same Windows/macOS computer.
4. On Windows use `ROBLOX_MCP_COMMAND=cmd.exe` with `ROBLOX_MCP_ARGS=["/c","cd /d %LOCALAPPDATA%\\Roblox && .\\mcp.bat"]`. On macOS use `/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP` and `[]`. Environment variables are expanded on the worker, preserving argument boundaries.
5. Run `npm run worker` and, in another terminal, `npm run dev`. Or use `npm run local`. For production run `npm run build` then `npm run start` alongside the worker.
6. Open `http://127.0.0.1:3000`. In Settings select **OpenRouter**, keep **Apply recommended models** checked, and save. If the server environment key is configured, leave the input blank. Optional manually entered keys are stored only in `FORGE_DATA_DIR/provider-credentials.json` with owner-only permissions; they are never returned to the browser. A blank save retains a saved key. A saved key takes precedence over the environment. Remove key disables environment fallback for that provider until a replacement is entered.
7. Use **Test saved connection** for one short inference request that checks tool-call formatting without executing a tool. It may incur a small model charge. Saving a key alone does not test it.
8. Settings → **Connect / reconnect**, then Games → **Discover Studios**. Select the actual returned Studio ID. Runs retain their pinned target; restarting Studio may require rediscovering the new ID and starting a new run. Forge never silently redirects old work to a new Studio.

Existing persisted MCP settings take precedence over `.env`; edit them in Settings when changing command or arguments. Existing provider selections made in the new settings are retained, so explicitly choose OpenRouter when switching an installation previously configured for NVIDIA. Old unversioned NVIDIA settings migrate to OpenRouter unless `MODEL_PROVIDER=nvidia` explicitly requests the secondary adapter. Known built-in NVIDIA model assignments migrate without replacing prompts. Custom assignments remain available for deliberate reconfiguration.

## Model selection and limits

The default for all seven agents is `deepseek/deepseek-v4.1-flash`. Its ID, tool support, context window and prices were checked against the [public OpenRouter catalog](https://openrouter.ai/api/v1/models) on 2026-11-03. The observed token prices were $0.045 per million input tokens and $0.50 per million output tokens; prices and availability can change. This is a cost-oriented default, not a benchmark claim. Each agent can use a different model ID in Team. Saving validates catalog membership and tool support. Inference rechecks capabilities and refreshes catalog metadata older than a day.

Team → **Model routing, limits & parameters** exposes a conservative context limit (default 64,000), output-token limit, request timeout (1–300 seconds), lifetime per-agent spending limit (0 inherits the workspace cap), provider routing and generation parameters. Output must fit both the configured context limit and the actual model maximum. Oversized conversations fail with an actionable error instead of discarding tool messages. Dependencies, private memory and large tool outputs are bounded; full tool evidence stays in SQLite and media evidence in Assets. Text-only models receive a placeholder for large binary evidence.

Routing JSON accepts `order`, `only`, `ignore`, `allow_fallbacks`, `require_parameters`, `sort`, and `max_price`. By default provider fallback is false, parameter support is required, and endpoint price ceilings equal the model catalog prices. `max_price.prompt` and `max_price.completion` use USD per million tokens. Explicitly enabling provider fallback stays within the same model and configured price ceilings. There is no model fallback or expensive-model substitution. See [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

Generation JSON accepts `top_p`, `frequency_penalty`, `presence_penalty`, `seed`, `stop`, `parallel_tool_calls`, and a `reasoning` object with `enabled`/`effort`. Unknown options, custom API URLs and credential fields are rejected. Opaque reasoning details are persisted only for model conversation continuity and never shown as public agent messages. See [tool-calling conversations](https://openrouter.ai/docs/guides/features/tool-calling).

Workspace settings expose concurrency from one to three agents, a per-execution task timeout, a model-step limit and a USD cap. One agent never runs two tasks simultaneously. Shared Studio reads and writes serialize per pinned instance. A content change invalidates other tasks’ previous inspections, so they must reread before writing; Forge will not apply a stale edit from another agent. Changes made outside Forge still require appropriate targeted server-side edits and independent verification. Completed tool calls are cached by durable IDs. Ambiguous writes hold their lock and block that Studio until reconciled in Reviews; they are never automatically replayed.

## Failure handling

Invalid keys/access (401/403), insufficient credits (402), invalid models/parameters, truncated answers and incompatible tools produce actionable failures without automatic model switching or repeated inference. Definitive transient 429/502/503 responses get at most two retries with exponential backoff and short `Retry-After` support. Longer rate limits fail visibly. Interrupted connections/streams keep their dollar reservation because cost may already have been incurred; no automatic generation retry follows an ambiguous outcome. Every HTTP 5xx attempt remains conservatively reserved even if a later retry succeeds; each retry must acquire another reservation before it can run. See [OpenRouter errors](https://openrouter.ai/docs/api_reference/errors-and-debugging).

Removing a key pauses the team. Cancellation interrupts inference and lock waits; an already-sent mutation may finish or become uncertain, and requires inspection rather than replay. Task errors, Studio connection errors, retry attempts and progress appear in the existing dashboard. Logs use structured records with secret redaction. Only one worker can own a data directory, even if different ports are configured.

A valid configured key and live Roblox Studio are required for an actual end-to-end run. Automated tests use mocked inference and an SDK protocol fixture; those are not a live Roblox playtest.
