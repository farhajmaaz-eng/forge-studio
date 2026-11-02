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
        save({
          name: a.name,
          model: f.get("model"),
          temperature: Number(f.get("temperature")),
          max_tokens: Number(f.get("max_tokens")),
          enabled: f.get("enabled") === "on",
          prompt: f.get("prompt"),
        });
      }}
    >
      <h3>
        <Avatar name={a.name} size="mini" />
        {a.name} configuration
      </h3>
      <div className="form-grid">
        <label>
          OpenRouter model ID
          <input name="model" defaultValue={a.model} required />
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
            min="256"
            max="16000"
            defaultValue={a.max_tokens}
          />
        </label>
      </div>
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
