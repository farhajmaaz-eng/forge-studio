"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  ListTodo,
  ShieldCheck,
  Terminal,
  Plus,
  Gamepad2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Avatar } from "./agent-avatar";
import { roles } from "@/lib/roles";
export default function Overview({
  data,
  busy,
  selectedGame,
  send,
}: {
  data: any;
  busy: boolean;
  selectedGame: string;
  send: (e: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState("");
  const tasks: any[] = data.tasks;
  const running = tasks.filter((t) => t.status === "running");
  const queued = tasks.filter((t) => t.status === "queued");
  const failed = tasks.filter((t) => ["failed", "blocked"].includes(t.status));
  const pending = data.approvals.filter((a: any) => a.status === "pending");
  const reviews = data.runs.filter((r: any) => r.status === "review");
  const done = tasks.filter((t) => t.status === "completed");
  const setup = [
    {
      ok: data.keyConfigured,
      title: "OpenRouter API key",
      description: "Set OPENROUTER_API_KEY in .env and restart the worker.",
      href: "/settings",
    },
    {
      ok: data.settings.studioStatus === "connected",
      title: "Roblox Studio bridge",
      description:
        "Enable the official MCP server in Studio, then connect it in Settings.",
      href: "/settings",
    },
    {
      ok: data.games.length > 0,
      title: "Target game",
      description: "Discover your Studio instance and register its ID.",
      href: "/games",
    },
  ];
  const ready = setup.every((x) => x.ok);
  const notices = pending.length + reviews.length + failed.length;
  return (
    <div className="workspace-tiles">
      <div className="overview-stats stats">
        <div>
          <span>Tasks</span>
          <strong>
            {done.length}
            <small> / {tasks.length}</small>
          </strong>
          <label>completed</label>
        </div>
        <div>
          <span>Workers</span>
          <strong>
            {running.length}
            <small> / 3</small>
          </strong>
          <label>{queued.length} queued</label>
        </div>
        <div>
          <span>Attention</span>
          <strong className={notices ? "warning-text" : ""}>{notices}</strong>
          <label>{failed.length} failed or blocked</label>
        </div>
        <div>
          <span>API budget</span>
          <strong>
            ${data.spend.cost.toFixed(4)}
            <small> / ${data.settings.cap.toFixed(2)}</small>
          </strong>
          <progress
            aria-label="Workspace budget committed"
            value={data.spend.cost + data.spend.reserved}
            max={data.settings.cap || 1}
          />
          <label>${data.spend.reserved.toFixed(4)} reserved</label>
        </div>
      </div>
      <div className="desktop-columns">
        <div className="desktop-primary">
          <section className="panel request-pane">
            <div className="window-heading">
              <span>
                <Terminal size={14} /> lead / new request
              </span>
              <span className="pane-meta">
                {data.settings.paused
                  ? "paused"
                  : ready
                    ? "ready"
                    : "setup required"}
              </span>
            </div>
            <form
              className="lead-command"
              onSubmit={async (e) => {
                if (await send(e)) setPrompt("");
              }}
            >
              <label htmlFor="lead-request">Request</label>
              <textarea
                id="lead-request"
                name="content"
                aria-label="Request to Lead"
                required
                maxLength={20000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the change and how it should be verified."
                rows={3}
              />
              <div className="request-actions">
                <span>
                  {selectedGame
                    ? data.games.find((g: any) => g.id === selectedGame)?.name
                    : "No target game selected"}
                </span>
                <Button
                  type="submit"
                  disabled={busy || !selectedGame || !prompt.trim()}
                >
                  Queue request <ArrowRight size={14} />
                </Button>
              </div>
            </form>
            <div className="quick-prompts">
              <span>Examples:</span>
              {[
                "Build an obby checkpoint system",
                "Design a cozy village",
                "Add a daily rewards UI",
              ].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => {
                    setPrompt(s);
                    document.getElementById("lead-request")?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
          {!ready && (
            <section className="panel setup-panel">
              <div className="window-heading">
                <span>
                  <Link2 size={14} /> connection setup
                </span>
                <span className="pane-meta">
                  {setup.filter((x) => x.ok).length}/3 connected
                </span>
              </div>
              <div className="setup-steps">
                {setup.map((step) => (
                  <Link
                    className={`setup-step ${step.ok ? "complete" : ""}`}
                    key={step.title}
                    href={step.href}
                  >
                    <span className="setup-step-number">
                      {step.ok ? (
                        <Check size={14} />
                      ) : (
                        <span className="dot amber" />
                      )}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                    {step.ok ? (
                      <span className="setup-check">ready</span>
                    ) : (
                      <ChevronRight size={15} />
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {(notices > 0 || ready) && (
            <section className="panel attention-pane">
              <div className="window-heading">
                <span>
                  <ShieldCheck size={14} /> review &amp; recovery
                </span>
                <span className="pane-meta">{notices} items</span>
              </div>
              {pending.slice(0, 3).map((a: any) => {
                const t = tasks.find((t) => t.id === a.task_id);
                return (
                  <Link href="/reviews" className="attention-row" key={a.id}>
                    <span className="state-square approval" />
                    <div>
                      <strong>{t?.title || a.tool}</strong>
                      <small>
                        Approval required · {a.tool} · {t?.agent}
                      </small>
                    </div>
                    <ExternalLink size={14} />
                  </Link>
                );
              })}
              {reviews.slice(0, 2).map((r: any) => (
                <Link href="/reviews" className="attention-row" key={r.id}>
                  <span className="state-square completed" />
                  <div>
                    <strong>{r.request}</strong>
                    <small>Tester verified · awaiting your review</small>
                  </div>
                  <ExternalLink size={14} />
                </Link>
              ))}
              {failed.slice(0, 3).map((t) => (
                <Link
                  href={`/tasks?task=${t.id}`}
                  className="attention-row"
                  key={t.id}
                >
                  <span className="state-square failed" />
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {t.agent} · {t.error || "Dependency needs attention"}
                    </small>
                  </div>
                  <ExternalLink size={14} />
                </Link>
              ))}
              {!notices && (
                <p className="plain-empty">
                  No approvals, failed tasks or pending reviews.
                </p>
              )}
            </section>
          )}
          <section className="panel work-panel">
            <div className="window-heading">
              <span>
                <ListTodo size={14} /> task queue
              </span>
              <Link href="/tasks">
                Open board <ChevronRight size={13} />
              </Link>
            </div>
            <div className="queue-table">
              <div className="queue-table-head">
                <span>Task</span>
                <span>Agent</span>
                <span>State</span>
              </div>
              {tasks.length ? (
                tasks.slice(0, 7).map((t) => (
                  <Link
                    key={t.id}
                    className="queue-table-row"
                    href={`/tasks?task=${t.id}`}
                  >
                    <span>
                      <strong>{t.title}</strong>
                      <small>
                        {t.steps} steps · {t.attempts} retries
                      </small>
                    </span>
                    <span>{t.agent}</span>
                    <span className={`badge ${t.status}`}>{t.status}</span>
                  </Link>
                ))
              ) : (
                <div className="queue-empty">
                  <ListTodo size={25} />
                  <div>
                    <h3>Queue is empty</h3>
                    <p>
                      Requests are planned by Lead, assigned to specialists,
                      then checked by Tester.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="workbench-footer">
              <span>
                Studio writes require approval
                {!data.settings.approvalRequired ? " (currently disabled)" : ""}
              </span>
              <span>Plan → Build → Verify → Review</span>
            </div>
          </section>
          <section className="panel activity-panel">
            <div className="window-heading">
              <span>
                <Terminal size={14} /> event log
              </span>
              <Link href="/logs">
                View all <ChevronRight size={13} />
              </Link>
            </div>
            {data.events.slice(0, 6).map((e: any) => (
              <div className="compact-event" key={e.id}>
                <time>
                  {new Date(
                    e.created.replace(" ", "T") + "Z",
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <strong>{e.agent}</strong>
                <span className={e.level === "error" ? "failure-text" : ""}>
                  {e.message}
                </span>
              </div>
            ))}
            {!data.events.length && (
              <p className="plain-empty">No activity recorded.</p>
            )}
          </section>
        </div>
        <aside className="desktop-secondary">
          <section className="panel team-live">
            <div className="window-heading">
              <span>
                <span className="dot green" /> agents
              </span>
              <Link href="/team">
                Configure <ChevronRight size={13} />
              </Link>
            </div>
            <div className="live-agent-list">
              {data.agents.map((a: any) => {
                const active = running.find((t) => t.agent === a.name);
                const count = queued.filter((t) => t.agent === a.name).length;
                return (
                  <Link
                    href={`/team?agent=${a.name}`}
                    className={`live-agent ${active ? "working" : ""}`}
                    key={a.name}
                  >
                    <Avatar name={a.name} working={!!active} />
                    <div>
                      <strong>{a.name}</strong>
                      <small>
                        {active
                          ? active.title
                          : roles[a.name as keyof typeof roles].title}
                      </small>
                    </div>
                    <span className={`agent-status ${active ? "active" : ""}`}>
                      {!a.enabled
                        ? "off"
                        : active
                          ? "running"
                          : count
                            ? `${count} queued`
                            : "idle"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="panel game-progress-panel">
            <div className="window-heading">
              <span>
                <Gamepad2 size={14} /> places
              </span>
              <Link href="/games" aria-label="Add game">
                <Plus size={15} />
              </Link>
            </div>
            {data.games.length ? (
              data.games.slice(0, 3).map((g: any) => {
                const runs = data.runs.filter((r: any) => r.game_id === g.id);
                const gameTasks = tasks.filter((t) =>
                  runs.some((r: any) => r.id === t.run_id),
                );
                return (
                  <Link href="/games" className="world-progress" key={g.id}>
                    <strong>{g.name}</strong>
                    <small>Studio {g.studio_id}</small>
                    <progress
                      aria-label={`${g.name} task completion`}
                      max={gameTasks.length || 1}
                      value={
                        gameTasks.filter((t) => t.status === "completed").length
                      }
                    />
                    <small>
                      {gameTasks.filter((t) => t.status === "completed").length}{" "}
                      / {gameTasks.length} tasks complete
                    </small>
                  </Link>
                );
              })
            ) : (
              <div className="plain-empty">
                <p>No games registered.</p>
                <Link href="/games" className="text-link">
                  Add a Studio instance <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </section>
          <section className="panel runtime-summary">
            <div className="window-heading">
              <span>runtime / local</span>
            </div>
            <dl>
              <div>
                <dt>Worker</dt>
                <dd>
                  {Date.now() - data.settings.workerHeartbeat < 10000
                    ? "online"
                    : "offline"}
                </dd>
              </div>
              <div>
                <dt>OpenRouter</dt>
                <dd>{data.keyConfigured ? "configured" : "missing key"}</dd>
              </div>
              <div>
                <dt>Studio</dt>
                <dd>{data.settings.studioStatus}</dd>
              </div>
              <div>
                <dt>Write approval</dt>
                <dd>
                  {data.settings.approvalRequired ? "required" : "disabled"}
                </dd>
              </div>
            </dl>
            <Link href="/settings" className="text-link">
              Connection settings <ChevronRight size={13} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
