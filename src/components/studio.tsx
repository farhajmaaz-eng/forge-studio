"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Activity,
  Search,
  RefreshCw,
  LayoutGrid,
  ArrowRight,
  Box,
  Check,
  CheckCheck,
  ChevronRight,
  Flame,
  Gamepad2,
  Gauge,
  GitBranch,
  Home,
  Link2,
  ListTodo,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { roles, type Role } from "@/lib/roles";
import { Avatar } from "./agent-avatar";
import Overview from "./overview";
import CommandPalette from "./command-palette";
const nav = [
  ["home", "Overview", Home],
  ["chat", "Lead Chat", MessageSquare],
  ["team", "The team", Users],
  ["tasks", "Task board", ListTodo],
  ["games", "Games", Gamepad2],
  ["reviews", "Reviews", ShieldCheck],
  ["logs", "Activity logs", Terminal],
  ["settings", "Settings", Settings],
] as const;
const money = (n: number) => `$${(n || 0).toFixed(4)}`;
const date = (s: string) =>
  new Date(s.replace(" ", "T") + "Z").toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.replaceAll(" ", "-")}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export default function Studio({ page }: { page: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedGame, setSelectedGame] = useState(""),
    [selectedAgent, setSelectedAgent] = useState("Lead"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [connection, setConnection] = useState("polling"),
    [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", key);
    const agent = new URLSearchParams(location.search).get("agent");
    if (agent && agent in roles) setSelectedAgent(agent);
    const game = localStorage.getItem("forge-game");
    if (game) setSelectedGame(game);
    return () => document.removeEventListener("keydown", key);
  }, [page]);
  function chooseGame(id: string) {
    setSelectedGame(id);
    localStorage.setItem("forge-game", id);
  }
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshot");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const poll = setInterval(load, 4000);
    let ws: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    function connect() {
      ws = new WebSocket(
        `ws://${location.hostname}:${data?.settings.workerPort || 4318}`,
      );
      ws.onopen = () => setConnection("live");
      ws.onmessage = () => void load();
      ws.onerror = () => setConnection("polling");
      ws.onclose = () => {
        setConnection("polling");
        if (!disposed) retry = setTimeout(connect, 4000);
      };
    }
    connect();
    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(retry);
      ws?.close();
    };
  }, [load, data?.settings.workerPort]);
  useEffect(() => {
    if (
      data?.games.length &&
      !data.games.some((g: any) => g.id === selectedGame)
    )
      chooseGame(data.games[0].id);
  }, [data, selectedGame]);
  async function act(path: string, body: any) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      await load();
      setNotice("Saved successfully");
      return out;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  const tasks: any[] = data?.tasks || [],
    approvals = (data?.approvals || []).filter(
      (a: any) => a.status === "pending",
    );
  const running = tasks.filter((t) => t.status === "running"),
    done = tasks.filter((t) => t.status === "completed");
  const title = nav.find((n) => n[0] === page)?.[1] || "Overview";
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const content = String(new FormData(form).get("content") || "");
    const result = await act("chat", { content, gameId: selectedGame });
    if (result) form.reset();
    return !!result;
  }
  const composer = (
    <form className="composer" onSubmit={send}>
      <div className="composer-top">
        <Sparkles size={17} />
        <span>What are we building today?</span>
        <select
          aria-label="Active game"
          value={selectedGame}
          onChange={(e) => chooseGame(e.target.value)}
        >
          <option value="">Select a game</option>
          {data?.games.map((g: any) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="content"
        aria-label="Request to Lead"
        required
        maxLength={20000}
        placeholder="Describe your game, a new feature, or something to fix…"
      />
      <div className="composer-bottom">
        <span>
          <span className="dot purple" /> Lead will plan and delegate to your
          team
        </span>
        <Button disabled={busy || !selectedGame} type="submit">
          Send to Lead <ArrowRight size={15} />
        </Button>
      </div>
    </form>
  );
  return (
    <div className={`app page-${page}`}>
      {paletteOpen && (
        <CommandPalette
          tasks={tasks}
          close={() => setPaletteOpen(false)}
          choose={(href) => {
            const name = new URL(href, location.origin).searchParams.get(
              "agent",
            );
            if (name && name in roles) setSelectedAgent(name);
          }}
        />
      )}
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Flame size={24} />
          </span>{" "}
          forge<span className="brand-tag">STUDIO</span>
        </Link>
        <div className="workspace">
          <span className="workspace-logo">F</span>
          <div>
            Personal workspace<small>Local development</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <button
          className="workspace-search"
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={15} />
          <span>Search or jump to…</span>
          <kbd>⌘ K</kbd>
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <Link
              href={id === "home" ? "/" : "/" + id}
              key={id}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              title={label}
              className={page === id ? "nav-item active" : "nav-item"}
            >
              <Icon size={18} />
              <span className="nav-text">{label}</span>
              {id === "reviews" && approvals.length > 0 && (
                <span className="count">{approvals.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-team">
          <span className="nav-label">
            YOUR TEAM <span>07</span>
          </span>
          <div>
            {Object.keys(roles).map((name) => (
              <Link
                href={`/team?agent=${name}`}
                key={name}
                title={name}
                onClick={() => setSelectedAgent(name)}
                aria-label={`Open ${name} agent`}
              >
                <Avatar
                  name={name}
                  size="mini"
                  working={running.some((t) => t.agent === name)}
                />
              </Link>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="local-card">
            <ShieldCheck size={19} />
            <div>
              Local by design<small>Your workspace. Your control.</small>
            </div>
          </div>
          <div className="profile">
            <div className="profile-avatar">Y</div>
            <div>
              Your studio<small>Independent creator</small>
            </div>
            <span className="dot green" />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <div className="game-switcher">
              <LayoutGrid size={15} />
              <select
                aria-label="Workspace game"
                value={selectedGame}
                onChange={(e) => chooseGame(e.target.value)}
              >
                <option value="">Your workspace</option>
                {data?.games.map((g: any) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-page">{title}</span>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${connection === "live" && data ? "is-live" : ""}`}
            >
              <span
                className={`dot ${connection === "live" && data ? "green" : "amber"}`}
              />
              {connection === "live" && data
                ? "Live workspace"
                : "Reconnecting"}
            </span>
            <button
              className="refresh-button"
              onClick={() => void load()}
              title="Refresh workspace"
              aria-label="Refresh workspace"
            >
              <RefreshCw size={15} />
              <span>Refresh</span>
            </button>
            <button
              className="mobile-search icon-link"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search workspace"
            >
              <Search size={17} />
            </button>
            <Button asChild>
              <Link href="/chat">
                <Plus size={16} />
                <span>New request</span>
              </Link>
            </Button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <div className="eyebrow">
                {page === "home" ? "MISSION CONTROL" : "YOUR WORKSPACE"}
              </div>
              <h1>{page === "home" ? "Your studio, at a glance." : title}</h1>
              <p>
                {page === "home"
                  ? "The big picture. The next move. Everything in one place."
                  : (
                      {
                        chat: "One conversation. Seven independent minds.",
                        team: "A focused specialist for every part of your game.",
                        tasks: "From first idea to verified implementation.",
                        games: "Connect the worlds you’re building.",
                        reviews: "You have the final say on every change.",
                        logs: "A clear view of everything happening in your studio.",
                        settings: "Make this workspace your own.",
                      } as any
                    )[page]}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!data || busy}
              onClick={() => act("pause", { paused: !data?.settings.paused })}
            >
              {data?.settings.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {data?.settings.paused ? "Resume team" : "Pause team"}
            </Button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="alert">
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!data && !error && (
            <div className="empty">
              <Loader2 className="spin" />
              Connecting to your local worker…
            </div>
          )}
          {data && page === "home" && (
            <Overview
              data={data}
              busy={busy}
              selectedGame={selectedGame}
              send={send}
            />
          )}
          {data && page === "chat" && (
            <div className="chat-layout">
              <section className="panel chat-panel">
                <div className="panel-heading">
                  <h3>
                    <Avatar name="Lead" size="mini" /> Lead{" "}
                    <span className="subtle">Your orchestrator</span>
                  </h3>
                  <Badge
                    value={data.keyConfigured ? "ready" : "not configured"}
                  />
                </div>
                <div className="messages">
                  {data.chat.length ? (
                    data.chat.map((m: any) => (
                      <div className={`message ${m.role}`} key={m.id}>
                        {m.role === "assistant" && (
                          <Avatar name="Lead" size="mini" />
                        )}
                        <div>
                          <small>
                            {m.role === "user" ? "You" : "Lead"} ·{" "}
                            {date(m.created)}
                          </small>
                          <div className="message-content">{m.content}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty
                      icon={<Sparkles />}
                      title="Let’s make something worth playing."
                      text="Describe what you want to build. Lead will break it down and bring in the right specialists."
                    />
                  )}
                </div>
                {composer}
              </section>
              <section className="panel chat-context">
                <h3>How your team works</h3>
                {[
                  ["01", "Plan", "Lead turns your request into a task graph."],
                  [
                    "02",
                    "Build",
                    "Up to three specialists work independently.",
                  ],
                  ["03", "Verify", "Tester checks changes in Roblox Studio."],
                  ["04", "Review", "You approve the finished work."],
                ].map(([n, t, d]) => (
                  <div className="workflow-step" key={n}>
                    <b>{n}</b>
                    <div>
                      <strong>{t}</strong>
                      <p>{d}</p>
                    </div>
                  </div>
                ))}
                <div className="callout">
                  <ShieldCheck size={19} />
                  <p>
                    Studio changes pause for your approval. Find the exact tool
                    arguments in Reviews.
                  </p>
                </div>
              </section>
            </div>
          )}
          {data && page === "team" && (
            <>
              <div className="team-grid">
                {data.agents.map((a: any) => (
                  <button
                    key={a.name}
                    className={`panel team-card ${selectedAgent === a.name ? "selected" : ""}`}
                    onClick={() => setSelectedAgent(a.name)}
                  >
                    <div className="team-head">
                      <Avatar name={a.name} />
                      <Badge
                        value={
                          !a.enabled
                            ? "disabled"
                            : running.some((t) => t.agent === a.name)
                              ? "running"
                              : "idle"
                        }
                      />
                    </div>
                    <h2>{a.name}</h2>
                    <p>{roles[a.name as Role].title}</p>
                    <small>{a.model}</small>
                    <div className="team-metrics">
                      <span>
                        {
                          tasks.filter(
                            (t) =>
                              t.agent === a.name && t.status === "completed",
                          ).length
                        }{" "}
                        tasks completed
                      </span>
                      <span>
                        {
                          data.memories.filter((m: any) => m.agent === a.name)
                            .length
                        }{" "}
                        memories
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <AgentForm
                key={selectedAgent}
                agent={data.agents.find((a: any) => a.name === selectedAgent)}
                busy={busy}
                save={(b) => act("agents", b)}
              />
              <section className="panel spaced">
                <h3>{selectedAgent}’s memory & history</h3>
                {data.memories
                  .filter((m: any) => m.agent === selectedAgent)
                  .map((m: any) => (
                    <pre key={m.id} className="memory">
                      {m.content}
                    </pre>
                  ))}
                {!data.memories.some((m: any) => m.agent === selectedAgent) && (
                  <p className="muted-text">
                    This agent has no saved memories yet.
                  </p>
                )}
              </section>
            </>
          )}
          {data && page === "tasks" && (
            <>
              <section className="panel queue-summary">
                <div>
                  <h3>Task progress</h3>
                  <p>
                    {done.length} of {tasks.length} tasks completed ·{" "}
                    {running.length} running · {approvals.length} waiting for
                    approval
                  </p>
                </div>
                <progress
                  aria-label="Completed tasks"
                  max={Math.max(tasks.length, 1)}
                  value={done.length}
                />
              </section>
              <div className="toolbar">
                <div className="tabs">
                  {[
                    "all",
                    "queued",
                    "running",
                    "approval",
                    "completed",
                    "failed",
                  ].map((f) => (
                    <button
                      className={filter === f ? "current" : ""}
                      onClick={() => setFilter(f)}
                      key={f}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search tasks"
                  placeholder="Search tasks…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <section className="panel task-list">
                {tasks
                  .filter(
                    (t) =>
                      (filter === "all" || t.status === filter) &&
                      t.title.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((t) => (
                    <details key={t.id} className="task-detail">
                      <summary>
                        <TaskRow t={t} />
                      </summary>
                      <div className="task-body">
                        <p>{t.instructions}</p>
                        <small>
                          Task {t.id} · Attempt {t.attempts} · {t.steps} model
                          steps
                        </small>
                        <p>
                          Depends on:{" "}
                          {JSON.parse(t.deps)
                            .map(
                              (id: string) =>
                                tasks.find((x) => x.id === id)?.title || id,
                            )
                            .join(", ") || "No dependencies"}
                        </p>
                        {t.error && <p className="failure">{t.error}</p>}
                        {t.result && <pre>{t.result}</pre>}
                        {["failed", "blocked"].includes(t.status) && (
                          <Button
                            size="sm"
                            onClick={() => act("retry", { id: t.id })}
                          >
                            Retry task
                          </Button>
                        )}
                      </div>
                    </details>
                  ))}
                {!tasks.length && (
                  <Empty
                    icon={<GitBranch />}
                    title="No tasks yet"
                    text="Send your first request to Lead to create a real task graph."
                  />
                )}
              </section>
            </>
          )}
          {data && page === "games" && (
            <div className="two-columns">
              <section>
                <div className="section-heading">
                  <h2>Your games</h2>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const r = await act("studios", {});
                      if (r) setNotice(JSON.stringify(r.content, null, 2));
                    }}
                  >
                    <Link2 size={15} /> Discover Studios
                  </Button>
                </div>
                {data.games.map((g: any) => (
                  <div className="panel game-card" key={g.id}>
                    <div className="game-art">
                      <Box size={44} />
                      <span className="game-grid" />
                    </div>
                    <div>
                      <h2>{g.name}</h2>
                      <p>Studio instance: {g.studio_id}</p>
                      <Badge
                        value={g.id === selectedGame ? "selected" : "connected"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => chooseGame(g.id)}
                      >
                        Use this game <ArrowRight size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
                {!data.games.length && (
                  <section className="panel">
                    <Empty
                      icon={<Gamepad2 />}
                      title="Your next world belongs here"
                      text="Connect the official Studio MCP server, discover an instance, and register it below."
                    />
                  </section>
                )}
              </section>
              <form
                className="panel form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("games", {
                    name: f.get("name"),
                    studioId: f.get("studioId"),
                  });
                }}
              >
                <h3>
                  <Plus size={17} /> Add a game
                </h3>
                <label>
                  Game name
                  <input
                    name="name"
                    required
                    placeholder="My Roblox experience"
                  />
                </label>
                <label>
                  Studio instance ID
                  <input
                    name="studioId"
                    required
                    placeholder="ID from Discover Studios"
                  />
                </label>
                <p>
                  Open the place in Roblox Studio, enable the official MCP
                  server, and copy the instance ID returned by discovery.
                </p>
                <Button disabled={busy}>
                  Add game <Plus size={14} />
                </Button>
              </form>
            </div>
          )}
          {data && page === "reviews" && (
            <>
              <div className="section-heading">
                <h2>
                  Studio approvals{" "}
                  <span className="subtle">{approvals.length}</span>
                </h2>
                <span className="muted-text">
                  Exact arguments, before anything changes.
                </span>
              </div>
              {approvals.map((a: any) => (
                <section className="panel approval-card" key={a.id}>
                  <div className="panel-heading">
                    <h3>
                      <ShieldCheck size={18} />
                      {a.tool}
                    </h3>
                    <Badge value="approval" />
                  </div>
                  <p>{tasks.find((t) => t.id === a.task_id)?.title}</p>
                  <pre>{JSON.stringify(JSON.parse(a.args), null, 2)}</pre>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        act("approve", { id: a.id, approved: false })
                      }
                    >
                      <X size={15} /> Reject change
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        act("approve", { id: a.id, approved: true })
                      }
                    >
                      <Check size={15} /> Approve change
                    </Button>
                  </div>
                </section>
              ))}
              {!approvals.length && (
                <section className="panel">
                  <Empty
                    icon={<ShieldCheck />}
                    title="No changes waiting on you"
                    text="When an agent proposes a Studio modification, review and approve it here."
                  />
                </section>
              )}
              {data.uncertain?.map((c: any) => (
                <section className="panel approval-card" key={c.id}>
                  <h3>Inspect uncertain operation: {c.tool}</h3>
                  <pre>{c.args}</pre>
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act("resolve", {
                        id: c.id,
                        executed: f.get("executed") === "yes",
                        evidence: f.get("evidence"),
                      });
                    }}
                  >
                    <label>
                      Outcome after inspecting Studio
                      <select name="executed">
                        <option value="yes">
                          Change already applied — preserve it
                        </option>
                        <option value="no">
                          Change did not apply — allow retry
                        </option>
                      </select>
                    </label>
                    <label>
                      Inspection evidence
                      <textarea required minLength={10} name="evidence" />
                    </label>
                    <Button disabled={busy}>Record outcome</Button>
                  </form>
                </section>
              ))}
              <div className="section-heading">
                <h2>Completed work</h2>
              </div>
              {data.runs
                .filter((r: any) => ["review", "accepted"].includes(r.status))
                .map((r: any) => (
                  <section className="panel approval-card" key={r.id}>
                    <div className="panel-heading">
                      <h3>{r.request}</h3>
                      <Badge value={r.status} />
                    </div>
                    {tasks
                      .filter((t) => t.run_id === r.id && t.agent === "Tester")
                      .map((t) => (
                        <pre key={t.id}>{t.result}</pre>
                      ))}
                    {r.status === "review" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act("review", {
                            id: r.id,
                            accepted: false,
                            feedback: f.get("feedback"),
                          });
                        }}
                      >
                        <label>
                          Request revisions
                          <textarea
                            name="feedback"
                            required
                            minLength={5}
                            placeholder="What should the team change?"
                          />
                        </label>
                        <div className="actions">
                          <Button variant="outline" disabled={busy}>
                            Request changes
                          </Button>
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              act("review", { id: r.id, accepted: true })
                            }
                          >
                            <CheckCheck size={15} /> Accept work
                          </Button>
                        </div>
                      </form>
                    )}
                  </section>
                ))}
            </>
          )}
          {data && page === "logs" && (
            <>
              <div className="toolbar">
                <h2>Live activity stream</h2>
                <span className="live">
                  <span className="dot green" />
                  {connection}
                </span>
              </div>
              <section className="panel">
                <Events events={data.events} />
              </section>
              <section className="panel spaced">
                <h3>API usage ledger</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Time",
                          "Agent",
                          "Model",
                          "Input",
                          "Output",
                          "Cost",
                          "Status",
                        ].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.usage.map((u: any) => (
                        <tr key={u.id}>
                          <td>{date(u.created)}</td>
                          <td>{u.agent}</td>
                          <td>{u.model}</td>
                          <td>{u.input_tokens || "—"}</td>
                          <td>{u.output_tokens || "—"}</td>
                          <td>
                            {money(u.cost)}
                            {u.reserved > 0 && (
                              <small> + {money(u.reserved)} reserved</small>
                            )}
                          </td>
                          <td>
                            <Badge value={u.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {data && page === "settings" && (
            <SettingsForm data={data} busy={busy} act={act} />
          )}
          <footer className="footer">
            <span>
              <Flame size={13} /> Forge Studio <span className="subtle">/</span>{" "}
              Built for the worlds you imagine.
            </span>
            <span>
              <span className="dot green" /> Local workspace · 3 worker limit
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function TaskRow({ t }: { t: any }) {
  return (
    <div className="task-row">
      <Avatar name={t.agent} size="mini" />
      <div>
        <strong>{t.title}</strong>
        <small>
          {t.agent} <span>·</span> {date(t.created)}
        </small>
      </div>
      <Badge value={t.status} />
    </div>
  );
}
function Events({ events }: { events: any[] }) {
  return (
    <div className="events">
      {events.length ? (
        events.map((e) => (
          <div className="event" key={e.id}>
            <span className={`event-dot ${e.level}`} />
            <div>
              <strong>{e.agent}</strong>
              <p>{e.message}</p>
            </div>
            <time>{date(e.created)}</time>
          </div>
        ))
      ) : (
        <p className="muted-text">Activity appears as your worker runs.</p>
      )}
    </div>
  );
}
function AgentForm({
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
function SettingsForm({
  data,
  busy,
  act,
}: {
  data: any;
  busy: boolean;
  act: (p: string, b: any) => Promise<any>;
}) {
  const s = data.settings;
  return (
    <div className="settings-layout">
      <form
        className="panel form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          let args;
          try {
            args = JSON.parse(String(f.get("args")));
          } catch {
            e.currentTarget
              .querySelector<HTMLTextAreaElement>("[name=args]")
              ?.setCustomValidity("Enter a JSON array of strings");
            return;
          }
          void act("settings", {
            cap: Number(f.get("cap")),
            maxSteps: Number(f.get("maxSteps")),
            paused: s.paused,
            approvalRequired: f.get("approvalRequired") === "on",
            mcpCommand: f.get("command"),
            mcpArgs: args,
          });
        }}
      >
        <h3>
          <Link2 size={18} /> Roblox Studio connection
        </h3>
        <p>
          Enable Studio as MCP server in Assistant → Manage MCP Servers. Use the
          official command for your operating system.
        </p>
        <label>
          MCP executable
          <input
            name="command"
            defaultValue={s.mcpCommand}
            placeholder="/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP"
          />
        </label>
        <label>
          Arguments (JSON array)
          <textarea
            name="args"
            defaultValue={JSON.stringify(s.mcpArgs)}
            onChange={(e) => e.target.setCustomValidity("")}
            rows={2}
          />
        </label>
        <label className="checkbox">
          <input
            name="approvalRequired"
            type="checkbox"
            defaultChecked={s.approvalRequired}
          />{" "}
          Require approval for every Studio modification
        </label>
        <hr />
        <h3>
          <Gauge size={18} /> Runtime & spending
        </h3>
        <div className="form-grid">
          <label>
            Workspace spending cap (USD)
            <input
              name="cap"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              defaultValue={s.cap}
            />
          </label>
          <label>
            Maximum model steps per task
            <input
              name="maxSteps"
              type="number"
              min="5"
              max="100"
              defaultValue={s.maxSteps}
            />
          </label>
        </div>
        <progress
          aria-label="Budget committed"
          max={s.cap || 1}
          value={data.spend.cost + data.spend.reserved}
        />
        <p>
          Spent {money(data.spend.cost)} · Reserved {money(data.spend.reserved)}
          . Reservations count against the cap, including calls with unknown
          outcomes.
        </p>
        <Button disabled={busy}>Save configuration</Button>
      </form>
      <div>
        <section className="panel form">
          <h3>
            <Zap size={18} /> OpenRouter
          </h3>
          <Badge value={data.keyConfigured ? "configured" : "not configured"} />
          <p>
            Set <code>OPENROUTER_API_KEY</code> in your local <code>.env</code>,
            then restart the worker. Keys stay in the server process.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => act("models", {})}
          >
            Refresh models & pricing
          </Button>
        </section>
        <section className="panel form spaced">
          <h3>
            <Radio size={18} /> Studio bridge
          </h3>
          <Badge value={s.studioStatus} />
          <p>
            {s.studioTools.length} official tools discovered. Permissions are
            restricted by agent role.
          </p>
          <Button disabled={busy} onClick={() => act("connect", {})}>
            Connect / reconnect
          </Button>
        </section>
        <section className="panel form spaced">
          <h3>Recovery & rollback</h3>
          <p>
            Forge records every call and preserves uncertain outcomes for
            inspection. The current official MCP API has no general rollback
            tool. Use Studio’s saved place versions or Undo when applicable;
            verify the restored game before retrying.
          </p>
        </section>
      </div>
    </div>
  );
}
