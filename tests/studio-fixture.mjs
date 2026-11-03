// Test-only protocol peer: never loaded by the application runtime.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const server = new McpServer({ name: "fixture-studio", version: "1.0.0" });
const text = (x) => ({ content: [{ type: "text", text: JSON.stringify(x) }] });
server.registerTool("list_roblox_studios", { inputSchema: {} }, async () =>
  text([{ studio_id: "test-studio", name: "Protocol fixture" }]),
);
server.registerTool(
  "multi_edit",
  { inputSchema: { studio_id: z.string(), source: z.string() } },
  async ({ source }) => {
    writeFileSync(process.argv[2], source);
    return text({ modified: true });
  },
);
server.registerTool(
  "script_read",
  { inputSchema: { studio_id: z.string() } },
  async () =>
    text({
      exists: existsSync(process.argv[2]),
      source: existsSync(process.argv[2])
        ? readFileSync(process.argv[2], "utf8")
        : "",
    }),
);
server.registerTool(
  "start_stop_play",
  { inputSchema: { studio_id: z.string(), start: z.boolean() } },
  async ({ start }) => text({ playing: start }),
);
server.registerTool(
  "get_console_output",
  { inputSchema: { studio_id: z.string() } },
  async () =>
    text({
      output: readFileSync(process.argv[2], "utf8").includes("Checkpoint")
        ? "PASS Checkpoint exists"
        : "FAIL",
    }),
);
await server.connect(new StdioServerTransport());
