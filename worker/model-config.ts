import { z } from "zod";
export const routingSchema = z
  .object({
    order: z.array(z.string().min(1).max(100)).max(10).optional(),
    only: z.array(z.string().min(1).max(100)).max(10).optional(),
    ignore: z.array(z.string().min(1).max(100)).max(10).optional(),
    allow_fallbacks: z.boolean().default(false),
    require_parameters: z.literal(true).default(true),
    sort: z.enum(["price", "latency", "throughput"]).optional(),
    max_price: z
      .object({
        prompt: z.number().finite().min(0),
        completion: z.number().finite().min(0),
      })
      .optional(),
  })
  .strict();
export const parametersSchema = z
  .object({
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().optional(),
    parallel_tool_calls: z.boolean().optional(),
    stop: z.array(z.string().min(1).max(200)).max(4).optional(),
    reasoning: z
      .object({
        enabled: z.boolean().optional(),
        effort: z
          .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export function parseOptions(value: unknown, schema: z.ZodType<any>) {
  return schema.parse(
    typeof value === "string" ? JSON.parse(value) : value || {},
  );
}
