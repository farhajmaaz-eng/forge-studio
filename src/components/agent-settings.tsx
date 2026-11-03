"use client";
import { Button } from "./ui/button";
import { Avatar } from "./agent-avatar";
export default function AgentForm({
  agent: a,
  busy,
  save,
}: {
  agent: any;
  busy: boolean;
  save: (b: any) => void;
}) {
  return (
    <form
      className="panel form spaced"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const json = (name: string) => {
          try {
            return JSON.parse(String(f.get(name) || "{}"));
          } catch {
            throw new Error(`${name} must be a JSON object`);
          }
        };
        try {
          const parameters = json("parameters"),
            provider_options = json("provider_options");
          save({
            name: a.name,
            model: f.get("model"),
            temperature: Number(f.get("temperature")),
            max_tokens: Number(f.get("max_tokens")),
            enabled: f.get("enabled") === "on",
            prompt: f.get("prompt"),
            timeout_ms: Number(f.get("timeout_ms")),
            context_limit: Number(f.get("context_limit")),
            spending_limit: Number(f.get("spending_limit")),
            parameters,
            provider_options,
          });
        } catch (error) {
          e.currentTarget
            .querySelector<HTMLTextAreaElement>("[name=parameters]")
            ?.setCustomValidity(String(error));
          e.currentTarget.reportValidity();
        }
      }}
    >
      <h3>
        <Avatar name={a.name} size="mini" />
        {a.name} configuration
      </h3>
      <div className="form-grid">
        <label>
          Model ID
          <input name="model" required maxLength={200} defaultValue={a.model} />
        </label>
        <label>
          Temperature
          <input
            name="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            defaultValue={a.temperature}
          />
        </label>
        <label>
          Maximum output tokens
          <input
            name="max_tokens"
            type="number"
            min="128"
            max="1000000"
            defaultValue={a.max_tokens}
          />
        </label>
      </div>
      <details>
        <summary>Model routing, limits & parameters</summary>
        <div className="form">
          <label>
            Context limit (tokens)
            <input
              name="context_limit"
              type="number"
              min="1024"
              max="2000000"
              defaultValue={a.context_limit || 64000}
            />
          </label>
          <label>
            Request timeout (milliseconds)
            <input
              name="timeout_ms"
              type="number"
              min="1000"
              max="300000"
              defaultValue={a.timeout_ms || 180000}
            />
          </label>
          <label>
            Agent spending limit (USD; 0 inherits workspace limit)
            <input
              name="spending_limit"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              defaultValue={a.spending_limit || 0}
            />
          </label>
          <label>
            OpenRouter provider routing (JSON)
            <textarea
              name="provider_options"
              rows={3}
              defaultValue={a.provider_options || "{}"}
              onChange={(e) => {
                e.target.setCustomValidity("");
                e.currentTarget.form
                  ?.querySelector<HTMLTextAreaElement>("[name=parameters]")
                  ?.setCustomValidity("");
              }}
            />
          </label>
          <small>
            Example:{" "}
            {`{ "order": ["deepinfra"], "allow_fallbacks": false, "require_parameters": true }`}
            . Provider fallback is disabled by default; no model fallback is
            used. Optional max_price values are USD per million tokens.
          </small>
          <label>
            Model parameters (JSON)
            <textarea
              name="parameters"
              rows={3}
              defaultValue={a.parameters || "{}"}
              onChange={(e) => e.target.setCustomValidity("")}
            />
          </label>
          <small>
            Supported fields: top_p, frequency_penalty, presence_penalty, seed,
            stop, parallel_tool_calls, reasoning. Model compatibility is checked
            before inference.
          </small>
        </div>
      </details>
      <label>
        Independent system prompt
        <textarea name="prompt" rows={4} defaultValue={a.prompt} required />
      </label>
      <label className="checkbox">
        <input type="checkbox" name="enabled" defaultChecked={!!a.enabled} />{" "}
        Agent enabled
      </label>
      <Button disabled={busy}>Save agent settings</Button>
    </form>
  );
}
