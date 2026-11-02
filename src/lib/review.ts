import { operationRisk } from "./feature-contracts";
export function parsePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function formatPayload(value: unknown): string {
  const parsed = parsePayload(value);
  return typeof parsed === "string"
    ? parsed
    : JSON.stringify(parsed, null, 2) || "No details recorded.";
}

// Only explicit image deliverables are previews. Script source and arbitrary URLs
// inside tool arguments must remain inspectable text, never inferred artwork.
export function reviewImages(payload: unknown): string[] {
  const images = new Set<string>();
  function add(value: unknown) {
    if (typeof value !== "string") return;
    if (
      /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(
        value,
      ) ||
      /^https?:\/\/[^\s<>]+$/i.test(value) ||
      /^\/(?!\/)[^\s<>]+$/.test(value)
    )
      images.add(value);
  }
  function walk(value: unknown, depth = 0) {
    if (depth > 8 || images.size >= 8) return;
    if (typeof value === "string") {
      const parsed = parsePayload(value);
      if (parsed !== value) {
        walk(parsed, depth + 1);
        return;
      }
      for (const match of value.matchAll(/!\[[^\]]*\]\(([^\s)]+)\)/g))
        add(match[1]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (
      item.type === "image" &&
      typeof item.mimeType === "string" &&
      typeof item.data === "string"
    )
      add(`data:${item.mimeType};base64,${item.data}`);
    for (const [key, child] of Object.entries(item)) {
      if (
        ["image", "image_url", "imageUrl", "thumbnail", "screenshot"].includes(
          key,
        )
      ) {
        add(
          typeof child === "object" && child
            ? (child as Record<string, unknown>).url
            : child,
        );
      } else if (
        key === "url" &&
        typeof child === "string" &&
        /\.(png|jpe?g|webp|gif)([?#].*)?$/i.test(child)
      )
        add(child);
      if (
        typeof child === "object" ||
        ["content", "result", "text"].includes(key)
      )
        walk(child, depth + 1);
    }
  }
  walk(payload);
  return [...images].slice(0, 8);
}

export function approvalGroups(data: any) {
  const groups = new Map<
    string,
    { id: string; title: string; subtitle: string; items: any[] }
  >();
  for (const approval of data.approvals || []) {
    if (approval.status !== "pending") continue;
    const task = data.tasks.find((t: any) => t.id === approval.task_id);
    const run = data.runs.find((r: any) => r.id === task?.run_id);
    const game = data.games.find((g: any) => g.id === run?.game_id);
    const media = /image|asset|mesh|material/.test(approval.tool);
    const id = `${run?.game_id || "workspace"}:${task?.agent || "Agent"}:${media ? "assets" : "studio"}:${operationRisk(approval.tool) || "ordinary"}`;
    if (!groups.has(id))
      groups.set(id, {
        id,
        title: media ? "Asset changes" : "Studio changes",
        subtitle:
          [game?.name, task?.agent].filter(Boolean).join(" · ") || "Workspace",
        items: [],
      });
    groups.get(id)!.items.push(approval);
  }
  return [...groups.values()];
}
