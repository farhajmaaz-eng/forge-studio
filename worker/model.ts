import { randomUUID } from "node:crypto";
import { db, get, set, reserve, event } from "./store";
import { readCompletionStream } from "./stream";
import { providerKey, providerStatus } from "./provider";
import { OperationError } from "./errors";
import { parseOptions, routingSchema, parametersSchema } from "./model-config";
import { nvidiaFreeModelIds } from "../src/lib/model-presets";
export async function refreshModels() {
  const provider = providerStatus();
  const key = providerKey(provider.id);
  const r = await fetch(`${provider.baseUrl}/models`, {
    redirect: "error",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new OperationError(
      `${provider.label} model catalog returned HTTP ${r.status}`,
    );
  const body = await r.json();
  if (!Array.isArray(body.data))
    throw new OperationError("The model catalog response is invalid");
  const ids = body.data
    .filter(
      (m: any) =>
        typeof m.id === "string" &&
        (provider.id !== "nvidia" || nvidiaFreeModelIds.includes(m.id)),
    )
    .map((m: any) => m.id);
  set("modelCatalog", { provider: provider.id, ids, updated: Date.now() });
  if (provider.id === "openrouter") {
    const pricing: Record<string, any> = {};
    for (const m of body.data)
      if (m.pricing)
        pricing[m.id] = {
          prompt: Number(m.pricing.prompt),
          completion: Number(m.pricing.completion),
          context: m.context_length,
          maxOutput: m.top_provider?.max_completion_tokens,
          parameters: m.supported_parameters,
          extras: Object.fromEntries(
            Object.entries(m.pricing).filter(
              ([k]) =>
                ![
                  "prompt",
                  "completion",
                  "input_cache_read",
                  "input_cache_write",
                ].includes(k),
            ),
          ),
        };
    set("pricing", pricing);
    set("pricingUpdated", Date.now());
  }
  return { count: ids.length };
}
export async function completion(
  agent: any,
  t: any,
  messages: any[],
  tools: any[],
  onText?: (text: string) => void,
  signal?: AbortSignal,
) {
  const provider = providerStatus();
  const key = providerKey(provider.id);
  if (!key)
    throw new OperationError(
      `${provider.label} API key is missing. Enter it in Settings → Model provider.`,
    );
  signal?.throwIfAborted();
  const routing = parseOptions(agent.provider_options, routingSchema);
  const parameters = parseOptions(agent.parameters, parametersSchema);
  let providerRouting: any = undefined;
  let id: string;
  let reservationAmount = 0;
  let price: any;
  if (provider.id === "openrouter") {
    price = get<any>("pricing")[agent.model];
    if (
      !price ||
      !price.parameters ||
      Date.now() - (get<number>("pricingUpdated") || 0) > 86400000
    ) {
      await refreshModels();
      price = get<any>("pricing")[agent.model];
    }
    if (!price)
      throw new OperationError(
        `Model ${agent.model} is not in the OpenRouter catalog. Refresh models or choose another model in Team.`,
      );
    if (tools.length && price.parameters && !price.parameters.includes("tools"))
      throw new OperationError(
        `Model ${agent.model} does not advertise tool calling. Choose a tool-capable model.`,
      );
    const selectedParameters = Object.keys(parameters).filter(
      (k) => k !== "reasoning",
    );
    if (parameters.reasoning) selectedParameters.push("reasoning");
    for (const param of selectedParameters)
      if (price.parameters && !price.parameters.includes(param))
        throw new OperationError(
          `Model ${agent.model} does not support parameter ${param}`,
        );
    const context = Math.min(price.context, agent.context_limit || 64000);
    if (price.maxOutput && agent.max_tokens > price.maxOutput)
      throw new OperationError(
        `Maximum output tokens exceed this model's limit (${price.maxOutput})`,
      );
    // UTF-8 bytes plus generous message framing bound tokens conservatively.
    // Never silently discard tool results or split a multi-tool conversation.
    const inputBound =
      Buffer.byteLength(JSON.stringify({ messages, tools }), "utf8") +
      messages.length * 128 +
      512;
    if (inputBound + agent.max_tokens > context)
      throw new OperationError(
        `Conversation exceeds configured context limit (${context}). Raise the context limit or start a narrower follow-up task.`,
      );
    if (Object.values(price.extras || {}).some((v) => Number(v) > 0))
      throw new OperationError(
        "Model has additional non-token charges; choose a token-priced model to preserve the spending limit",
      );
    const promptPrice = routing.max_price?.prompt ?? price.prompt * 1000000;
    const completionPrice =
      routing.max_price?.completion ?? price.completion * 1000000;
    if (
      ![promptPrice, completionPrice, context].every(Number.isFinite) ||
      context <= 0 ||
      promptPrice < 0 ||
      completionPrice < 0
    )
      throw new OperationError(
        "Model pricing or context limit is unavailable or unsafe",
      );
    providerRouting = {
      ...routing,
      max_price: { prompt: promptPrice, completion: completionPrice },
    };
    const amount =
      ((context * Math.max(promptPrice, completionPrice)) / 1000000) * 1.1;
    reservationAmount = amount;
    id = reserve(t.id, agent.name, agent.model, amount);
  } else {
    if (!nvidiaFreeModelIds.includes(agent.model))
      throw new OperationError(
        "This model is not in Forge’s NVIDIA free-endpoint allowlist. Apply the recommended free models in Settings.",
      );
    if (!provider.allowUnpricedNim)
      throw new OperationError(
        "Save NVIDIA free-endpoint settings before starting model calls. Trial usage is tracked in tokens, not invented USD prices.",
      );
    const catalog = get<any>("modelCatalog");
    if (catalog?.provider === "nvidia" && !catalog.ids.includes(agent.model))
      throw new OperationError(
        `Model ${agent.model} is not in the NVIDIA catalog. Apply recommended NIM models in Settings.`,
      );
    id = randomUUID();
    db.prepare(
      "INSERT INTO usage(id,task_id,agent,model,cost,reserved,status,provider) VALUES (?,?,?,?,NULL,0,'pending_unpriced','nvidia')",
    ).run(id, t.id, agent.name, agent.model);
  }
  const nimOptions =
    provider.id !== "nvidia"
      ? {}
      : {
          stream_options: { include_usage: true },
          ...(agent.model.startsWith("moonshotai/kimi-")
            ? { chat_template_kwargs: { thinking: false } }
            : {}),
          ...(agent.model.startsWith("nvidia/nemotron-")
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        };
  let response: Response;
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(agent.timeout_ms || 180000)])
    : AbortSignal.timeout(agent.timeout_ms || 180000);
  // Retry only definitive transient HTTP rejections. Network/stream interruptions
  // may have incurred cost and retain reservations; Studio operations never run here.
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: agent.model,
          messages,
          tools: tools.length ? tools : undefined,
          temperature: agent.temperature,
          max_tokens: agent.max_tokens,
          stream: true,
          ...nimOptions,
          ...parameters,
          ...(provider.id === "openrouter"
            ? { provider: providerRouting }
            : {}),
        }),
        signal: requestSignal,
      });
    } catch {
      db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
      throw new OperationError(
        `${provider.label} connection interrupted or timed out; outcome unknown and reservation retained.`,
        false,
        true,
      );
    }
    if (response.ok) break;
    const status = response.status;
    await response.body?.cancel();
    if (
      provider.id === "openrouter" &&
      [429, 502, 503].includes(status) &&
      attempt < 2
    ) {
      const retry = response.headers.get("retry-after");
      const retryMs = retry
        ? /^\d+(\.\d+)?$/.test(retry)
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now())
        : 0;
      // Respect long Retry-After without tying up a worker indefinitely.
      if (Number.isFinite(retryMs) && retryMs <= 10000) {
        if (status >= 500) {
          // A 5xx may hide a billed generation. Keep that attempt reserved and
          // acquire a separate bound before any retry, preserving both caps.
          db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
          id = reserve(t.id, agent.name, agent.model, reservationAmount);
        }
        const delay = Math.max(
          retryMs,
          500 * 2 ** attempt + Math.floor(Math.random() * 100),
        );
        try {
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              clearTimeout(timer);
              requestSignal.removeEventListener("abort", abort);
            };
            const abort = () => {
              done();
              reject(requestSignal.reason);
            };
            const timer = setTimeout(() => {
              done();
              resolve();
            }, delay);
            requestSignal.addEventListener("abort", abort, { once: true });
            if (requestSignal.aborted) abort();
          });
        } catch {
          db.prepare(
            "UPDATE usage SET status='rejected',reserved=0 WHERE id=?",
          ).run(id);
          throw new OperationError(
            "Model retry cancelled before another request was sent",
          );
        }
        continue;
      }
    }
    db.prepare(
      "UPDATE usage SET reserved=CASE WHEN ?<500 THEN 0 ELSE reserved END,status=? WHERE id=?",
    ).run(status, status < 500 ? "rejected" : "uncertain", id);
    const advice =
      status === 401 || status === 403
        ? "Invalid API key or access denied; configure the server key."
        : status === 402
          ? "Insufficient credits; check OpenRouter credit and key limits."
          : status === 429
            ? "Rate limited; wait for the provider limit to reset."
            : status === 400 || status === 404 || status === 422
              ? "Check model ID, tool support and configured parameters."
              : "Provider unavailable; inspect usage before retrying.";
    throw new OperationError(
      `${provider.label} returned HTTP ${status}. ${advice}`,
      false,
      status >= 500,
    );
  }
  let body: any;
  try {
    body = response.headers.get("content-type")?.includes("text/event-stream")
      ? await readCompletionStream(response, onText, {
          requireUsage: provider.id === "openrouter",
        })
      : await response.json();
  } catch (error) {
    db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw new OperationError(
      `Incomplete provider response; reservation retained. ${error instanceof Error ? error.message : "Invalid response"}`,
      false,
      true,
    );
  }
  const reservedRow: any = db
    .prepare("SELECT reserved FROM usage WHERE id=?")
    .get(id);
  const u = body.usage;
  const validUsage =
    !!u &&
    Number.isFinite(u.prompt_tokens) &&
    u.prompt_tokens >= 0 &&
    Number.isFinite(u.completion_tokens) &&
    u.completion_tokens >= 0 &&
    (u.cost == null || (Number.isFinite(u.cost) && u.cost >= 0));
  if (
    !body.choices?.[0]?.message ||
    (provider.id === "openrouter" && !validUsage)
  ) {
    db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw new OperationError(
      "Incomplete provider response; budget reservation retained.",
    );
  }
  if (provider.id === "nvidia") {
    const cost = validUsage && Number.isFinite(u.cost) ? u.cost : null;
    db.prepare(
      "UPDATE usage SET input_tokens=?,output_tokens=?,cost=?,status=? WHERE id=?",
    ).run(
      validUsage ? u.prompt_tokens : null,
      validUsage ? u.completion_tokens : null,
      cost,
      cost !== null
        ? "reported"
        : validUsage
          ? "unpriced"
          : "usage_unavailable",
      id,
    );
    event(
      `NVIDIA response · ${validUsage ? `${u.prompt_tokens} in / ${u.completion_tokens} out` : "token usage unavailable"} · ${cost === null ? "cost not reported" : `$${cost.toFixed(6)}`}`,
      agent.name,
    );
  } else {
    const cost = Number.isFinite(u.cost)
      ? u.cost
      : u.prompt_tokens * price.prompt + u.completion_tokens * price.completion;
    db.prepare(
      "UPDATE usage SET input_tokens=?,output_tokens=?,cost=?,reserved=0,status=? WHERE id=?",
    ).run(
      u.prompt_tokens,
      u.completion_tokens,
      cost,
      Number.isFinite(u.cost) ? "reported" : "estimated",
      id,
    );
    event(
      `Model response · ${u.prompt_tokens} in / ${u.completion_tokens} out · $${cost.toFixed(6)}`,
      agent.name,
    );
  }
  if (
    provider.id === "openrouter" &&
    Number.isFinite(u.cost) &&
    u.cost > reservedRow.reserved + 0.0000001
  ) {
    set("paused", true);
    event(
      "Provider-reported cost exceeded its reservation; team paused. Inspect usage and provider pricing before continuing.",
      agent.name,
      "error",
    );
  }
  const choice = body.choices[0];
  if (["length", "content_filter", "error"].includes(choice.finish_reason))
    throw new OperationError(
      `Model stopped with ${choice.finish_reason}; no tool from this response was executed. Adjust token limits or the request.`,
    );
  const message = choice.message;
  if (!message.content && !message.tool_calls?.length)
    throw new OperationError(
      "Model returned no answer or tool call. Check reasoning/output-token limits or choose a compatible model.",
    );
  if (
    message.tool_calls &&
    (!Array.isArray(message.tool_calls) || message.tool_calls.length > 100)
  )
    throw new OperationError(
      "Invalid or excessive tool-call batch; no tool from this response was executed",
    );
  const ids = new Set<string>();
  for (const call of message.tool_calls || []) {
    if (
      !call.id ||
      ids.has(call.id) ||
      !call.function?.name ||
      typeof call.function.arguments !== "string"
    )
      throw new OperationError(
        "Malformed or duplicate model tool calls; no tool from this response was executed",
      );
    if (
      messages.some(
        (m) =>
          m.role === "assistant" &&
          m.tool_calls?.some((old: any) => old.id === call.id),
      )
    )
      throw new OperationError(
        "Model reused a previous tool-call ID; no tool from this response was executed",
      );
    ids.add(call.id);
  }
  // Persist opaque reasoning details for multi-turn providers; never publish them.
  return message;
}
