import { db, get, set, reserve, event } from "./store";
export async function refreshModels() {
  const r = await fetch("https://openrouter.ai/api/v1/models", {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("Cannot fetch OpenRouter pricing");
  const body = await r.json();
  const pricing: Record<string, any> = {};
  for (const m of body.data)
    pricing[m.id] = {
      prompt: Number(m.pricing.prompt),
      completion: Number(m.pricing.completion),
      context: m.context_length,
    };
  set("pricing", pricing);
  set("pricingUpdated", Date.now());
}
export async function completion(
  agent: any,
  t: any,
  messages: any[],
  tools: any[],
) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it to .env and restart the worker.",
    );
  let price = get<any>("pricing")[agent.model];
  if (!price) {
    await refreshModels();
    price = get<any>("pricing")[agent.model];
  }
  if (!price)
    throw new Error(`Model ${agent.model} is not in the OpenRouter catalog.`);
  // Reserve the full context window at the higher input/output price: a conservative
  // upper bound covering tool schemas, tokenization differences and parallel calls.
  const amount = price.context * Math.max(price.prompt, price.completion) * 1.1;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Model pricing is unavailable or unsafe");
  const id = reserve(t.id, agent.name, agent.model, amount);
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Forge Studio",
      },
      body: JSON.stringify({
        model: agent.model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e) {
    db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw e;
  }
  if (!response.ok) {
    const text = await response.text();
    if (response.status < 500)
      db.prepare(
        "UPDATE usage SET reserved=0,status='rejected' WHERE id=?",
      ).run(id);
    else db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 600)}`);
  }
  const body = await response.json();
  const u = body.usage;
  if (!u || !body.choices?.[0]?.message) {
    db.prepare("UPDATE usage SET status='uncertain' WHERE id=?").run(id);
    throw new Error(
      "Incomplete provider response; budget reservation retained.",
    );
  }
  const calculated =
    Number(u.prompt_tokens || 0) * price.prompt +
    Number(u.completion_tokens || 0) * price.completion;
  const cost = Number.isFinite(u.cost) ? u.cost : calculated;
  db.prepare(
    "UPDATE usage SET input_tokens=?,output_tokens=?,cost=?,reserved=0,status=? WHERE id=?",
  ).run(
    u.prompt_tokens || 0,
    u.completion_tokens || 0,
    cost,
    Number.isFinite(u.cost) ? "reported" : "estimated",
    id,
  );
  event(
    `Model response · ${u.prompt_tokens || 0} in / ${u.completion_tokens || 0} out · $${cost.toFixed(6)}`,
    agent.name,
  );
  return body.choices[0].message;
}
