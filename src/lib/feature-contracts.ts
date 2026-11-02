import { z } from "zod";
export const priorities = ["Low", "Normal", "High", "Urgent"];
export const gameStages = [
  "concept",
  "prototype",
  "building",
  "testing",
  "ready",
  "launched",
  "archived",
] as const;
export const assetKinds = [
  "image",
  "video",
  "sound",
  "model",
  "ui",
  "script",
  "system",
  "document",
] as const;
export const pitchSections = [
  "difference",
  "howItPlays",
  "firstMinute",
  "shortGoal",
  "progression",
  "economy",
  "socialLoop",
  "cadence",
  "mvp",
  "risks",
] as const;
export const sectionTitles: Record<string, string> = {
  difference: "How we’re different",
  howItPlays: "How it plays",
  firstMinute: "The first 60 seconds",
  shortGoal: "The 5–15 minute goal",
  progression: "20+ minute progression",
  economy: "Economy & monetization",
  socialLoop: "Social loop",
  cadence: "Content cadence",
  mvp: "MVP scope",
  risks: "Risks & validation",
};
export const metricDefinitions = {
  dau: { label: "Daily active users", unit: "players", group: "Players" },
  online: { label: "Players online", unit: "players", group: "Players" },
  revenue: { label: "Revenue earned", unit: "Robux", group: "Charts" },
  spent: { label: "Robux spent", unit: "Robux", group: "Charts" },
  first_minute: {
    label: "First-minute retention",
    unit: "%",
    group: "Sessions / Retention",
  },
  session: {
    label: "Session time",
    unit: "minutes",
    group: "Sessions / Retention",
  },
  playtime: {
    label: "Playtime per daily user",
    unit: "minutes",
    group: "Sessions / Retention",
  },
} as const;
export const webUrl = z
  .string()
  .max(2000)
  .refine(
    (s) => !s || /^https?:\/\/[^\s]+$/i.test(s),
    "Use an http(s) source URL",
  );
export const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine(
    (s) => Date.parse(s) <= Date.now() + 60000,
    "Observation time cannot be in the future",
  )
  .transform((s) => new Date(s).toISOString());
export const evidenceSchema = z.object({
  snapshotId: z.string(),
  universeId: z.string(),
});
export const pitchSchema = z.object({
  id: z.string().optional(),
  expectedVersion: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(5).max(1000),
  genre: z.string().max(80).default(""),
  tags: z.array(z.string().max(40)).max(15).default([]),
  confidence: z
    .enum(["unvalidated", "researching", "validated"])
    .default("unvalidated"),
  origin: z.enum(["user", "agent"]).default("user"),
  sections: z.record(z.string(), z.string().max(12000)).default({}),
  evidence: z.array(evidenceSchema).max(20).default([]),
  gameId: z
    .string()
    .nullish()
    .transform((value) => value || undefined),
});
export const marketSchema = z
  .object({
    source: webUrl.refine((s) => !!s, "Provide the original data source"),
    fetchedAt: timestamp,
    quality: z.enum(["exported", "sampled", "estimated"]),
    category: z.string().trim().min(1).max(100),
    games: z
      .array(
        z
          .object({
            universeId: z.string().regex(/^\d+$/),
            title: z.string().trim().min(1).max(200),
            genre: z.string().max(80).default(""),
            description: z.string().max(3000).default(""),
            rank: z.number().int().positive().optional(),
            players: z.number().int().nonnegative().optional(),
            likes: z.number().int().nonnegative().optional(),
            votes: z.number().int().nonnegative().optional(),
            visits: z.number().int().nonnegative().optional(),
            url: webUrl.default(""),
          })
          .refine(
            (g) =>
              g.likes === undefined ||
              g.votes === undefined ||
              g.likes <= g.votes,
            "Likes cannot exceed votes",
          ),
      )
      .min(1)
      .max(2000),
  })
  .refine(
    (s) => new Set(s.games.map((g) => g.universeId)).size === s.games.length,
    "Duplicate universe IDs in snapshot",
  );
export const telemetrySchema = z
  .object({
    gameId: z.string().min(1),
    source: webUrl.refine((s) => !!s, "Provide the export source"),
    fetchedAt: timestamp,
    quality: z.enum(["exported", "sampled", "estimated"]),
    metrics: z
      .array(
        z.object({
          metric: z.enum(
            Object.keys(metricDefinitions) as [
              keyof typeof metricDefinitions,
              ...(keyof typeof metricDefinitions)[],
            ],
          ),
          points: z
            .array(
              z.object({
                at: timestamp,
                value: z.number().finite().nonnegative(),
                series: z.string().max(80).default("All players"),
              }),
            )
            .min(1)
            .max(2000),
        }),
      )
      .min(1)
      .max(7),
  })
  .superRefine((s, ctx) => {
    const seen = new Set<string>();
    for (const m of s.metrics)
      for (const p of m.points) {
        const key = `${m.metric}:${p.series}:${p.at}`;
        if (seen.has(key))
          ctx.addIssue({
            code: "custom",
            message: "Duplicate metric observations",
          });
        seen.add(key);
        if (Date.parse(p.at) > Date.parse(s.fetchedAt))
          ctx.addIssue({
            code: "custom",
            message: "Metric observations must precede collection time",
          });
        if (m.metric === "first_minute" && p.value > 100)
          ctx.addIssue({
            code: "custom",
            message: "Retention must be a percentage from 0 to 100",
          });
      }
  });
export function operationRisk(tool: string) {
  return /publish/i.test(tool)
    ? "publication"
    : /generate_(mesh|material|procedural)|purchase|paid/i.test(tool)
      ? "paid operation"
      : /delete|destroy|remove_asset/i.test(tool)
        ? "destructive operation"
        : null;
}
export function gameForTask(data: any, task: any) {
  const run = data.runs.find((r: any) => r.id === task.run_id);
  return data.games.find((g: any) => g.id === run?.game_id);
}
export function displayDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(
    /Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "Z",
  );
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}
export type MarketSnapshot = z.infer<typeof marketSchema> & { id: string };
export type Pitch = z.infer<typeof pitchSchema> & {
  id: string;
  status: string;
  version: number;
  created: string;
  updated: string;
};
export type TelemetrySnapshot = z.infer<typeof telemetrySchema> & {
  id: string;
};
