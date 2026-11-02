import { randomUUID } from "node:crypto";
import { db, get, set, reserve, event } from "./store";
import { readCompletionStream } from "./stream";
import { providerKey, providerStatus } from "./provider";
import { nvidiaFreeModelIds } from "../src/lib/model-presets";
export async function refreshModels() {
  const provider = providerStatus();
  const key = providerKey(provider.id);
  const r = await fetch(`${provider.baseUrl}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new Error(
      `${provider.label} model catalog returned HTTP ${r.status}`,
    );
  const body = await r.json();
  if (!Array.isArray(body.data))
    throw new Error("The model catalog response is invalid");
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
) {
  const provider = providerStatus();
  const key = providerKey(provider.id);
  if (!key)
    throw new Error(
      `${provider.label} API key is missing. Enter it in Settings → Model provider.`,
    );
  let id: string;
  let price: any;
  if (provider.id === "openrouter") {
    price = get<any>("pricing")[agent.model];
    if (!price) {
      await refreshModels();
      price = get<any>("pricing")[agent.model];
    }
    if (!price)
      throw new Error(`Model ${agent.model} is not in the OpenRouter catalog.`);
    const amount =
      price.context * Math.max(price.prompt, price.completion) * 1.1;
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Model pricing is unavailable or unsafe");
    id = reserve(t.id, agent.name, agent.model, amount);
  } else {
    if (!nvidiaFreeModelIds.includes(agent.model))
      throw new Error(
        "This model is not in Forge’s NVIDIA free-endpoint allowlist. Apply the recommended free models in Settings.",
      );
    if (!provider.allowUnpricedNim)
      throw new Error(
        "Save NVIDIA free-endpoint settings before starting model calls. Trial usage is tracked in tokens, not invented USD prices.",
      );
    const catalog = get<any>("modelCatalog");
    if (catalog?.provider === "nvidia" && !catalog.ids.includes(agent.model))
      throw new Error(
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
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
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
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw new Error(
      `${provider.label} request did not complete. Its outcome is unknown.`,
    );
  }
  if (!response.ok) {
    db.prepare(
      "UPDATE usage SET reserved=CASE WHEN ?<500 THEN 0 ELSE reserved END,status=? WHERE id=?",
    ).run(
      response.status,
      response.status < 500 ? "rejected" : "uncertain",
      id,
    );
    throw new Error(
      `${provider.label} returned HTTP ${response.status}. Check the API key, model access, and provider limits.`,
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
    throw error;
  }
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
    throw new Error(
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
  return body.choices[0].message;
}
