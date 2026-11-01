"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Gamepad2,
  GitBranch,
  Link2,
  ListTodo,
  Plus,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
  Zap,
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
  const pending = data.approvals.filter((a: any) => a.status === "pending");
  const running = tasks.filter((t) => t.status === "running");
  const queued = tasks.filter((t) => t.status === "queued");
  const done = tasks.filter((t) => t.status === "completed");
  const reviews = data.runs.filter((r: any) => r.status === "review");
  const needs = pending.length + reviews.length;
  const cap = data.settings.cap;
  const spent = data.spend.cost + data.spend.reserved;
  const ready =
    !!data.keyConfigured &&
    data.settings.studioStatus === "connected" &&
    data.games.length > 0;
  const setup = [
    {
      ok: data.keyConfigured,
      title: "Connect your AI provider",
      description: "Add your OpenRouter key to activate the team.",
      href: "/settings",
      icon: Zap,
    },
    {
      ok: data.settings.studioStatus === "connected",
      title: "Connect Roblox Studio",
      description: "Link your open Studio session to Forge.",
      href: "/settings",
      icon: Link2,
    },
    {
      ok: data.games.length > 0,
      title: "Bring your first game",
      description: "Choose the world your team will work on.",
      href: "/games",
      icon: Gamepad2,
    },
  ];
  return (
    <>
      <div className="overview-pills">
        <Link
          href="/reviews"
          className={`status-pill ${needs ? "attention" : ""}`}
        >
          <span className="dot amber" />
          {needs} need you
        </Link>
        <Link href="/team" className="status-pill">
          <span className="dot green" />
          {running.length} working
        </Link>
        <Link href="/tasks" className="status-pill">
          <Clock3 size={13} />
          {queued.length} queued
        </Link>
        <span className="overview-date">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>
      <form
        className="lead-command"
        onSubmit={async (e) => {
          if (await send(e)) setPrompt("");
        }}
      >
        <Avatar name="Lead" />
        <div className="lead-command-input">
          <label htmlFor="lead-request">YOUR LEAD IS LISTENING</label>
          <input
            id="lead-request"
            name="content"
            aria-label="Request to Lead"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What would you like your team to build?"
            required
            maxLength={20000}
          />
        </div>
        <Button
          disabled={busy || !selectedGame || !prompt.trim()}
          type="submit"
        >
          Ask Lead <ArrowRight size={16} />
        </Button>
      </form>
      <div className="quick-prompts">
        <span>Start with an idea</span>
        {[
          "Build an obby checkpoint system",
          "Design a cozy village",
          "Add a daily rewards UI",
        ].map((s) => (
          <button
            key={s}
            onClick={() => {
              setPrompt(s);
              document.getElementById("lead-request")?.focus();
            }}
          >
            {s}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <div className="stats overview-stats">
        <Metric
          title="Tasks completed"
          value={String(done.length).padStart(2, "0")}
          icon={<CheckCheck size={17} />}
          detail={`${tasks.length} tasks across your workspace`}
          tone="mint"
        />
        <Metric
          title="Active requests"
          value={String(
            data.runs.filter((r: any) => r.status === "active").length,
          ).padStart(2, "0")}
          icon={<GitBranch size={17} />}
          detail={`${running.length} of 3 worker slots in use`}
          tone="violet"
        />
        <Metric
          title="Your games"
          value={String(data.games.length).padStart(2, "0")}
          icon={<Gamepad2 size={17} />}
          detail={
            data.settings.studioStatus === "connected"
              ? "Studio bridge connected"
              : "Waiting for a Studio connection"
          }
          tone="blue"
        />
        <div className="metric-card">
          <div className="metric-top">
            <span>Workspace budget</span>
            <Wallet size={17} />
          </div>
          <div className="metric-value">
            ${data.spend.cost.toFixed(2)} <small>/ ${cap.toFixed(2)}</small>
          </div>
          <progress
            aria-label="Workspace budget committed"
            value={spent}
            max={cap || 1}
          />
          <small>
            {data.spend.reserved > 0
              ? `$${data.spend.reserved.toFixed(3)} reserved for active calls`
              : `$${Math.max(0, cap - spent).toFixed(2)} available`}
          </small>
        </div>
      </div>
      <div className="mission-layout">
        <div className="mission-main">
          <div className="section-heading">
            <h2>
              Needs your attention{" "}
              <span className="number-tag">
                {needs || setup.filter((x) => !x.ok).length}
              </span>
            </h2>
            <span className="section-meta">YOUR NEXT MOVE</span>
          </div>
          {!ready && (
            <section className="setup-panel panel">
              <div className="setup-header">
                <span className="setup-symbol">
                  <Sparkles size={22} />
                </span>
                <div>
                  <span className="section-kicker">LET’S GET YOU BUILDING</span>
                  <h3>A few connections. A whole studio.</h3>
                  <p>
                    Give your team what it needs to bring your ideas to life.
                  </p>
                </div>
                <span className="setup-fraction">
                  {setup.filter((x) => x.ok).length}
                  <small> / 3</small>
                </span>
              </div>
              <div className="setup-steps">
                {setup.map((step, i) => (
                  <Link
                    className={`setup-step ${step.ok ? "complete" : ""}`}
                    href={step.href}
                    key={step.title}
                  >
                    <span className="setup-step-number">
                      {step.ok ? (
                        <Check size={15} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                    {step.ok ? (
                      <span className="setup-check">Connected</span>
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {pending.slice(0, 3).map((a: any) => {
            const t = tasks.find((t) => t.id === a.task_id);
            return (
              <article key={a.id} className="attention-card">
                <Avatar name={t?.agent || "Lead"} />
                <div>
                  <span className="section-kicker amber-text">
                    APPROVAL NEEDED · {t?.agent || "YOUR TEAM"}
                  </span>
                  <h3>{t?.title || a.tool}</h3>
                  <p>
                    Your team is ready to run <code>{a.tool}</code> in Studio.
                    Review the exact change before it happens.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/reviews">
                      Review change <ArrowRight size={14} />
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
          {reviews.slice(0, 2).map((r: any) => (
            <article key={r.id} className="attention-card verified">
              <span className="attention-symbol">
                <ShieldCheck size={21} />
              </span>
              <div>
                <span className="section-kicker mint-text">
                  TESTER VERIFIED · READY FOR YOU
                </span>
                <h3>{r.request}</h3>
                <p>
                  Your team finished building and testing. Take a look and have
                  the final say.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/reviews">
                    Review the work <ArrowRight size={14} />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
          {ready && !needs && (
            <section className="all-clear panel">
              <div className="all-clear-icon">
                <CheckCheck size={24} />
              </div>
              <h3>You’re all caught up.</h3>
              <p>
                {running.length
                  ? "Your team is working. Anything that needs your input will appear here."
                  : "Give Lead your next idea. Your team is ready to get to work."}
              </p>
              <Link href="/chat" className="text-link">
                Open Lead Chat <ArrowRight size={14} />
              </Link>
            </section>
          )}
          <section className="panel work-panel">
            <div className="panel-heading">
              <h3>
                <ListTodo size={17} /> The workbench
              </h3>
              <Link href="/tasks" className="text-link">
                All tasks <ArrowUpRight size={14} />
              </Link>
            </div>
            {tasks.length ? (
              <div className="workbench-tasks">
                {tasks.slice(0, 5).map((t) => (
                  <Link href="/tasks" key={t.id} className="workbench-task">
                    <Avatar name={t.agent} size="mini" />
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.agent} · {t.steps} model steps
                      </small>
                    </div>
                    <span className={`badge ${t.status}`}>{t.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="workbench-empty">
                <div className="empty-task-preview" aria-hidden="true">
                  <span />
                  <div>
                    <i />
                    <i />
                  </div>
                  <Check size={14} />
                </div>
                <h3>Good things start with a first task.</h3>
                <p>
                  Ask Lead to plan a feature, fix a bug, or build something new.
                  The work lands right here.
                </p>
                <Link href="/chat" className="text-link">
                  Start a conversation <ArrowRight size={14} />
                </Link>
              </div>
            )}
            <div className="workbench-footer">
              <span>
                <ShieldCheck size={13} /> Studio changes need your approval
              </span>
              <span>
                Plan <ChevronRight size={10} /> Build <ChevronRight size={10} />{" "}
                Test <ChevronRight size={10} /> Review
              </span>
            </div>
          </section>
          <section className="panel activity-panel">
            <div className="panel-heading">
              <h3>
                <Terminal size={16} /> Latest activity
              </h3>
              <Link href="/logs" className="text-link">
                View log <ArrowUpRight size={14} />
              </Link>
            </div>
            {data.events.slice(0, 4).map((e: any) => (
              <div className="compact-event" key={e.id}>
                <span
                  className={`dot ${e.level === "error" ? "amber" : "purple"}`}
                />
                <span>
                  <strong>{e.agent}</strong> {e.message}
                </span>
                <time>
                  {new Date(
                    e.created.replace(" ", "T") + "Z",
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
            {!data.events.length && (
              <p className="muted-text">
                Your workspace activity will appear here.
              </p>
            )}
          </section>
        </div>
        <aside className="mission-rail">
          <section className="panel team-live">
            <div className="panel-heading">
              <h3>
                <span className="dot green" /> Your team, right now
              </h3>
              <span className="number-tag">07</span>
            </div>
            <p className="rail-description">
              Independent minds. One shared vision.
            </p>
            <div className="live-agent-list">
              {data.agents.map((a: any) => {
                const active = running.find((t) => t.agent === a.name);
                const queue = queued.filter((t) => t.agent === a.name);
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
                    {active ? (
                      <span
                        className="agent-busy-indicator"
                        aria-label="Working"
                      />
                    ) : queue.length ? (
                      <span className="queue-count">{queue.length} queued</span>
                    ) : (
                      <span
                        className={`agent-presence ${!a.enabled ? "disabled" : ""}`}
                        title={a.enabled ? "Standing by" : "Disabled"}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
            <Link href="/team" className="rail-footer-link">
              Meet your team <ArrowRight size={14} />
            </Link>
          </section>
          <section className="panel game-progress-panel">
            <div className="panel-heading">
              <h3>Your worlds</h3>
              <Link
                href="/games"
                aria-label="Add or manage games"
                className="icon-link"
              >
                <Plus size={16} />
              </Link>
            </div>
            {data.games.length ? (
              data.games.slice(0, 3).map((g: any) => {
                const runs = data.runs.filter((r: any) => r.game_id === g.id);
                const latest = runs[0];
                const gameTasks = tasks.filter((t) =>
                  runs.some((r: any) => r.id === t.run_id),
                );
                const gameDone = gameTasks.filter(
                  (t) => t.status === "completed",
                ).length;
                return (
                  <Link href="/games" className="world-progress" key={g.id}>
                    <div>
                      <span className="world-icon">
                        <Gamepad2 size={17} />
                      </span>
                      <strong>{g.name}</strong>
                      <ChevronRight size={14} />
                    </div>
                    <progress
                      aria-label={`${g.name} task completion`}
                      max={gameTasks.length || 1}
                      value={gameDone}
                    />
                    <small>
                      {latest
                        ? `${gameDone} of ${gameTasks.length} tasks complete · ${latest.status}`
                        : "Ready for its first request"}
                    </small>
                  </Link>
                );
              })
            ) : (
              <div className="world-empty">
                <div className="world-cube" aria-hidden="true">
                  <Gamepad2 size={28} />
                </div>
                <h3>A home for your next idea.</h3>
                <p>Connect a game to start creating with your team.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/games">
                    <Plus size={14} /> Add your first game
                  </Link>
                </Button>
              </div>
            )}
          </section>
          <div className="local-note">
            <ShieldCheck size={17} />
            <div>
              <strong>Made here. Kept here.</strong>
              <p>
                Your games, keys, and agent memory stay in your local workspace.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
function Metric({
  title,
  value,
  icon,
  detail,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span>{title}</span>
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <small>{detail}</small>
    </div>
  );
}
