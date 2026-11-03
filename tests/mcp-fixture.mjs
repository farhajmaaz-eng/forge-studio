// Protocol-only test peer; never loaded by the production worker.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
const file = process.argv[2],
  mode = process.argv[3];
const server = new McpServer({ name: "reliability-fixture", version: "1.0.0" });
const text = (x) => ({ content: [{ type: "text", text: JSON.stringify(x) }] });
let active = 0,
  maxActive = 0,
  count = 0;
server.registerTool("list_roblox_studios", { inputSchema: {} }, async () =>
  text([
    {
      studio_id:
        process.argv[4] || (mode === "stale" ? "new-studio" : "test-studio"),
      name: "Protocol test game",
      place_id: process.argv[5] || undefined,
    },
  ]),
);
server.registerTool(
  mode === "alias" ? "read_script" : "script_read",
  { inputSchema: { studio_id: z.string(), path: z.string() } },
  async ({ path }) => text({ path, source: "verified" }),
);
server.registerTool(
  "multi_edit",
  {
    inputSchema: {
      studio_id: z.string(),
      path: z.string(),
      source: z.string(),
      delay: z.number().optional(),
      fail: z.boolean().optional(),
    },
  },
  async ({ path, source, delay = 30, fail }) => {
    if (fail) return { ...text({ error: "Rejected" }), isError: true };
    active++;
    maxActive = Math.max(active, maxActive);
    count++;
    writeFileSync(file, JSON.stringify({ path, source, count, maxActive }));
    await new Promise((r) => setTimeout(r, delay));
    active--;
    return text({ modified: true, path });
  },
);
server.registerTool(
  "get_studio_state",
  {
    inputSchema: { studio_id: z.string(), disconnect: z.boolean().optional() },
  },
  async ({ disconnect }) => {
    if (disconnect) {
      setTimeout(() => process.exit(0), 5);
      await new Promise(() => {});
    }
    return text({ playing: false });
  },
);
await server.connect(new StdioServerTransport());
