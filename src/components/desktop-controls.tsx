"use client";
import { useEffect, useRef } from "react";
import { Keyboard, X, Palette, Monitor, Download } from "lucide-react";
import { Button } from "./ui/button";
import { downloadDiagnostics, type DesktopPreferences } from "@/lib/desktop";
export function Appearance({
  preferences,
  update,
  data,
}: {
  preferences: DesktopPreferences;
  update: (p: Partial<DesktopPreferences>) => void;
  data: any;
}) {
  return (
    <section className="panel appearance-panel">
      <div className="panel-heading">
        <h3>
          <Palette size={16} /> Workspace appearance
        </h3>
        <span className="muted-text">Saved on this device</span>
      </div>
      <div className="appearance-grid">
        <fieldset>
          <legend>Color scheme</legend>
          <div className="theme-options">
            {(["nord", "graphite", "evergreen"] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                className={`theme-option ${theme}`}
                aria-pressed={preferences.theme === theme}
                onClick={() => update({ theme })}
              >
                <span />
                <strong>
                  {theme === "nord"
                    ? "Nord"
                    : theme === "graphite"
                      ? "Graphite"
                      : "Evergreen"}
                </strong>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Interface density</legend>
          <select
            aria-label="Interface density"
            value={preferences.density}
            onChange={(e) =>
              update({
                density: e.target.value as DesktopPreferences["density"],
              })
            }
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={preferences.focus}
              onChange={(e) => update({ focus: e.target.checked })}
            />{" "}
            Hide navigation for focused work
          </label>
        </fieldset>
        <div className="diagnostic-control">
          <h4>Connection diagnostics</h4>
          <p>
            Download connection status, model names, task counts, and budget
            totals for troubleshooting.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadDiagnostics(data)}
          >
            <Download size={14} /> Download diagnostics
          </Button>
          <small>
            API keys, prompts, messages and guide text are excluded.
          </small>
        </div>
      </div>
    </section>
  );
}
export function Shortcuts({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="command-dialog shortcut-dialog"
      ref={ref}
      onClose={close}
      aria-label="Keyboard shortcuts"
    >
      <div className="panel-heading">
        <h3>
          <Keyboard size={17} /> Keyboard shortcuts
        </h3>
        <button
          className="icon-link"
          onClick={() => ref.current?.close()}
          aria-label="Close shortcuts"
        >
          <X size={16} />
        </button>
      </div>
      <dl>
        {[
          ["Ctrl / Cmd + K", "Search pages, agents and tasks"],
          ["Alt + 1 … 9", "Switch workspace"],
          ["Alt + F", "Toggle focus mode"],
          ["?", "Show keyboard shortcuts"],
          ["Escape", "Close the current dialog"],
        ].map(([keys, label]) => (
          <div key={keys}>
            <dt>{label}</dt>
            <dd>
              <kbd>{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <p>Workspace and focus shortcuts are inactive while editing text.</p>
    </dialog>
  );
}
