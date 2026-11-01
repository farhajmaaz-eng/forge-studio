import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { db, get, set, event } from "./store";
import { permissions, isMutation, type Role } from "../src/lib/roles";
export class Studio {
  client: Client | null = null;
  transport: StdioClientTransport | null = null;
  tools: any[] = [];
  async connect() {
    await this.close();
    const command = get<string>("mcpCommand");
    if (!command) {
      set("studioStatus", "not configured");
      return;
    }
    try {
      this.client = new Client({ name: "forge-studio", version: "1.0.0" });
      this.transport = new StdioClientTransport({
        command,
        args: get<string[]>("mcpArgs"),
        stderr: "pipe",
      });
      await this.client.connect(this.transport);
      this.tools = (await this.client.listTools()).tools;
      set("studioTools", this.tools);
      set("studioStatus", "connected");
      event(`Studio connected: ${this.tools.length} tools discovered`);
      this.client.onclose = () => {
        this.client = null;
        set("studioStatus", "disconnected");
      };
    } catch (e) {
      this.client = null;
      set("studioStatus", "error");
      event(`Studio connection failed: ${String(e)}`, "System", "error");
    }
  }
  async close() {
    if (this.client) await this.client.close().catch(() => {});
    if (this.transport) await this.transport.close().catch(() => {});
    this.client = null;
    this.transport = null;
    this.tools = [];
  }
  available(role: Role) {
    return this.tools.filter((t) => permissions[role].includes(t.name));
  }
  async call(
    role: Role,
    name: string,
    args: any,
    studioId: string,
    owner: string,
  ) {
    if (!permissions[role].includes(name))
      throw new Error(`${role} cannot use ${name}`);
    if (!this.client)
      throw new Error(
        "Roblox Studio is not connected. Configure the official MCP command in Settings.",
      );
    const writes = isMutation(name);
    const lock = `studio:${studioId}`;
    // All calls serialize on an active place so a read never observes a partial write.
    const deadline = Date.now() + 180000;
    for (;;) {
      try {
        db.prepare("INSERT INTO locks VALUES (?,?)").run(lock, owner);
        break;
      } catch {
        if (Date.now() > deadline)
          throw new Error("Timed out waiting for Studio lock");
        await new Promise((r) => setTimeout(r, 75));
      }
    }
    try {
      const result = await this.client.callTool(
        {
          name,
          arguments:
            name === "list_roblox_studios"
              ? args
              : { ...args, studio_id: studioId },
        },
        undefined,
        { timeout: 120000 },
      );
      if (result.isError) throw new Error(JSON.stringify(result.content));
      event(`${writes ? "Modified" : "Inspected"} Studio via ${name}`, role);
      return result;
    } finally {
      db.prepare("DELETE FROM locks WHERE name=? AND owner=?").run(lock, owner);
    }
  }
}
export const studio = new Studio();
