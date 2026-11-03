"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { DetailDrawer } from "./ui/workspace-primitives";
import { type Act } from "./feature-ui";
export default function WorkspaceReset({
  data,
  act,
  busy,
}: {
  data: any;
  act: Act;
  busy: boolean;
}) {
  const [scope, setScope] = useState("connection"),
    [preview, setPreview] = useState<any>(null),
    [phrase, setPhrase] = useState(""),
    [result, setResult] = useState("");
  const running = data.tasks.some((t: any) => t.status === "running");
  return (
    <section className="panel form spaced">
      <h3>Reset & manual setup</h3>
      <p>
        Reset the Studio connection to enter the MCP command and instance ID
        again, or reset all Forge workspace data. Resetting Forge never changes
        your Roblox place.
      </p>
      {!data.settings.paused && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void act("pause", { paused: true })}
        >
          Pause team before reset
        </Button>
      )}
      <label>
        Reset scope
        <select
          aria-label="Reset scope"
          value={scope}
          disabled={busy}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="connection">
            Studio connection and instance pins
          </option>
          <option value="everything">Everything in Forge Studio</option>
        </select>
      </label>
      <small>
        {scope === "connection"
          ? "Clears MCP command/arguments and project/run instance pins. Keeps projects, tasks, history, provider keys and budgets. Reconnect and approve a replacement in Games before resuming."
          : "Clears projects, runs, tasks, approvals, history, assets, personal references, memories, checkpoints, usage and saved API keys; restores default agents/settings. Environment files stay on disk, with API-key fallback disabled until you enter a replacement."}
      </small>
      <Button
        variant="destructive"
        disabled={busy || running || !data.settings.paused}
        onClick={async () => {
          const out = await act("workspace/reset/preview", { scope });
          if (out) {
            setPhrase("");
            setPreview(out);
          }
        }}
      >
        Review reset
      </Button>
      {data.settings.lastResetBackup && (
        <small>
          Last private recovery backup: {data.settings.lastResetBackup}
        </small>
      )}
      {result && <p role="status">{result}</p>}
      {preview && (
        <DetailDrawer
          title={
            preview.scope === "everything"
              ? "Reset everything in Forge?"
              : "Reset Studio connection?"
          }
          close={() => setPreview(null)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const out = await act("workspace/reset/confirm", {
                token: preview.token,
                confirmation: phrase,
              });
              if (out) {
                setPreview(null);
                setResult(
                  `Reset complete. Private recovery backup: ${out.backup}. Configure your MCP connection in Settings, then add or link the instance in Games.`,
                );
                if (out.scope === "everything") {
                  for (const key of Object.keys(localStorage))
                    if (key.startsWith("forge-")) localStorage.removeItem(key);
                  location.assign("/");
                }
              }
            }}
          >
            <p>
              {preview.counts.games} projects · {preview.counts.runs} runs ·{" "}
              {preview.counts.tasks} tasks · {preview.counts.assets} assets.
            </p>
            <p>
              {preview.scope === "everything"
                ? "All local Forge work, user references, settings and saved keys will be reset."
                : "MCP settings and instance pins will be cleared; pending Studio calls and approvals will be cancelled. Work history and API keys are retained."}{" "}
              A private backup is created before changing data. It can contain
              API keys; do not commit or share it.
            </p>
            <p>
              {preview.uncertainOperations} uncertain operations. Reset does not
              undo Studio changes, cancel provider charges, or reset your
              provider account. The team stays paused.
            </p>
            <label>
              Type {preview.phrase} to confirm
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <Button
              variant="destructive"
              disabled={busy || phrase !== preview.phrase}
            >
              Confirm reset
            </Button>
          </form>
        </DetailDrawer>
      )}
    </section>
  );
}
