"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { roles } from "@/lib/roles";
import { displayDate, gameForTask, priorities } from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Avatar } from "./agent-avatar";
import { Button } from "./ui/button";
import {
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
} from "./ui/workspace-primitives";
import { ResourceState, StatusChip, type Act } from "./feature-ui";

export function TaskControls({
  task,
  act,
  busy,
}: {
  task: any;
  act: Act;
  busy: boolean;
}) {
  const [cancel, setCancel] = useState(false);
  return (
    <div className="v2-task-controls">
      {["queued", "running", "approval"].includes(task.status) && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!task.stop_requested}
          onClick={() =>
            void act("tasks/control", { id: task.id, action: "pause" })
          }
        >
          <Pause size={13} />
          Pause
        </Button>
      )}
      {task.status === "paused" && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void act("tasks/control", { id: task.id, action: "resume" })
          }
        >
          <Play size={13} />
          Resume
        </Button>
      )}
      {["failed", "blocked"].includes(task.status) && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void act("retry", { id: task.id })}
        >
          <RotateCcw size={13} />
          Retry task
        </Button>
      )}
      {!["completed", "cancelled"].includes(task.status) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !!task.stop_requested}
          onClick={() => setCancel(true)}
        >
          <X size={13} />
          Cancel task
        </Button>
      )}
      {task.stop_requested && (
        <small>
          {task.stop_requested} requested · waiting for the current operation
        </small>
      )}
      {cancel && (
        <ConfirmDialog
          title="Cancel this task?"
          confirmLabel="Cancel task"
          pending={busy}
          close={() => setCancel(false)}
          confirm={async () => {
            if (await act("tasks/control", { id: task.id, action: "cancel" }))
              setCancel(false);
          }}
        >
          Further steps will stop at the next execution boundary. A Studio
          operation already in progress may finish; completed changes are
          preserved.
        </ConfirmDialog>
      )}
    </div>
  );
}

