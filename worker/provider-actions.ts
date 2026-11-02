import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, set, event } from "./store";
import { providerStatus, saveProvider } from "./provider";
import { completion } from "./model";
import { nvidiaAgentModels } from "../src/lib/model-presets";
export async function providerAction(
  path: string,
  body: unknown,
  active: Set<string>,
) {
  if (!path.startsWith("provider/")) return undefined;
  if (active.size)
    throw new Error(
      "Pause the team and wait for active operations before changing or testing the provider",
    );
  if (path === "provider/save") {
    const result = saveProvider(body);
    if (result.applyRecommended && result.status.id === "nvidia")
      db.transaction(() => {
        for (const [name, preset] of Object.entries(nvidiaAgentModels))
          db.prepare("UPDATE agents SET model=? WHERE name=?").run(
            preset.model,
            name,
          );
      })();
    if (!result.status.configured) set("paused", true);
    event(`Model provider configured: ${result.status.label}`, "User");
    return { ok: true, provider: result.status };
  }
  if (path === "provider/test") {
    z.object({}).parse(body);
    const status = providerStatus();
    const lead: any = db
      .prepare("SELECT * FROM agents WHERE name='Lead'")
      .get();
    const result = await completion(
      { ...lead, max_tokens: 128 },
      { id: `connection-check:${randomUUID()}` },
      [
        {
          role: "system",
          content:
            "Call connection_check with ok=true. Do not call other tools or provide reasoning.",
        },
        {
          role: "user",
          content:
            "Check the configured model connection and tool-call formatting.",
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "connection_check",
            description:
              "A harmless connection check; no operation will be executed.",
            parameters: {
              type: "object",
              properties: { ok: { type: "boolean" } },
              required: ["ok"],
              additionalProperties: false,
            },
          },
        },
      ],
    );
    const tool = result.tool_calls?.find(
      (c: any) => c.function?.name === "connection_check",
    );
    if (!tool || JSON.parse(tool.function.arguments).ok !== true)
      throw new Error(
        "The provider responded, but this model did not return the expected tool call. Choose a tool-capable model in Team.",
      );
    const test = {
      provider: status.id,
      model: lead.model,
      at: new Date().toISOString(),
      status: "passed",
    };
    set("providerTest", test);
    return { ok: true, ...test };
  }
  throw new Error("Unknown provider action");
}
