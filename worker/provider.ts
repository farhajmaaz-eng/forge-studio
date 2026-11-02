import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { nvidiaAgentModels } from "../src/lib/model-presets";
export type ProviderId = "nvidia" | "openrouter";
type SavedProvider = {
  provider: ProviderId;
  keys: Partial<Record<ProviderId, string | null>>;
  allowUnpricedNim: boolean;
};
const schema = z.object({
  provider: z.enum(["nvidia", "openrouter"]),
  keys: z.object({
    nvidia: z.string().nullable().optional(),
    openrouter: z.string().nullable().optional(),
  }),
  allowUnpricedNim: z.boolean().default(false),
});
function location() {
  return resolve(
    process.env.FORGE_DATA_DIR || ".data",
    "provider-credentials.json",
  );
}
function saved(): SavedProvider {
  const path = location();
  if (existsSync(path))
    return schema.parse(JSON.parse(readFileSync(path, "utf8")));
  return {
    provider:
      process.env.MODEL_PROVIDER === "openrouter" ? "openrouter" : "nvidia",
    keys: {},
    allowUnpricedNim: process.env.NVIDIA_TOKEN_ONLY === "true",
  };
}
export function providerKey(id: ProviderId = providerStatus().id) {
  const config = saved();
  return Object.hasOwn(config.keys, id)
    ? config.keys[id] || ""
    : (id === "nvidia"
        ? process.env.NVIDIA_API_KEY
        : process.env.OPENROUTER_API_KEY) || "";
}
export function providerStatus() {
  const config = saved();
  const id = config.provider;
  const key = Object.hasOwn(config.keys, id)
    ? config.keys[id] || ""
    : (id === "nvidia"
        ? process.env.NVIDIA_API_KEY
        : process.env.OPENROUTER_API_KEY) || "";
  return {
    id,
    label: id === "nvidia" ? "NVIDIA NIM · free endpoints" : "OpenRouter",
    freeOnly: id === "nvidia",
    configured: !!key,
    keySource: !key
      ? "none"
      : Object.hasOwn(config.keys, id)
        ? "saved"
        : "environment",
    allowUnpricedNim: config.allowUnpricedNim,
    costTracking: id === "nvidia" ? "token-only" : "priced",
    baseUrl:
      id === "nvidia"
        ? "https://integrate.api.nvidia.com/v1"
        : "https://openrouter.ai/api/v1",
  };
}
export function defaultAgentModel(name: string) {
  return providerStatus().id === "nvidia"
    ? nvidiaAgentModels[name as keyof typeof nvidiaAgentModels]?.model ||
        nvidiaAgentModels.Lead.model
    : process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4.1-flash";
}
export function saveProvider(body: unknown) {
  const a = z
    .object({
      provider: z.literal("nvidia"),
      apiKey: z
        .string()
        .trim()
        .max(512)
        .regex(/^[A-Za-z0-9._-]*$/, "Use a valid provider API key")
        .default(""),
      removeKey: z.boolean().default(false),
      allowUnpricedNim: z.boolean().default(true),
      applyRecommended: z.boolean().default(false),
    })
    .parse(body);
  if (a.apiKey && a.apiKey.length < 16)
    throw new Error("The API key is too short");
  if (a.apiKey && a.removeKey)
    throw new Error("Choose either a replacement key or removal");
  const config = saved();
  config.provider = a.provider;
  config.allowUnpricedNim = a.allowUnpricedNim;
  if (a.removeKey) config.keys[a.provider] = null;
  else if (a.apiKey) config.keys[a.provider] = a.apiKey;
  const dir = resolve(process.env.FORGE_DATA_DIR || ".data");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = resolve(dir, `provider-credentials.${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  renameSync(tmp, location());
  chmodSync(location(), 0o600);
  return { applyRecommended: a.applyRecommended, status: providerStatus() };
}
