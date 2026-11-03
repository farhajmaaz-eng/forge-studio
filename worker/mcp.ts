import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { db, get, set, event, task } from "./store";
import { permissions, isMutation, type Role } from "../src/lib/roles";
import { OperationError, redact } from "./errors";
export class StudioCallError extends OperationError {}
export function expandEnvironment(
  value: string,
  env: Record<string, string | undefined> = process.env,
) {
  return value.replace(
    /%([^%]+)%|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (match, win, posix) => {
      const name = win || posix;
      const key = Object.keys(env).find(
        (k) => k.toLowerCase() === name.toLowerCase(),
      );
      if (!key || env[key] === undefined)
        throw new StudioCallError(
          `Environment variable ${name} is not set for the MCP worker`,
        );
      return env[key]!;
    },
  );
}
export function studioIds(result: any): string[] | null {
  let value = result.structuredContent;
  if (!value)
    for (const item of result.content || [])
      if (item.type === "text") {
        try {
          value = JSON.parse(item.text);
          break;
        } catch {
          /* Plain-text discovery is displayed to the user. */
        }
      }
  const list = Array.isArray(value)
    ? value
    : value?.studios || value?.connected_studios;
  if (!Array.isArray(list)) return null;
  return list
    .map((x) => x.studio_id || x.studioId || x.id)
    .filter((x) => typeof x === "string");
}
const validator = new AjvJsonSchemaValidator();
const inspectionTools = new Set([
  "script_read",
  "read_script",
  "get_script_source",
  "inspect_instance",
  "search_game_tree",
  "get_instance_tree",
  "get_instance_properties",
]);
const transientControls = new Set([
  "start_stop_play",
  "character_navigation",
  "user_keyboard_input",
  "user_mouse_input",
]);
export class Studio {
  client: Client | null = null;
  transport: StdioClientTransport | null = null;
  tools: any[] = [];
  private connecting: Promise<void> | null = null;
  private nextReconnect = 0;
  private reconnectAttempts = 0;
  private stopped = false;
  private clearTools() {
    this.tools = [];
    set("studioTools", []);
  }
  async connect() {
    if (this.connecting) return this.connecting;
    this.stopped = false;
    this.connecting = this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  private async open() {
    await this.close(false);
    const configured = get<string>("mcpCommand");
    if (!configured) {
      set("studioStatus", "not configured");
      return;
    }
    set("studioStatus", "connecting");
    try {
      const command = expandEnvironment(configured);
      const args = get<string[]>("mcpArgs").map((a) => expandEnvironment(a));
      const client = new Client(
        { name: "forge-studio", version: "1.0.0" },
        {
          listChanged: {
            tools: {
              onChanged: (error, tools) => {
                if (this.client !== client) return;
                if (error) {
                  this.clearTools();
                  event(
                    `Studio tool refresh failed: ${redact(error)}`,
                    "System",
                    "error",
                  );
                } else {
                  this.tools = tools || [];
                  set("studioTools", this.tools);
                }
              },
            },
          },
        },
      );
      const transport = new StdioClientTransport({
        command,
        args,
        stderr: "pipe",
        env: getDefaultEnvironment(),
      });
      // Do not forward API keys to child processes or surface arbitrary stderr.
      transport.stderr?.on("data", (data: Buffer) =>
        event(
          `MCP: ${redact(data.toString()).slice(0, 2000)}`,
          "System",
          "warning",
        ),
      );
      this.client = client;
      this.transport = transport;
      client.onclose = () => {
        if (this.client !== client) return;
        this.client = null;
        this.clearTools();
        set("studioStatus", "disconnected");
        set(
          "studioError",
          "Studio MCP disconnected. Reopen Studio, enable its MCP server and reconnect. Pending writes will not be replayed.",
        );
      };
      client.onerror = (error) =>
        event(`Studio transport: ${redact(error)}`, "System", "error");
      await client.connect(transport, {
        timeout: get<number>("mcpConnectTimeoutMs") || 20000,
      });
      const discovered: any[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools({ cursor }, { timeout: 20000 });
        discovered.push(...page.tools);
        cursor = page.nextCursor;
        if (discovered.length > 2000)
          throw new StudioCallError("Studio advertised too many tools");
      } while (cursor);
      this.tools = discovered;
      set("studioTools", this.tools);
      set("studioStatus", "connected");
      set("studioError", "");
      this.reconnectAttempts = 0;
      event(`Studio connected: ${this.tools.length} tools discovered`);
    } catch (error) {
      await this.close(false);
      this.reconnectAttempts++;
      this.nextReconnect =
        Date.now() +
        Math.min(60000, 2000 * 2 ** Math.min(this.reconnectAttempts, 5));
      const message = `Studio connection failed: ${redact(error)}. Check MCP executable/arguments, enable Studio as MCP server and keep Studio open.`;
      set("studioStatus", "error");
      set("studioError", message);
      event(message, "System", "error");
    }
  }
  async maintain() {
    if (
      !this.stopped &&
      !this.client &&
      !this.connecting &&
      Date.now() >= this.nextReconnect &&
      get("mcpCommand")
    )
      await this.connect();
  }
  async close(stop = true) {
    this.stopped = stop;
    const client = this.client,
      transport = this.transport;
    this.client = null;
    this.transport = null;
    this.clearTools();
    if (client) await client.close().catch(() => {});
    if (transport) await transport.close().catch(() => {});
    if (stop) set("studioStatus", "disconnected");
  }
  available(role: Role) {
    return this.client
      ? this.tools.filter((t) => permissions[role].includes(t.name))
      : [];
  }
  validate(role: Role, name: string, args: any, studioId: string) {
    if (!permissions[role].includes(name))
      throw new StudioCallError(`${role} cannot use ${name}`);
    if (!this.client)
      throw new StudioCallError(
        "Roblox Studio is not connected. Open Studio and use Settings → Connect / reconnect.",
        true,
      );
    const tool = this.tools.find((t) => t.name === name);
    if (!tool)
      throw new StudioCallError(
        `Tool ${name} is not advertised by this Studio. Supported tools for ${role}: ${this.available(
          role,
        )
          .map((t) => t.name)
          .join(", ")}. Use only an advertised alternative and its schema.`,
      );
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new StudioCallError("Tool arguments must be a JSON object");
    if (name !== "list_roblox_studios" && !studioId)
      throw new StudioCallError(
        "Discover and select a Studio instance in Games before running this task",
      );
    if (args.studio_id && args.studio_id !== studioId)
      throw new StudioCallError(
        "Tool target differs from the pinned Studio instance",
      );
    const input =
      name === "list_roblox_studios" ? args : { ...args, studio_id: studioId };
    const checked = validator.getValidator(tool.inputSchema)(input);
    if (!checked.valid)
      throw new StudioCallError(
        `Invalid arguments for ${name}: ${checked.errorMessage}. Follow the advertised tool schema.`,
      );
    return input;
  }
  async call(
    role: Role,
    name: string,
    args: any,
    studioId: string,
    owner: string,
    signal?: AbortSignal,
  ) {
    this.validate(role, name, args, studioId);
    if (
      db
        .prepare(
          "SELECT c.id FROM tool_calls c JOIN tasks t ON t.id=c.task_id JOIN runs r ON r.id=t.run_id WHERE c.status='uncertain' AND r.studio_id=? LIMIT 1",
        )
        .get(studioId)
    )
      throw new StudioCallError(
        "This Studio has an unresolved operation. Reconcile it in Reviews before further calls.",
      );
    const writes = isMutation(name),
      lock = `studio:${studioId}`;
    const deadline = Date.now() + (get<number>("mcpLockTimeoutMs") || 180000);
    const checkStopped = () => {
      signal?.throwIfAborted();
      const taskId = owner.split(":")[0],
        t = task(taskId);
      if (t?.stop_requested || get("paused"))
        throw new StudioCallError(
          "Studio operation cancelled before execution",
        );
    };
    for (;;) {
      checkStopped();
      try {
        db.prepare("INSERT INTO locks VALUES (?,?)").run(lock, owner);
        break;
      } catch (error: any) {
        if (
          error.code !== "SQLITE_CONSTRAINT_PRIMARYKEY" &&
          error.code !== "SQLITE_CONSTRAINT_UNIQUE"
        )
          throw error;
        if (Date.now() > deadline)
          throw new StudioCallError("Timed out waiting for Studio lock", true);
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    let sent = false,
      holdLock = false;
    try {
      checkStopped();
      // Validate again after waiting: a reconnect can change tools and schemas.
      const input = this.validate(role, name, args, studioId),
        client = this.client!;
      if (
        name !== "list_roblox_studios" &&
        this.tools.some((t) => t.name === "list_roblox_studios")
      ) {
        const discovery = await client.callTool(
          { name: "list_roblox_studios", arguments: {} },
          undefined,
          { timeout: 15000, signal },
        );
        if (discovery.isError)
          throw new StudioCallError(
            "Studio discovery failed; rediscover instances in Games",
          );
        const ids = studioIds(discovery);
        if (ids && !ids.includes(studioId))
          throw new StudioCallError(
            "The selected Studio instance is no longer available. Rediscover it in Games and create a new run; existing work stays pinned to its original instance.",
          );
      }
      checkStopped();
      const taskId = owner.split(":")[0];
      const agentTask = task(taskId);
      const revision: any = db
        .prepare("SELECT revision FROM studio_revisions WHERE studio_id=?")
        .get(studioId);
      if (agentTask && writes && !transientControls.has(name)) {
        const inspected: any = db
          .prepare(
            "SELECT revision FROM studio_inspections WHERE task_id=? AND studio_id=?",
          )
          .get(taskId, studioId);
        if (!inspected || inspected.revision !== (revision?.revision || 0))
          throw new StudioCallError(
            "Studio changed after this task's inspection. Reinspect the affected scripts or hierarchy before editing; no operation was sent.",
          );
      }
      if (writes && !transientControls.has(name))
        db.prepare(
          "INSERT INTO studio_revisions(studio_id,revision) VALUES (?,1) ON CONFLICT(studio_id) DO UPDATE SET revision=revision+1",
        ).run(studioId);
      sent = true;
      const result = await client.callTool(
        { name, arguments: input },
        undefined,
        { timeout: get<number>("mcpCallTimeoutMs") || 120000, signal },
      );
      if (result.isError)
        throw new StudioCallError(
          `Studio rejected ${name}: ${redact(JSON.stringify(result.content)).slice(0, 3000)}`,
          false,
          writes,
        );
      if (agentTask && inspectionTools.has(name))
        db.prepare(
          "INSERT INTO studio_inspections(task_id,studio_id,revision) VALUES (?,?,?) ON CONFLICT(task_id,studio_id) DO UPDATE SET revision=excluded.revision",
        ).run(taskId, studioId, revision?.revision || 0);
      // A response confirms only what the tool reports. Verification reads back
      // the exact changed paths separately; never infer a write from model prose.
      event(
        `Studio confirmed ${writes ? "operation" : "inspection"}: ${name}`,
        role,
      );
      set("studioError", "");
      return result;
    } catch (error) {
      const known = error instanceof StudioCallError;
      const failure = known
        ? error
        : new StudioCallError(
            `Studio ${name}: ${redact(error)}`,
            !sent,
            sent && writes,
          );
      holdLock = failure.uncertain;
      set("studioError", failure.message);
      event(failure.message, role, "error");
      throw failure;
    } finally {
      if (!holdLock)
        db.prepare("DELETE FROM locks WHERE name=? AND owner=?").run(
          lock,
          owner,
        );
    }
  }
}
export const studio = new Studio();
