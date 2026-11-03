import { providerKey } from "./provider";
export class OperationError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function redact(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const key of [
    process.env.OPENROUTER_API_KEY,
    process.env.NVIDIA_API_KEY,
    safeKey("openrouter"),
    safeKey("nvidia"),
  ])
    if (key) text = text.split(key).join("[REDACTED]");
  return text
    .replace(/\b(?:sk-or-v1-|nvapi-)[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}
function safeKey(id: "openrouter" | "nvidia") {
  try {
    return providerKey(id);
  } catch {
    return "";
  }
}
export function publicData(value: any): any {
  const keys = [
    process.env.OPENROUTER_API_KEY,
    process.env.NVIDIA_API_KEY,
    safeKey("openrouter"),
    safeKey("nvidia"),
  ].filter(Boolean) as string[];
  function walk(v: any): any {
    if (typeof v === "string") {
      for (const key of keys) v = v.split(key).join("[REDACTED]");
      return v
        .replace(/\b(?:sk-or-v1-|nvapi-)[A-Za-z0-9._-]+/g, "[REDACTED]")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, walk(x)]),
      );
    return v;
  }
  return walk(value);
}
