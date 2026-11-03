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
export type StudioInstance = {
  id: string;
  name: string;
  placeId: string;
  universeId: string;
};
export function studioInstances(result: any): StudioInstance[] | null {
  const values: any[] = [result?.structuredContent];
  for (const item of result?.content || [])
    if (item.type === "text") {
      try {
        values.push(
          JSON.parse(item.text.replace(/^```(?:json)?\s*|\s*```$/g, "")),
        );
      } catch {
        /* Unrecognized discovery must never authorize a switch. */
      }
    }
  for (const value of values) {
    const list = Array.isArray(value)
      ? value
      : value?.studios || value?.connected_studios || value?.instances;
    if (!Array.isArray(list)) continue;
    const normalized: StudioInstance[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") return null;
      const id = item.studio_id || item.studioId || item.id;
      if (typeof id !== "string" || !id.trim() || id.length > 200) return null;
      const numeric = (v: any) =>
        v == null || String(v) === "0"
          ? ""
          : /^\d+$/.test(String(v))
            ? String(v)
            : "";
      normalized.push({
        id: id.trim(),
        name:
          typeof item.name === "string"
            ? item.name.slice(0, 200)
            : "Unnamed Studio",
        placeId: numeric(item.place_id ?? item.placeId),
        universeId: numeric(item.universe_id ?? item.universeId),
      });
    }
    if (new Set(normalized.map((x) => x.id)).size !== normalized.length)
      return null;
    return normalized;
  }
  return null;
}
export function studioIds(result: any) {
  return studioInstances(result)?.map((x) => x.id) ?? null;
}
export function modelToolSchema(schema: any) {
  // Selection belongs to the confirmed run, never to model-generated arguments.
  const { studio_id: _pin, ...properties } = schema.properties || {};
  return {
    ...schema,
    properties,
    required: (schema.required || []).filter((x: string) => x !== "studio_id"),
  };
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
  get isConnecting() {
    return this.connecting !== null;
  }
  private clearTools() {
    this.tools = [];
    set("studioTools", []);
    set("studioDiscovery", null);
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
      if (this.tools.some((t) => t.name === "list_roblox_studios"))
        await this.discover().catch((error) =>
          set("studioDiscoveryError", redact(error)),
        );
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
  async discover() {
    const client = this.client;
    if (!client || !this.tools.some((t) => t.name === "list_roblox_studios"))
      throw new StudioCallError(
        "Connect Studio MCP before discovering instances",
      );
    const result = await client.callTool(
      { name: "list_roblox_studios", arguments: {} },
      undefined,
      { timeout: 15000 },
    );
    if (this.client !== client || result.isError)
      throw new StudioCallError(
        "Studio discovery changed or failed. Reconnect and refresh instances.",
      );
    const instances = studioInstances(result);
    if (!instances)
      throw new StudioCallError(
        "Studio returned an unrecognized instance list. Refresh discovery; no target can be switched until it is verified.",
      );
    const discovery = { instances, checkedAt: Date.now() };
    set("studioDiscovery", discovery);
    set("studioDiscoveryError", "");
    const known =
      get<Record<string, StudioInstance>>("studioKnownInstances") || {};
    for (const instance of instances) known[instance.id] = instance;
    set("studioKnownInstances", known);
    return { ...result, ...discovery };
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
        "Tool target differs from the pinned Studio instance. Pause the team and review the project’s Studio connection in Games; reconnecting alone does not switch persisted runs.",
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
      if (t && (t.stop_requested || get("paused")))
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
        if (!ids)
          throw new StudioCallError(
            "Studio discovery is unrecognized; refresh instances before executing work",
          );
        const boundTask = task(owner.split(":")[0]);
        if (boundTask) {
          const project: any = db
            .prepare(
              "SELECT g.* FROM games g JOIN runs r ON r.game_id=g.id WHERE r.id=?",
            )
            .get(boundTask.run_id);
          const target = studioInstances(discovery)?.find(
            (x) => x.id === studioId,
          );
          if (
            target &&
            project?.place_id &&
            project.place_id !== target.placeId
          )
            throw new StudioCallError(
              "The Studio instance does not match this project's Place ID. Open the correct game before executing tools.",
            );
          if (
            target &&
            project?.universe_id &&
            target.universeId &&
            project.universe_id !== target.universeId
          )
            throw new StudioCallError(
              "The Studio instance does not match this project's Universe ID",
            );
        }
        if (!ids.includes(studioId))
          throw new StudioCallError(
            "The pinned Studio instance is no longer available. Pause the team, open Games → Studio connection, and review a switch to the reopened instance. No target will change without your confirmation.",
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
