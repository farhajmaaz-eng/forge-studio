"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUpRight,
  Check,
  GitBranch,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { roles } from "@/lib/roles";
import { displayDate, gameForTask } from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Avatar } from "./agent-avatar";
import { Button } from "./ui/button";
import { ConfirmDialog, EmptyState } from "./ui/workspace-primitives";
import AgentForm from "./agent-settings";
import { PublicMessages, TaskControls, TaskInspector } from "./task-workspace";
import { ResourceState, StatusChip, type Act } from "./feature-ui";

export function PlanReview({
  data,
  run,
  act,
  busy,
}: {
  data: any;
  run: any;
  act: Act;
  busy: boolean;
}) {
  const tasks = data.tasks.filter((t: any) => t.run_id === run.id);
  const planned = tasks.filter((t: any) => t.agent !== "Lead");
  const waiting = run.plan_status === "pending";
  const ready =
    tasks.some((t: any) => t.agent === "Lead" && t.status === "completed") &&
    !tasks.some((t: any) => t.agent === "Lead" && t.status !== "completed");
  return (
    <section className="panel v2-plan">
      <div className="panel-heading">
        <h3>
          <GitBranch size={16} />
          {waiting ? "Plan needs your approval" : "Delegation & progress"}
        </h3>
        <StatusChip status={waiting ? "pending" : run.status} />
      </div>
      <p>{run.request}</p>
      {planned.length ? (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("plans/approve", {
              id: run.id,
              adjustments: planned
                .filter((t: any) => t.status === "queued" && !t.steps)
                .map((t: any) => ({
                  id: t.id,
                  instructions: f.get(`instructions-${t.id}`) || t.instructions,
                  acceptance: f.get(`acceptance-${t.id}`) || t.acceptance || "",
                })),
            });
          }}
        >
          <div className="v2-plan-tasks">
            {planned.map((t: any) => (
              <div key={t.id}>
                <Avatar name={t.agent} size="mini" />
                <div>
                  <Link href={`/tasks?task=${encodeURIComponent(t.id)}`}>
                    <strong>{t.title}</strong>
                  </Link>
                  <small>
                    {t.agent} · {JSON.parse(t.deps || "[]").length} dependencies
                  </small>
                  {t.acceptance && <p>{t.acceptance}</p>}
                </div>
                <StatusChip status={t.status} />
              </div>
            ))}
          </div>
          {waiting && ready && (
            <>
              <details>
                <summary>Adjust the plan before execution</summary>
                {planned
                  .filter((t: any) => t.status === "queued" && !t.steps)
                  .map((t: any) => (
                    <fieldset key={t.id}>
                      <legend>
                        {t.agent} · {t.title}
                      </legend>
                      <label>
                        Instructions
                        <textarea
                          name={`instructions-${t.id}`}
                          defaultValue={t.instructions}
                          required
                          rows={3}
                        />
                      </label>
                      <label>
                        Acceptance criteria
                        <textarea
                          name={`acceptance-${t.id}`}
                          defaultValue={t.acceptance}
                          rows={2}
                        />
                      </label>
                    </fieldset>
                  ))}
              </details>
              <Button
                className="approve-button"
                variant="outline"
                disabled={busy}
              >
                <Check size={14} />
                Approve execution plan
              </Button>
              <small>
                Studio tool approvals remain separate. No publishing permission
                is granted.
              </small>
            </>
          )}
        </form>
      ) : (
        <p className="plain-empty">
          {ready
            ? "Lead has not delegated implementation work yet."
            : "Lead’s delegated tasks appear as the plan is prepared."}
        </p>
      )}
      {waiting && !ready && (
        <small>Specialists wait while Lead prepares the plan.</small>
      )}
    </section>
  );
}
export function LeadWorkspace({
  data,
  selectedGame,
  composer,
  act,
  busy,
}: {
  data: any;
  selectedGame: string;
  composer: ReactNode;
  act: Act;
  busy: boolean;
}) {
  const [cancel, setCancel] = useState<string | null>(null);
  const runs = data.runs.filter(
    (r: any) => !selectedGame || r.game_id === selectedGame,
  );
  const ids = new Set(runs.map((r: any) => r.id));
  const messages = data.chat.filter((m: any) => ids.has(m.run_id));
  const streams = (data.agentUpdates || []).filter(
    (m: any) =>
      m.actor === "Lead" &&
      m.status === "streaming" &&
      ids.has(data.tasks.find((t: any) => t.id === m.task_id)?.run_id),
  );
  const current = runs.find((r: any) =>
    ["active", "paused"].includes(r.status),
  );
  return (
    <div className="chat-layout">
      <section className="panel chat-panel">
        <div className="panel-heading">
          <h3>
            <Avatar name="Lead" size="mini" />
            Lead{" "}
            <span className="subtle">Orchestrator · project conversation</span>
          </h3>
          <StatusChip
            status={data.keyConfigured ? "ready" : "not configured"}
          />
        </div>
        <div className="messages" aria-live="polite">
          {messages.length ? (
            messages.map((m: any) => (
              <div className={`message ${m.role}`} key={m.id}>
                {m.role !== "user" && <Avatar name="Lead" size="mini" />}
                <div>
                  <small>
                    {m.role === "user" ? "You" : "Lead"} ·{" "}
                    {displayDate(m.created)}
                  </small>
                  <div className="message-content reference-markdown">
                    <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<GitBranch />}
              title="No conversation for this project"
            >
              Select a game and describe the goal and acceptance criteria.
            </EmptyState>
          )}
          {!!streams.length && <PublicMessages messages={streams} />}
        </div>
        {composer}
      </section>
      <aside className="v2-stack">
        {current && (
          <>
            <PlanReview data={data} run={current} act={act} busy={busy} />
            <section className="panel">
              <h3>Run controls</h3>
              <p className="muted-text">
                In-flight operations finish before work stops.
              </p>
              <div className="actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void act("runs/control", {
                      id: current.id,
                      action: current.status === "paused" ? "resume" : "pause",
                    })
                  }
                >
                  {current.status === "paused" ? "Resume run" : "Pause run"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setCancel(current.id)}
                >
                  Cancel run
                </Button>
              </div>
            </section>
          </>
        )}
        <section className="panel form">
          <h3>
            <ShieldCheck size={16} />
            Human review stays in control
          </h3>
          <p>
            Lead delegates to specialists, Tester verifies Studio evidence, and
            you decide whether to accept the work. Each new request has its own
            project and execution plan.
          </p>
          <Link href="/reviews" className="text-link">
            Open review queue <ArrowUpRight size={13} />
          </Link>
        </section>
        {runs
          .filter((r: any) => r.id !== current?.id)
          .slice(0, 5)
          .map((r: any) => (
            <section className="panel" key={r.id}>
              <StatusChip status={r.status} />
              <p>{r.request}</p>
              <Link
                className="text-link"
                href={`/tasks?task=${data.tasks.find((t: any) => t.run_id === r.id)?.id || ""}`}
              >
                Open tasks <ArrowUpRight size={13} />
              </Link>
            </section>
          ))}
      </aside>
      {cancel && (
        <ConfirmDialog
          title="Cancel this run?"
          confirmLabel="Cancel run"
          pending={busy}
          close={() => setCancel(null)}
          confirm={async () => {
            if (await act("runs/control", { id: cancel, action: "cancel" }))
              setCancel(null);
          }}
        >
          Queued tasks will be cancelled. Active operations finish at a safe
          boundary; this does not undo existing Studio changes.
        </ConfirmDialog>
      )}
    </div>
  );
}
export default function AgentWorkspace({
  data,
  selectedAgent,
  selectAgent,
  selectedGame,
  act,
  busy,
}: {
  data: any;
  selectedAgent: string;
  selectAgent: (name: string) => void;
  selectedGame: string;
  act: Act;
  busy: boolean;
}) {
  const [query, setQuery] = useState(""),
    [taskId, setTaskId] = useState("");
  const agent =
    data.agents.find((a: any) => a.name === selectedAgent) || data.agents[0];
  const tasks = data.tasks.filter(
    (t: any) =>
      t.agent === agent?.name &&
      (!selectedGame || gameForTask(data, t)?.id === selectedGame),
  );
  const activeTask =
    tasks.find((t: any) => t.id === taskId) ||
    tasks.find((t: any) => t.status === "running") ||
    tasks[0];
  const latest = (data.agentUpdates || []).find(
    (m: any) => m.task_id === activeTask?.id,
  );
  const info = useResource(
    activeTask ? `tasks/detail?id=${encodeURIComponent(activeTask.id)}` : null,
    `${activeTask?.updated}:${activeTask?.status}:${latest?.content?.length || 0}`,
  );
  const messages = new Map<string, any>(
    (info.data?.messages || []).map((m: any) => [m.id, m]),
  );
  if (latest) messages.set(latest.id, latest);
  const [messageError, setMessageError] = useState("");
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    setMessageKey(crypto.randomUUID());
  }, [selectedAgent, selectedGame]);
  return (
    <div className="v2-agent-workspace">
      <aside className="panel v2-roster">
        <label className="v2-search">
          <Search size={15} />
          <input
            aria-label="Search agents"
            placeholder="Search agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {data.agents
          .filter((a: any) =>
            `${a.name} ${roles[a.name as keyof typeof roles]?.title}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((a: any) => {
            const own = data.tasks.filter((t: any) => t.agent === a.name);
            const active = own.find((t: any) =>
              ["running", "approval", "blocked", "failed"].includes(t.status),
            );
            const status = !a.enabled ? "disabled" : active?.status || "idle";
            return (
              <button
                key={a.name}
                className={`team-card v2-agent-row ${a.name === agent?.name ? "selected" : ""}`}
                onClick={() => {
                  selectAgent(a.name);
                  setTaskId("");
                }}
              >
                <Avatar name={a.name} working={status === "running"} />
                <span>
                  <h2>{a.name}</h2>
                  <small>{roles[a.name as keyof typeof roles]?.title}</small>
                  <p>{active?.title || "No active task"}</p>
                </span>
                <StatusChip status={status} />
              </button>
            );
          })}
      </aside>
      <section className="v2-stack">
        {agent && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h3>
                  <Avatar name={agent.name} />
                  {agent.name} · work & conversation
                </h3>
                <span className="muted-text">{tasks.length} tasks</span>
              </div>
              {activeTask ? (
                <>
                  <label className="v2-task-select">
                    Assigned task
                    <select
                      value={activeTask.id}
                      onChange={(e) => setTaskId(e.target.value)}
                    >
                      {tasks.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.title} · {t.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="v2-assignment">
                    From {activeTask.requester || "Lead"} ·{" "}
                    {gameForTask(data, activeTask)?.name || "Workspace"}
                  </p>
                  <TaskControls task={activeTask} act={act} busy={busy} />
                  <details open>
                    <summary>Task instructions</summary>
                    <div className="reference-markdown">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {activeTask.instructions}
                      </Markdown>
                    </div>
                  </details>
                  <ResourceState loading={info.loading} error={info.error}>
                    <PublicMessages messages={[...messages.values()]} />
                  </ResourceState>
                  <details>
                    <summary>Outputs, tools & approvals</summary>
                    <TaskInspector
                      task={activeTask}
                      data={data}
                      act={act}
                      busy={busy}
                    />
                  </details>
                </>
              ) : (
                <EmptyState icon={<GitBranch />} title="No assigned work">
                  Tasks assigned to this agent for the selected project will
                  appear here.
                </EmptyState>
              )}
              <form
                className="form v2-agent-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  setMessageError("");
                  const f = new FormData(form);
                  if (
                    await act("agents/message", {
                      agent: agent.name,
                      gameId: selectedGame,
                      content: f.get("content"),
                      taskId: activeTask?.id,
                      requestKey: messageKey,
                    })
                  ) {
                    form.reset();
                    setMessageKey(crypto.randomUUID());
                  } else
                    setMessageError(
                      "Your follow-up was not queued. Check the project and agent configuration.",
                    );
                }}
              >
                <label>
                  Queue a follow-up for {agent.name}
                  <textarea
                    name="content"
                    required
                    minLength={5}
                    maxLength={20000}
                    rows={3}
                    placeholder="Give this agent a concrete follow-up objective…"
                  />
                </label>
                <small>
                  A follow-up is a new tracked request. It does not alter an
                  operation already running.
                </small>
                {messageError && (
                  <p className="failure-text" role="alert">
                    {messageError}
                  </p>
                )}
                <Button disabled={busy || !selectedGame || !agent.enabled}>
                  <Send size={14} />
                  Queue follow-up
                </Button>
              </form>
            </section>
            <AgentForm
              key={agent.name}
              agent={agent}
              busy={busy}
              save={(b) => void act("agents", b)}
            />
            <section className="panel">
              <h3>{agent.name}’s memory & history</h3>
              {data.memories
                .filter((m: any) => m.agent === agent.name)
                .map((m: any) => (
                  <pre key={m.id}>{m.content}</pre>
                ))}
              {!data.memories.some((m: any) => m.agent === agent.name) && (
                <p className="muted-text">
                  This agent has no saved memories yet.
                </p>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