export function TaskInspector({
  task,
  data,
  act,
  busy,
}: {
  task: any;
  data: any;
  act: Act;
  busy: boolean;
}) {
  const info = useResource(
    `tasks/detail?id=${encodeURIComponent(task.id)}`,
    `${task.updated}:${task.status}:${task.steps}:${task.stop_requested}:${data.settings.featureRevision || 0}`,
  );
  return (
    <div className="task-body v2-inspector">
      <p>{task.instructions}</p>
      <div className="v2-meta-line">
        <span>Owner: {task.agent}</span>
        <span>Requested by {task.requester || "Lead"}</span>
        <span>Created {displayDate(task.created)}</span>
        <span>Updated {displayDate(task.updated)}</span>
      </div>
      <dl className="v2-detail-list">
        <div>
          <dt>Acceptance criteria</dt>
          <dd>
            {task.acceptance ||
              "See the task instructions and verification evidence."}
          </dd>
        </div>
        <div>
          <dt>Dependencies</dt>
          <dd>
            {JSON.parse(task.deps || "[]").map((id: string) => (
              <Link
                className="text-link"
                key={id}
                href={`/tasks?task=${encodeURIComponent(id)}`}
              >
                {data.tasks.find((t: any) => t.id === id)?.title || id}
              </Link>
            ))}
            {!JSON.parse(task.deps || "[]").length && "No dependencies"}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>
            Attempt {task.attempts || 0} · {task.steps || 0} model steps. Step
            count is activity, not a completion percentage.
          </dd>
        </div>
      </dl>
      {task.error && <p className="failure">{task.error}</p>}
      {task.result && (
        <div className="reference-markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{task.result}</Markdown>
        </div>
      )}
      <TaskControls task={task} act={act} busy={busy} />
      {["queued", "paused", "failed", "blocked"].includes(task.status) && (
        <div className="v2-inline-fields">
          <label>
            Priority
            <select
              aria-label={`Priority for ${task.title}`}
              value={task.priority ?? 1}
              disabled={busy}
              onChange={(e) =>
                void act("tasks/update", {
                  id: task.id,
                  priority: Number(e.target.value),
                })
              }
            >
              {priorities.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {!task.steps &&
            !(
              task.agent === "Lead" &&
              data.runs.find((r: any) => r.id === task.run_id)?.plan_status ===
                "pending"
            ) && (
              <label>
                Assignee
                <select
                  aria-label={`Assignee for ${task.title}`}
                  value={task.agent}
                  disabled={busy}
                  onChange={(e) =>
                    void act("tasks/update", {
                      id: task.id,
                      agent: e.target.value,
                    })
                  }
                >
                  {data.agents.map((a: any) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
        </div>
      )}
      <ResourceState loading={info.loading} error={info.error}>
        {info.data && (
          <>
            {!!info.data.messages.length && (
              <details>
                <summary>
                  Conversation & action summaries ({info.data.messages.length})
                </summary>
                <PublicMessages messages={info.data.messages} />
              </details>
            )}
            {!!info.data.tools.length && (
              <details>
                <summary>Tool activity ({info.data.tools.length})</summary>
                {info.data.tools.map((c: any) => (
                  <details className="v2-tool-entry" key={c.id}>
                    <summary>
                      {c.tool} <StatusChip status={c.status} />
                    </summary>
                    <pre>{c.args}</pre>
                    <pre>{c.result || "No result recorded"}</pre>
                  </details>
                ))}
              </details>
            )}
            {!!info.data.approvals.length && (
              <Link href="/reviews" className="text-link">
                Open {info.data.approvals.length} associated approvals{" "}
                <ArrowUpRight size={13} />
              </Link>
            )}
            {!!info.data.assets.length && (
              <div>
                <h4>Artifacts</h4>
                {info.data.assets.map((a: any) => (
                  <Link
                    className="text-link"
                    key={a.id}
                    href={`/library?tab=assets&asset=${encodeURIComponent(a.id)}`}
                  >
                    {a.name} <ArrowUpRight size={13} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </ResourceState>
    </div>
  );
}
export function PublicMessages({ messages }: { messages: any[] }) {
  return (
    <div className="v2-public-messages">
      {messages.map((m) => (
        <article
          key={m.id}
          className={`v2-public-message ${m.actor === "User" ? "from-user" : ""}`}
        >
          <small>
            {m.actor} · {m.kind} · {displayDate(m.created)}{" "}
            {m.status === "streaming"
              ? "· streaming"
              : m.status === "interrupted"
                ? "· interrupted"
                : ""}
          </small>
          <div className="reference-markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
          </div>
        </article>
      ))}
    </div>
  );
}

export function NewTaskDialog({
  data,
  gameId,
  initial,
  act,
  busy,
  close,
}: {
  data: any;
  gameId: string;
  initial?: string;
  act: Act;
  busy: boolean;
  close: () => void;
}) {
  const [agent, setAgent] = useState("Lead"),
    [project, setProject] = useState(gameId),
    [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <DetailDrawer
      title="New task"
      subtitle="Describe the goal, choose a project, and let Lead plan or assign a specialist."
      close={close}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget);
          const result = await act("tasks/create", {
            gameId: project,
            objective: f.get("objective"),
            agent,
            priority: Number(f.get("priority")),
            acceptance: f.get("acceptance"),
            dependencies: f.getAll("dependencies"),
            reviewPlan: f.get("reviewPlan") === "on",
            requestKey,
          });
          if (result) close();
          else
            setError(
              "The task was not created. Check the selected project and agent, then try again.",
            );
        }}
      >
        <label>
          Project
          <select
            required
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">Select a game</option>
            {data.games
              .filter((g: any) => g.stage !== "archived")
              .map((g: any) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {!g.studio_id ? " · planning only" : ""}
                </option>
              ))}
          </select>
        </label>
        {!data.games.length && (
          <Link href="/games" className="text-link">
            Add a project first <ArrowUpRight size={13} />
          </Link>
        )}
        <label>
          Objective
          <textarea
            name="objective"
            required
            minLength={5}
            maxLength={20000}
            rows={4}
            defaultValue={initial}
            placeholder="What should change, and why?"
          />
        </label>
        <div className="form-grid">
          <label>
            Assign to
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              {data.agents.map((a: any) => (
                <option disabled={!a.enabled} key={a.name} value={a.name}>
                  {a.name === "Lead"
                    ? "Lead · automatic delegation"
                    : `${a.name} · ${roles[a.name as keyof typeof roles]?.title || "Agent"}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" aria-label="Priority" defaultValue="1">
              {priorities.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Acceptance criteria
          <textarea
            name="acceptance"
            rows={3}
            placeholder="How should Tester verify the result?"
          />
        </label>
        <label>
          Dependencies
          <select key={project} multiple name="dependencies" size={3}>
            {data.tasks
              .filter(
                (t: any) =>
                  gameForTask(data, t)?.id === project &&
                  !["cancelled", "failed"].includes(t.status),
              )
              .map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.title} · {t.status}
                </option>
              ))}
          </select>
          <small>Optional. Use Ctrl/Cmd to select multiple tasks.</small>
        </label>
        {agent === "Lead" && (
          <label className="checkbox">
            <input type="checkbox" name="reviewPlan" defaultChecked />
            Review the plan before specialists start
          </label>
        )}
        <p>
          Studio writes still require their own approvals. Actual model costs
          count toward your existing workspace budget.
        </p>
        {error && (
          <p className="failure-text" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy || !project}>
          {busy ? "Creating…" : "Create task"}
          <Plus size={14} />
        </Button>
      </form>
    </DetailDrawer>
  );
}

export default function TaskWorkspace({
  data,
  act,
  busy,
  newTask,
  focusedTaskId,
  focusVersion,
}: {
  data: any;
  act: Act;
  busy: boolean;
  newTask: () => void;
  focusedTaskId: string;
  focusVersion: number;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("priority"),
    [limit, setLimit] = useState(50);
  const tasks: any[] = data.tasks;
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (focusedTaskId) {
      setQuery("");
      setFilter("all");
      setLimit(tasks.length || 50);
      setExpandedTasks((previous) =>
        previous.has(focusedTaskId)
          ? previous
          : new Set([...previous, focusedTaskId]),
      );
    }
  }, [focusedTaskId, focusVersion, tasks.length]);
  useEffect(() => {
    if (!focusedTaskId) return;
    const el = document.getElementById(
      `task-${focusedTaskId}`,
    ) as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({ block: "center" });
    }
  }, [focusedTaskId, focusVersion, filter, limit]);
  const filtered = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            (filter === "all" || t.status === filter) &&
            `${t.title} ${t.agent} ${gameForTask(data, t)?.name || ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "priority"
            ? (b.priority ?? 1) - (a.priority ?? 1) ||
              b.created.localeCompare(a.created)
            : sort === "oldest"
              ? a.created.localeCompare(b.created)
              : b.created.localeCompare(a.created),
        ),
    [tasks, data, filter, query, sort],
  );
  const visible = filtered.slice(0, limit);
  const groups = [
    { title: "Working now", states: ["running", "approval"] },
    { title: "Queued", states: ["queued", "paused"] },
    {
      title: "History & blockers",
      states: ["completed", "failed", "blocked", "cancelled"],
    },
  ];
  return (
    <>
      <section className="panel queue-summary">
        <div>
          <h3>Task progress</h3>
          <p>
            {tasks.filter((t) => t.status === "completed").length} of{" "}
            {tasks.length} completed ·{" "}
            {tasks.filter((t) => t.status === "running").length} working
          </p>
        </div>
        <Button variant="outline" onClick={newTask}>
          <Plus size={14} />
          New task
        </Button>
      </section>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Task status">
          {[
            "all",
            "running",
            "queued",
            "approval",
            "paused",
            "completed",
            "failed",
            "blocked",
            "cancelled",
          ].map((f) => (
            <button
              key={f}
              className={f === filter ? "current" : ""}
              aria-pressed={f === filter}
              onClick={() => {
                setFilter(f);
                setLimit(50);
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          aria-label="Search tasks"
          placeholder="Search tasks, agents or games…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(50);
          }}
        />
        <select
          className="v2-sort"
          aria-label="Sort tasks"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="priority">Priority</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {!filtered.length && (
        <section className="panel">
          <EmptyState
            icon={<ClipboardList />}
            title={tasks.length ? "No matching tasks" : "No tasks yet"}
          >
            {tasks.length
              ? "Try a different status or search."
              : "Create a task or send a request to Lead to start."}
          </EmptyState>
        </section>
      )}
      {groups.map((group) => {
        const items = visible.filter((t) => group.states.includes(t.status));
        if (!items.length) return null;
        return (
          <section key={group.title} className="v2-task-group">
            <div className="section-heading">
              <h2>
                <span
                  className={`dot ${group.title === "Working now" ? "green" : group.title === "Queued" ? "purple" : "muted"}`}
                />
                {group.title}
                <span className="subtle">{items.length}</span>
              </h2>
            </div>
            <div className="panel task-list">
              {items.map((t) => (
                <TaskItem
                  key={t.id}
                  expanded={expandedTasks.has(t.id)}
                  onExpanded={(value) =>
                    setExpandedTasks((previous) => {
                      if (previous.has(t.id) === value) return previous;
                      const next = new Set(previous);
                      if (value) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    })
                  }
                  task={t}
                  data={data}
                  act={act}
                  busy={busy}
                />
              ))}
            </div>
          </section>
        );
      })}
      {filtered.length > limit && (
        <Button variant="outline" onClick={() => setLimit((l) => l + 50)}>
          Show 50 more · {filtered.length - limit} remaining
        </Button>
      )}
    </>
  );
}
function TaskItem({
  expanded,
  onExpanded,
  task: t,
  data,
  act,
  busy,
}: {
  expanded: boolean;
  onExpanded: (value: boolean) => void;
  task: any;
  data: any;
  act: Act;
  busy: boolean;
}) {
  const game = gameForTask(data, t);
  return (
    <details
      id={`task-${t.id}`}
      className="task-detail"
      open={expanded}
      onToggle={(e) => onExpanded(e.currentTarget.open)}
    >
      <summary>
        <div className="task-row">
          <Avatar name={t.agent} size="mini" working={t.status === "running"} />
          <div>
            <strong>{t.title}</strong>
            <small>
              {t.agent} · {game?.name || "Workspace"} ·{" "}
              {priorities[t.priority ?? 1]} ·{" "}
              {displayDate(t.updated || t.created)}
            </small>
          </div>
          <StatusChip status={t.status} />
          <ChevronRight size={14} />
        </div>
      </summary>
      {expanded && <TaskInspector task={t} data={data} act={act} busy={busy} />}
    </details>
  );
}
