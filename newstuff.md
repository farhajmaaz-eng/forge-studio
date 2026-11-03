You are working on Forge Studio, my existing local-first, multi-agent AI Roblox development application.

Your task is to perform a comprehensive audit, fix existing bugs, and migrate our AI provider from NVIDIA NIM to OpenRouter.

IMPORTANT: Do not rebuild the application, replace its architecture unnecessarily, or redesign the UI. Preserve existing functionality and the current interface. Inspect the repository before making changes.

1. Migrate NVIDIA NIM to OpenRouter

We will now use OpenRouter as our primary AI provider instead of NVIDIA NIM.

- Use the OpenAI-compatible API at "https://openrouter.ai/api/v1".
- Read the API key from "OPENROUTER_API_KEY" on the server.
- Never hardcode, log, or expose API keys to the browser.
- Update environment examples, configuration, documentation, and provider settings.
- Remove NVIDIA-specific assumptions and defaults without breaking other supported providers.
- Allow each agent to use a different OpenRouter model.
- Support model IDs, provider routing, timeouts, context limits, output-token limits, and configurable parameters.
- Ensure OpenRouter tool calling, tool responses, and multi-turn conversations work correctly.
- Handle reasoning responses, malformed tool calls, provider errors, rate limits, and model incompatibilities gracefully.
- Implement exponential backoff for transient failures, but do not blindly retry non-idempotent operations.
- Add usage tracking for input tokens, output tokens, estimated API cost, and per-agent spending.
- Allow configurable concurrency and spending limits.
- Do not silently switch to an expensive model or provider.

Use a cheap, tool-capable OpenRouter model as the default, but make all model assignments configurable. Verify model IDs and capabilities rather than assuming they exist.

2. Fix the Roblox Studio MCP integration

Previously, Forge Studio connected to Roblox Studio through the local MCP executable:

- Executable: "cmd.exe"
- Arguments: "["/c", "cd /d %LOCALAPPDATA%\\Roblox && .\\mcp.bat"]"

Audit and repair the entire connection lifecycle.

- Ensure MCP subprocess startup, initialization, tool discovery, calls, timeouts, reconnection, and shutdown work reliably.
- Support Windows paths and environment-variable expansion correctly.
- Detect disconnected, unavailable, or restarted Roblox Studio instances.
- Avoid relying on hardcoded Studio instance IDs.
- Validate tool names and schemas dynamically before invoking them.
- Fix failures involving "script_read" or unsupported MCP operations by checking the actual advertised tool schema and using supported alternatives.
- Never claim a script was read, written, or modified unless the MCP response confirms success.
- Make MCP errors actionable and visible in the UI.
- Avoid duplicate tool executions after retries or connection interruptions.

3. Fix multi-agent orchestration

Forge Studio has seven specialized agents and a task scheduler backed by SQLite.

Audit the existing agent roles and workflows rather than inventing a replacement architecture.

- Ensure the orchestrator delegates tasks to the appropriate agents.
- Prevent duplicate tasks, orphaned tasks, infinite delegation loops, and deadlocks.
- Ensure tasks have clear states, ownership, dependencies, and completion criteria.
- Preserve task history and recover safely after worker restarts.
- Make sure the worker actually processes queued tasks.
- Enforce one active task per agent and configurable global concurrency, initially capped at three.
- Allow parallel planning, analysis, and independent code generation.
- Serialize conflicting Roblox Studio writes and other shared-state mutations.
- Prevent agents from overwriting each other's changes.
- Implement bounded retries, cancellation, timeouts, and meaningful failure reporting.
- Ensure agents share relevant project context without repeatedly sending the entire project.
- Verify completion using actual tool results rather than the model's claims.

4. Fix the agent-to-MCP workflow

Ensure agents can reliably:

- Inspect the Roblox game's structure.
- Read existing scripts and relevant instances.
- Create or modify Luau scripts.
- Create Roblox instances and UI elements.
- Apply changes to the correct services and locations.
- Validate scripts and detect execution errors.
- Inspect test results and correct failures.
- Report exactly what was changed.

Use a plan → inspect → execute → verify workflow.

Avoid destructive operations unless explicitly requested. Prefer targeted edits over replacing entire scripts or hierarchies.

5. Improve reliability and security

Audit the API, backend, worker, database, and frontend integration.

Fix:

- Unhandled exceptions and silent failures.
- Incorrect task status reporting.
- Stale UI state.
- Broken loading and error indicators.
- API request validation problems.
- SQLite concurrency or locking issues.
- Race conditions between workers.
- Inconsistent configuration.
- Secrets accidentally exposed in logs or frontend bundles.
- Missing cleanup for failed or cancelled jobs.

Implement structured logging with sensitive-data redaction and useful error messages.

6. Verify everything

Run the existing test suite and add targeted regression tests for the issues discovered.

At minimum, test:

1. OpenRouter API request and response handling using mocked responses.
2. Tool-calling conversations, including multiple tool calls.
3. Rate limits, invalid API keys, insufficient credits, and provider failures.
4. MCP connection failures, restarts, and unsupported operations.
5. Concurrent agent execution and serialized Studio writes.
6. Task recovery after worker restart.
7. Cancellation, timeouts, and retry behavior.
8. Database migrations and persistence.
9. Frontend task progress and error reporting.

Where possible, run a real end-to-end smoke test with OpenRouter and Roblox Studio. If credentials or a running Studio instance are unavailable, report that clearly rather than claiming success.

7. Deliverables

- Implement the fixes directly in the existing repository.
- Preserve the current UI design.
- Update ".env.example" and relevant documentation.
- Provide clear instructions for configuring the OpenRouter key and starting the app.
- Summarize all changes.
- List the bugs found and how each was fixed.
- Report tests run, passed, failed, and not run.
- Identify any remaining limitations.

Execution instructions: Start by inspecting the actual codebase, tracing the API → scheduler → worker → agent → MCP execution path, and identifying concrete defects. Then implement and test the fixes. Do not stop after writing an audit report or ask for confirmation between routine steps. Do not fabricate successful tests or integrations.

Prioritize correctness, reliability, security, low inference costs, and successful Roblox Studio operations over adding new features.
