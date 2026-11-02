"use client";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { nvidiaAgentModels } from "@/lib/model-presets";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/workspace-primitives";
import { StatusChip, type Act } from "./feature-ui";
export default function ProviderSettings({
  data,
  act,
  busy,
}: {
  data: any;
  act: Act;
  busy: boolean;
}) {
  const active = data.provider || {
    id: "nvidia",
    label: "NVIDIA NIM",
    configured: false,
  };
  const provider = "nvidia";
  const [apiKey, setApiKey] = useState(""),
    [showKey, setShowKey] = useState(false),
    [recommended, setRecommended] = useState(true),
    [remove, setRemove] = useState(false),
    [result, setResult] = useState("");
  const working = data.tasks.some((t: any) => t.status === "running");
  const disabled = busy || working;
  return (
    <section className="panel form">
      <h3>
        <KeyRound size={17} />
        Model provider
      </h3>
      <StatusChip
        status={active.configured ? "configured" : "not configured"}
      />
      <small>
        Active: {active.label}
        {active.configured
          ? ` · ${active.keySource === "environment" ? "environment key" : "locally saved key"}`
          : " · no API key"}
      </small>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setResult("");
          const out = await act("provider/save", {
            provider,
            apiKey,
            allowUnpricedNim: true,
            applyRecommended: provider === "nvidia" && recommended,
          });
          if (out) {
            setApiKey("");
            setShowKey(false);
            setResult(
              "Provider saved. The key stays on this installation’s server.",
            );
          }
        }}
      >
        <p>
          NVIDIA free hosted endpoints only. No paid partner endpoint or
          paid-provider fallback is used. Trial availability and limits are
          managed by NVIDIA.
        </p>
        <label>
          API key
          <div className="v2-provider-key">
            <input
              aria-label="Provider API key"
              name="apiKey"
              type={showKey ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              disabled={disabled}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                active.id === provider && active.configured
                  ? "Leave blank to keep the saved key"
                  : "Enter your own API key"
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((v) => !v)}
              disabled={disabled}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </div>
        </label>
        <small>
          The saved key is never sent back to the browser or included in
          snapshots and diagnostics. Enter a key separately on each
          installation.
        </small>
        {provider === "nvidia" && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={recommended}
                disabled={disabled}
                onChange={(e) => setRecommended(e.target.checked)}
              />
              Apply recommended models to all seven agents
            </label>
            <small>
              Calls use the free-endpoint allowlist and track actual token
              usage. Forge does not invent dollar prices or quota balances.
            </small>
          </>
        )}
        {working && (
          <p className="warning-text">
            Pause the team and let current operations finish before changing
            providers.
          </p>
        )}
        <Button disabled={disabled}>
          {busy ? "Saving…" : "Save provider"}
        </Button>
      </form>
      <div className="v2-provider-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !active.configured || provider !== active.id}
          onClick={async () => {
            setResult("");
            const out = await act("provider/test", {});
            if (out)
              setResult(
                `Connection and tool-call check passed for ${out.model}.`,
              );
          }}
        >
          Test saved connection
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !active.configured || provider !== active.id}
          onClick={() => setRemove(true)}
        >
          <Trash2 size={13} />
          Remove key
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={async () => {
            const out = await act("models", {});
            if (out) setResult("Model catalog refreshed.");
          }}
        >
          <RefreshCw size={13} />
          Refresh models
        </Button>
      </div>
      <small>
        The connection test uses one short model request. Saving a key does not
        test or expose it.
      </small>
      {result && (
        <p role="status" className="muted-text">
          {result}
        </p>
      )}
      {provider === "nvidia" && (
        <details>
          <summary>Recommended agent models</summary>
          <dl className="v2-provider-models">
            {Object.entries(nvidiaAgentModels).map(([name, preset]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>
                  <strong>{preset.model}</strong>
                  <small>{preset.reason}</small>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {remove && (
        <ConfirmDialog
          title="Remove this provider key?"
          confirmLabel="Remove key"
          pending={busy}
          close={() => setRemove(false)}
          confirm={async () => {
            const out = await act("provider/save", {
              provider,
              removeKey: true,
              allowUnpricedNim: true,
            });
            if (out) {
              setRemove(false);
              setApiKey("");
              setResult(
                "The key was removed and the team is paused. Environment fallback for this provider is also disabled locally.",
              );
            }
          }}
        >
          The configured key will be disabled on this installation. Other
          installations and your provider account are unaffected.
        </ConfirmDialog>
      )}
    </section>
  );
}
