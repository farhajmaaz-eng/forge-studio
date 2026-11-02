"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  Code2,
  FileCheck2,
  Image as ImageIcon,
  Images,
  ShieldCheck,
  TriangleAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
} from "./ui/workspace-primitives";
import { UsagePanel } from "./workspace-shell";
import { Avatar } from "./agent-avatar";
import { approvalGroups, formatPayload, reviewImages } from "@/lib/review";

function MediaPreview({ images, title }: { images: string[]; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!images.length || failed)
    return (
      <div className="media-unavailable">
        <Images size={28} />
        <span>Preview unavailable</span>
      </div>
    );
  return (
    <div className="media-preview">
      {/* Deliverables may be local, remote, or inline MCP images. */}
      <img
        src={images[0]}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {images.length > 1 && (
        <div className="media-thumbnails">
          {images.slice(1, 5).map((src, i) => (
            <img
              src={src}
              alt={`${title}, variant ${i + 2}`}
              key={src}
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Reviews({
  data,
  busy,
  act,
}: {
  data: any;
  busy: boolean;
  act: (path: string, body: any) => Promise<any>;
}) {
  const [selected, setSelected] = useState<{
    kind: "approval" | "run";
    id: string;
  } | null>(null);
  const [rejection, setRejection] = useState<any[] | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const groups = approvalGroups(data);
  const completed = data.runs.filter((r: any) =>
    ["review", "accepted"].includes(r.status),
  );
  const disabled = busy || batchPending;
  const selectedItem =
    selected?.kind === "approval"
      ? data.approvals.find((a: any) => a.id === selected.id)
      : data.runs.find((r: any) => r.id === selected?.id);
  const task =
    selected?.kind === "approval"
      ? data.tasks.find((t: any) => t.id === selectedItem?.task_id)
      : null;
  const runTasks: any[] = data.tasks.filter(
    (t: any) => t.run_id === selectedItem?.id,
  );
  const images =
    selected?.kind === "approval"
      ? reviewImages(selectedItem?.args)
      : runTasks.flatMap((t: any) => reviewImages(t.result));

  function openReview(kind: "approval" | "run", id: string) {
    setActionError("");
    setSelected({ kind, id });
  }

  async function mutate(path: string, body: any) {
    setActionError("");
    const result = await act(path, body);
    if (!result)
      setActionError(
        "This decision could not be recorded. Check the latest queue and try again.",
      );
    return result;
  }

  async function decide(items: any[], approved: boolean) {
    setBatchPending(true);
    setBatchNotice("");
    let recorded = 0;
    try {
      // The API accepts one approval at a time. Stop on any stale/failed item;
      // successful earlier decisions stay visible after each snapshot refresh.
      for (const item of items) {
        if (!(await mutate("approve", { id: item.id, approved }))) break;
        recorded++;
      }
      setBatchNotice(
        `${recorded} of ${items.length} ${approved ? "approvals" : "rejections"} recorded.${recorded < items.length ? " Remaining items still need review." : ""}`,
      );
      setRejection(null);
      if (recorded === items.length) setSelected(null);
    } finally {
      setBatchPending(false);
    }
  }

  return (
    <div className="review-workspace">
      <UsagePanel data={data} compact />
      {batchNotice && (
        <p className="batch-notice" role="status">
          {batchNotice}
        </p>
      )}
      {groups.map((group) => (
        <section className="review-group" key={group.id}>
          <div className="review-section-heading">
            <span
              className={`section-icon ${group.title === "Asset changes" ? "orange" : "purple"}`}
            >
              {group.title === "Asset changes" ? (
                <ImageIcon size={15} />
              ) : (
                <Code2 size={15} />
              )}
            </span>
            <h2>{group.title}</h2>
            <span className="review-subtitle">{group.subtitle}</span>
            <span className="group-count">{group.items.length}</span>
            <div className="group-actions">
              <Button
                className="approve-button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => void decide(group.items, true)}
              >
                <Check size={14} />
                Approve all {group.items.length}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRejection(group.items)}
              >
                Reject all
              </Button>
            </div>
          </div>
          <div
            className={`review-grid ${group.title === "Asset changes" ? `asset-grid ${group.items.length > 2 ? "portrait-grid" : ""}` : ""}`}
          >
            {group.items.map((a) => {
              const t = data.tasks.find((t: any) => t.id === a.task_id);
              const media = reviewImages(a.args);
              return (
                <article className="review-card" key={a.id}>
                  <button
                    className="review-card-open"
                    onClick={() => openReview("approval", a.id)}
                    aria-label={`Review ${t?.title || a.tool}`}
                  >
                    {media.length ? (
                      <MediaPreview images={media} title={t?.title || a.tool} />
                    ) : (
                      <div className="code-preview">
                        <div>
                          <Code2 size={15} />
                          <span>{a.tool}</span>
                          <span className="preview-label">Proposed change</span>
                        </div>
                        <pre>{formatPayload(a.args)}</pre>
                        <span className="preview-open">
                          Inspect full arguments <ArrowUpRight size={13} />
                        </span>
                      </div>
                    )}
                    <div className="review-card-caption">
                      <strong>{t?.title || a.tool}</strong>
                      <span>
                        <FileCheck2 size={12} />
                        {a.tool} · {t?.agent || "Agent"}
                      </span>
                    </div>
                  </button>
                  {!media.length && (
                    <div className="review-card-actions">
                      <span className="review-pending">
                        <span className="dot amber" />
                        Awaiting approval
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setRejection([a])}
                      >
                        Reject
                      </Button>
                      <Button
                        className="approve-button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => void decide([a], true)}
                      >
                        <Check size={13} />
                        Approve
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && (
        <section className="review-empty">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title="No changes waiting on you"
          >
            Studio changes will appear here for approval. Your team can keep
            planning in the meantime.
          </EmptyState>
          <Button asChild variant="outline">
            <Link href="/chat">
              <Sparkles size={14} /> Start a request
            </Link>
          </Button>
        </section>
      )}

      {!!data.uncertain?.length && (
        <section className="review-group">
          <div className="review-section-heading">
            <span className="section-icon orange">
              <TriangleAlert size={15} />
            </span>
            <h2>Needs inspection</h2>
            <span className="group-count">{data.uncertain.length}</span>
          </div>
          <div className="review-grid">
            {data.uncertain.map((c: any) => (
              <section className="panel approval-card" key={c.id}>
                <h3>Inspect uncertain operation: {c.tool}</h3>
                <pre>{formatPayload(c.args)}</pre>
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    if (
                      await mutate("resolve", {
                        id: c.id,
                        executed: f.get("executed") === "yes",
                        evidence: f.get("evidence"),
                      })
                    )
                      form.reset();
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
                  <Button disabled={disabled}>Record outcome</Button>
                </form>
              </section>
            ))}
          </div>
        </section>
      )}

      {(["review", "accepted"] as const).map((status) => {
        const runs = completed.filter((r: any) => r.status === status);
        if (!runs.length) return null;
        return (
          <section className="review-group" key={status}>
            <div className="review-section-heading">
              <span className="section-icon pink">
                <FileCheck2 size={15} />
              </span>
              <h2>
                {status === "review" ? "Completed work" : "Accepted work"}
              </h2>
              <span className="review-subtitle">
                {status === "review"
                  ? "Verified by your team"
                  : "Review history"}
              </span>
              <span className="group-count">{runs.length}</span>
            </div>
            <div className="review-grid">
              {runs.map((r: any) => {
                const tasks = data.tasks.filter((t: any) => t.run_id === r.id);
                const media = tasks.flatMap((t: any) => reviewImages(t.result));
                const testers = tasks.filter((t: any) => t.agent === "Tester");
                const game = data.games.find((g: any) => g.id === r.game_id);
                return (
                  <article className="review-card" key={r.id}>
                    <button
                      className="review-card-open"
                      onClick={() => openReview("run", r.id)}
                      aria-label={`Review ${r.request}`}
                    >
                      {media.length ? (
                        <MediaPreview images={media} title={r.request} />
                      ) : (
                        <div className="verification-preview">
                          <span className="section-icon green">
                            <ShieldCheck size={18} />
                          </span>
                          <span className="section-kicker">
                            Verification evidence
                          </span>
                          <p>
                            {testers
                              .map((t: any) => t.result)
                              .filter(Boolean)
                              .join("\n") ||
                              "Open this review to inspect the team’s deliverables."}
                          </p>
                        </div>
                      )}
                      <div className="review-card-caption">
                        <strong>{r.request}</strong>
                        <span>
                          <FileCheck2 size={12} />
                          {game?.name || "Workspace"} · {tasks.length} tasks
                        </span>
                      </div>
                    </button>
                    <div className="review-card-actions">
                      <span className={`badge ${r.status}`}>
                        {r.status === "accepted"
                          ? "Accepted"
                          : "Ready for review"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openReview("run", r.id)}
                      >
                        View details <ArrowUpRight size={13} />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {selected && selectedItem && (
        <DetailDrawer
          key={`${selected.kind}-${selected.id}`}
          title={task?.title || selectedItem.request || selectedItem.tool}
          subtitle={
            selected.kind === "approval"
              ? "Inspect the exact change before it runs in Studio."
              : "Inspect deliverables and verification evidence."
          }
          close={() => setSelected(null)}
        >
          {actionError && (
            <p className="alert error" role="alert">
              {actionError}
            </p>
          )}
          <dl className="review-metadata">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`badge ${selectedItem.status}`}>
                  {selectedItem.status}
                </span>
              </dd>
            </div>
            {task && (
              <div>
                <dt>Agent</dt>
                <dd>
                  <Avatar name={task.agent} size="mini" />
                  {task.agent}
                </dd>
              </div>
            )}
            {task && (
              <div>
                <dt>Attempt</dt>
                <dd>
                  {task.attempts || 0} · {task.steps || 0} model steps
                </dd>
              </div>
            )}
            {selectedItem.created && (
              <div>
                <dt>Created</dt>
                <dd>
                  {new Date(
                    `${selectedItem.created.replace(" ", "T")}Z`,
                  ).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
          {!!images.length && (
            <div className="drawer-media">
              {images.map((src, i) => (
                <a
                  href={src}
                  key={`${src}-${i}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={src} alt={`Deliverable ${i + 1}`} />
                  <span>
                    Open image <ArrowUpRight size={13} />
                  </span>
                </a>
              ))}
            </div>
          )}
          {selected.kind === "approval" ? (
            <>
              {task?.instructions && (
                <div className="review-context">
                  <h3>Task context</h3>
                  <p>{task.instructions}</p>
                  <Link
                    className="text-link"
                    href={`/tasks?task=${encodeURIComponent(task.id)}`}
                  >
                    Open task <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
              <h3>{selectedItem.tool} · exact arguments</h3>
              <pre>{formatPayload(selectedItem.args)}</pre>
              {selectedItem.status === "pending" && (
                <div className="drawer-actions">
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => setRejection([selectedItem])}
                  >
                    <X size={14} />
                    Reject change
                  </Button>
                  <Button
                    className="approve-button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void decide([selectedItem], true)}
                  >
                    <Check size={14} />
                    Approve change
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {runTasks.map((t: any) => (
                <section className="review-deliverable" key={t.id}>
                  <h3>
                    <Avatar name={t.agent} size="mini" />
                    {t.agent} · {t.title}
                  </h3>
                  <p>{t.instructions}</p>
                  <pre>{formatPayload(t.result || "No result recorded.")}</pre>
                  <Link
                    className="text-link"
                    href={`/tasks?task=${encodeURIComponent(t.id)}`}
                  >
                    Open task <ArrowUpRight size={13} />
                  </Link>
                </section>
              ))}
              {selectedItem.status === "review" && (
                <form
                  className="form review-feedback"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await mutate("review", {
                        id: selectedItem.id,
                        accepted: false,
                        feedback: f.get("feedback"),
                      })
                    )
                      setSelected(null);
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
                  <div className="drawer-actions">
                    <Button variant="outline" disabled={disabled}>
                      Request changes
                    </Button>
                    <Button
                      type="button"
                      className="approve-button"
                      variant="outline"
                      disabled={disabled}
                      onClick={async () => {
                        if (
                          await mutate("review", {
                            id: selectedItem.id,
                            accepted: true,
                          })
                        )
                          setSelected(null);
                      }}
                    >
                      <CheckCheck size={14} />
                      Accept work
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </DetailDrawer>
      )}
      {rejection && (
        <ConfirmDialog
          title={
            rejection.length > 1
              ? `Reject ${rejection.length} changes?`
              : "Reject this change?"
          }
          confirmLabel={
            rejection.length > 1 ? "Reject changes" : "Reject change"
          }
          pending={disabled}
          close={() => setRejection(null)}
          confirm={() => decide(rejection, false)}
        >
          The proposed tool calls will not run. The agents will receive the
          rejection and can adapt their work.
        </ConfirmDialog>
      )}
    </div>
  );
}
