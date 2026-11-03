import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, get, set, event, addTask } from "./store";
import { type StudioInstance } from "./mcp";
const selection = z
  .object({
    gameId: z.string().min(1).max(200),
    oldStudioId: z.string().trim().max(200),
    newStudioId: z.string().trim().min(1).max(200),
  })
  .strict();
type Selection = z.infer<typeof selection>;
type Discovery = () => Promise<{ instances: StudioInstance[] }>;
const previews = new Map<
  string,
  {
    input: Selection;
    fingerprint: string;
    expires: number;
    target: StudioInstance;
  }
>();
export function requireIdle(active: Set<string>) {
  if (
    !get("paused") ||
    active.size ||
    db.prepare("SELECT id FROM tasks WHERE status='running' LIMIT 1").get()
  )
    throw new Error(
      "Pause the team and wait for active operations to finish before changing Studio connections or resetting Forge.",
    );
}
function state(input: Selection) {
  const game: any = db
    .prepare("SELECT * FROM games WHERE id=?")
    .get(input.gameId);
  if (!game) throw new Error("Project not found");
  const runs: any[] = db
    .prepare(
      "SELECT * FROM runs WHERE game_id=? AND COALESCE(studio_id,'')=? AND status NOT IN ('accepted','cancelled') ORDER BY id",
    )
    .all(game.id, input.oldStudioId);
  if (game.studio_id !== input.oldStudioId && !runs.length)
    throw new Error(
      "This Studio target does not belong to the selected project's unfinished work",
    );
  const tasks: any[] = runs.flatMap((r) =>
    db.prepare("SELECT * FROM tasks WHERE run_id=? ORDER BY id").all(r.id),
  );
  const approvals = tasks.flatMap((t) =>
    db.prepare("SELECT * FROM approvals WHERE task_id=? ORDER BY id").all(t.id),
  );
  const calls = tasks.flatMap((t) =>
    db
      .prepare("SELECT * FROM tool_calls WHERE task_id=? ORDER BY id")
      .all(t.id),
  );
  return { game, runs, tasks, approvals, calls };
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function checkTarget(input: Selection, instances: StudioInstance[], game: any) {
  if (input.oldStudioId === input.newStudioId)
    throw new Error("Choose a different Studio instance");
  if (input.oldStudioId && instances.some((s) => s.id === input.oldStudioId))
    throw new Error(
      "The previous Studio is still available. Use a separate project to target a different game; stale-instance recovery cannot redirect a live target.",
    );
  const target = instances.find((s) => s.id === input.newStudioId);
  if (!target)
    throw new Error(
      "The new Studio instance is not available. Refresh discovery before confirming.",
    );
  const known =
    get<Record<string, StudioInstance>>("studioKnownInstances") || {};
  if (
    game.place_id &&
    known[input.oldStudioId]?.placeId &&
    game.place_id !== known[input.oldStudioId].placeId
  )
    throw new Error(
      "The project Place ID conflicts with its previous Studio identity. Restore the correct project metadata or create a separate project.",
    );
  const expectedPlace = game.place_id || known[input.oldStudioId]?.placeId;
  const expectedUniverse =
    game.universe_id || known[input.oldStudioId]?.universeId;
  if (expectedPlace && target.placeId !== expectedPlace)
    throw new Error(
      "Place ID does not match the selected game, or the new Studio did not report it. Open the correct place before switching.",
    );
  if (
    expectedUniverse &&
    target.universeId &&
    target.universeId !== expectedUniverse
  )
    throw new Error("Universe ID does not match the selected game");
  for (const id of [input.oldStudioId, input.newStudioId]) {
    const uncertain = db
      .prepare(
        "SELECT c.id FROM tool_calls c JOIN tasks t ON t.id=c.task_id JOIN runs r ON r.id=t.run_id WHERE r.studio_id=? AND c.status IN ('running','uncertain') LIMIT 1",
      )
      .get(id);
    if (
      uncertain ||
      db.prepare("SELECT owner FROM locks WHERE name=?").get(`studio:${id}`)
    )
      throw new Error(
        "Resolve uncertain Studio operations in Reviews before switching instances",
      );
  }
  return target;
}
export async function previewStudioSwitch(
  body: unknown,
  active: Set<string>,
  discover: Discovery,
) {
  requireIdle(active);
  const input = selection.parse(body);
  const { instances } = await discover();
  requireIdle(active);
  const current = state(input),
    target = checkTarget(input, instances, current.game);
  for (const [id, p] of previews)
    if (p.expires < Date.now()) previews.delete(id);
  if (previews.size > 30) previews.clear();
  const token = randomUUID();
  previews.set(token, {
    input,
    fingerprint: hash(current),
    expires: Date.now() + 300000,
    target,
  });
  return {
    token,
    gameId: current.game.id,
    gameName: current.game.name,
    oldStudioId: input.oldStudioId,
    newStudioId: target.id,
    target,
    runCount: current.runs.length,
    taskCount: current.tasks.filter(
      (t) => !["completed", "cancelled"].includes(t.status),
    ).length,
    placeVerified: !!(
      current.game.place_id ||
      (get<any>("studioKnownInstances") || {})[input.oldStudioId]?.placeId
    ),
  };
}
// Preserve completed evidence and internal delegation IDs. Withdraw only Studio
// intents that were never confirmed, so an approval from the old session cannot execute.
export function invalidateStudioIntents(t: any, oldId: string, newId: string) {
  const messages: any[] = JSON.parse(t.messages);
  const internal = new Set([
    "remember",
    "delegate",
    "handoff",
    "ask_human",
    "save_artifact",
    "save_pitch",
    "library_search",
    "library_read",
  ]);
  const answered = new Set(
    messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
  );
  for (const m of messages) {
    if (m.role === "user")
      try {
        const context = JSON.parse(m.content);
        if (
          context &&
          typeof context === "object" &&
          context.studio_id === oldId
        ) {
          context.studio_id = newId;
          m.content = JSON.stringify(context);
        }
      } catch {
        /* User prose is retained, not globally replaced. */
      }
    if (m.role !== "assistant") continue;
    for (const call of m.tool_calls || []) {
      const name = call.function?.name;
      if (internal.has(name) || answered.has(call.id)) continue;
      // Any non-internal call is a Studio intent, including no-longer-advertised tools.
      const ledger: any = db
        .prepare("SELECT * FROM tool_calls WHERE id=?")
        .get(`${t.id}:${call.id}`);
      if (
        ledger?.status === "done" ||
        ledger?.status === "uncertain" ||
        ledger?.status === "running"
      )
        continue;
      let args: any;
      try {
        args = JSON.parse(call.function.arguments);
        if (args?.studio_id === oldId) {
          delete args.studio_id;
          call.function.arguments = JSON.stringify(args);
        }
      } catch {}
      const result = JSON.stringify({
        cancelled: true,
        executed: false,
        reason:
          "Studio connection changed by user. Inspect the current game and propose a fresh call; old approvals are not valid.",
      });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      answered.add(call.id);
      db.prepare(
        "INSERT OR REPLACE INTO tool_calls(id,task_id,tool,args,status,result) VALUES (?,?,?,?,'cancelled',?)",
      ).run(
        `${t.id}:${call.id}`,
        t.id,
        name,
        JSON.stringify(args || {}),
        result,
      );
    }
  }
  db.prepare(
    "UPDATE approvals SET status='cancelled',note='Studio connection changed; propose and approve a fresh operation',decided_at=CURRENT_TIMESTAMP WHERE task_id=? AND status IN ('pending','approved') AND NOT EXISTS (SELECT 1 FROM tool_calls c WHERE c.id=approvals.task_id || ':' || approvals.call_id AND c.status='done')",
  ).run(t.id);
  db.prepare("DELETE FROM studio_inspections WHERE task_id=?").run(t.id);
  if (
    messages.length &&
    !messages.some(
      (m) =>
        m.role === "assistant" &&
        m.tool_calls?.some((c: any) => !answered.has(c.id)),
    )
  )
    messages.push({
      role: "user",
      content: `The user confirmed a Studio connection change. Current target: ${newId || "unassigned; wait for a confirmed connection"}. Earlier Studio IDs are historical evidence only. Do not replay completed operations. Old pending Studio calls and approvals were cancelled. Inspect the current hierarchy/scripts before making new changes and gather fresh verification evidence.`,
    });
  const stale =
    /pinned Studio|Tool target differs|selected Studio instance|Studio.*not.*(?:connected|available)|Studio connection changed/i.test(
      t.error || "",
    );
  const status =
    t.status === "approval" ||
    (["failed", "blocked"].includes(t.status) && stale)
      ? "queued"
      : t.status;
  db.prepare(
    "UPDATE tasks SET messages=?,status=?,error=?,result=?,attempts=?,next_at=0,stop_requested=NULL,updated=CURRENT_TIMESTAMP WHERE id=?",
  ).run(
    JSON.stringify(messages),
    status,
    stale || t.status === "approval" ? null : t.error,
    t.agent === "Tester" ? "" : t.result,
    stale ? 0 : t.attempts,
    t.id,
  );
}
export function retargetProject(
  input: Selection,
  current: ReturnType<typeof state>,
  target: StudioInstance,
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO studio_pin_changes(id,game_id,old_studio_id,new_studio_id,details) VALUES (?,?,?,?,?)",
  ).run(
    id,
    input.gameId,
    input.oldStudioId,
    input.newStudioId,
    JSON.stringify({ target, before: current }),
  );
  db.prepare(
    "UPDATE games SET studio_id=?,updated=CURRENT_TIMESTAMP WHERE id=?",
  ).run(input.newStudioId, input.gameId);
  for (const run of current.runs) {
    db.prepare(
      "UPDATE runs SET studio_id=?,studio_pin_revision=studio_pin_revision+1,status=CASE WHEN status='review' THEN 'active' ELSE status END WHERE id=?",
    ).run(input.newStudioId, run.id);
    for (const t of current.tasks.filter(
      (t) =>
        t.run_id === run.id && !["completed", "cancelled"].includes(t.status),
    ))
      invalidateStudioIntents(t, input.oldStudioId, input.newStudioId);
    if (
      !current.tasks.some(
        (t) =>
          t.run_id === run.id &&
          t.agent === "Tester" &&
          !["completed", "cancelled"].includes(t.status),
      )
    )
      addTask(
        run.id,
        "Tester",
        "Verify reopened Studio session",
        "Independently inspect the reopened game, verify completed work still exists, playtest and gather fresh console evidence before user review.",
        current.tasks
          .filter(
            (t) =>
              t.run_id === run.id &&
              t.agent !== "Tester" &&
              t.status !== "cancelled",
          )
          .map((t) => t.id),
      );
  }
  set("featureRevision", (get<number>("featureRevision") || 0) + 1);
  event(
    `Confirmed Studio switch for ${current.game.name}: ${input.oldStudioId || "unassigned"} → ${input.newStudioId}`,
    "User",
  );
  return {
    ok: true,
    changeId: id,
    runCount: current.runs.length,
    paused: true,
  };
}
export async function confirmStudioSwitch(
  body: unknown,
  active: Set<string>,
  discover: Discovery,
) {
  const a = z
    .object({
      token: z.string(),
      confirmationName: z.string(),
      sameGameConfirmed: z.literal(true),
    })
    .strict()
    .parse(body);
  requireIdle(active);
  const preview = previews.get(a.token);
  if (!preview || preview.expires < Date.now())
    throw new Error(
      "This switch preview expired. Review a fresh preview before confirming.",
    );
  if (a.confirmationName !== state(preview.input).game.name)
    throw new Error("Type the exact project name to confirm the target game");
  const { instances } = await discover();
  requireIdle(active);
  return db.transaction(() => {
    const current = state(preview.input),
      target = checkTarget(preview.input, instances, current.game);
    if (
      hash(current) !== preview.fingerprint ||
      hash(target) !== hash(preview.target)
    )
      throw new Error(
        "The project or Studio instance changed after preview. Review the switch again.",
      );
    const out = retargetProject(preview.input, current, target);
    previews.delete(a.token);
    return out;
  })();
}
