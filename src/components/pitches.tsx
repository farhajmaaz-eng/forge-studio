"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  Check,
  FileText,
  Lightbulb,
  Plus,
} from "lucide-react";
import {
  displayDate,
  pitchSections,
  sectionTitles,
} from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Button } from "./ui/button";
import {
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
} from "./ui/workspace-primitives";
import { ResourceState, StatusChip, type Act } from "./feature-ui";
export default function Pitches({
  data,
  act,
  busy,
  chooseGame,
}: {
  data: any;
  act: Act;
  busy: boolean;
  chooseGame: (id: string) => void;
}) {
  const params = useSearchParams();
  const resource = useResource<any[]>(
    "pitches",
    data.settings.featureRevision || 0,
  );
  const [selected, setSelected] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [decision, setDecision] = useState<string | null>(null),
    [convert, setConvert] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (params.get("evidence"))
      setEditing({
        title: "",
        hook: "",
        genre: "",
        tags: [],
        confidence: "unvalidated",
        sections: {},
        evidence: [
          {
            snapshotId: params.get("evidence"),
            universeId: params.get("universe"),
          },
        ],
      });
  }, [params]);
  const pitch = resource.data?.find((p) => p.id === selected);
  const market = useResource(
    pitch?.evidence?.length
      ? `market?id=${encodeURIComponent(pitch.evidence[0].snapshotId)}`
      : null,
  );
  const filtered = (resource.data || []).filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.title} ${p.hook} ${p.genre}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="v2-stack">
      <div className="toolbar">
        <input
          aria-label="Search pitches"
          placeholder="Search concepts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="v2-sort"
          aria-label="Pitch status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "draft", "accepted", "revision_requested", "archived"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
        <Button
          onClick={() =>
            setEditing({
              title: "",
              hook: "",
              genre: "",
              tags: [],
              confidence: "unvalidated",
              sections: {},
              evidence: [],
            })
          }
        >
          <Plus size={14} />
          New pitch
        </Button>
      </div>
      <ResourceState loading={resource.loading} error={resource.error}>
        {filtered.length ? (
          <div className="v2-pitch-grid">
            {filtered.map((p) => (
              <button
                key={p.id}
                className="panel v2-pitch-card"
                onClick={() => setSelected(p.id)}
              >
                <span className="section-icon purple">
                  <Lightbulb size={16} />
                </span>
                <StatusChip status={p.status} />
                <h2>{p.title}</h2>
                <p>{p.hook}</p>
                <small>
                  {p.genre || "Genre not specified"} · v{p.version} ·{" "}
                  {p.origin === "agent"
                    ? "AI-authored hypothesis"
                    : "User-authored concept"}{" "}
                  · {p.confidence}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <section className="panel">
            <EmptyState icon={<Lightbulb />} title="No matching concepts">
              Draft a concept, attach observed market evidence, and validate its
              assumptions before accepting it.
            </EmptyState>
            <Link href="/market" className="text-link">
              Explore market evidence <ArrowUpRight size={13} />
            </Link>
          </section>
        )}
      </ResourceState>
      {pitch && (
        <article className="v2-stack">
          <header className="panel v2-pitch-hero">
            <div className="v2-meta-line">
              <StatusChip status={pitch.status} />
              <span>
                Version {pitch.version} · {pitch.confidence} ·{" "}
                {pitch.origin === "agent"
                  ? "AI-authored inference, not an observed market fact"
                  : "User-authored concept"}
              </span>
            </div>
            <h2>{pitch.title}</h2>
            <p>{pitch.hook}</p>
            <div className="v2-meta-line">
              {pitch.tags?.map((tag: string) => (
                <span className="badge" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="actions">
              <Button variant="outline" onClick={() => setEditing(pitch)}>
                Edit / new version
              </Button>
              <Button
                variant="outline"
                className="approve-button"
                disabled={
                  busy ||
                  pitch.status === "accepted" ||
                  pitch.status === "archived"
                }
                onClick={async () => {
                  if (
                    await act("pitches/decision", {
                      id: pitch.id,
                      verdict: "accepted",
                    })
                  )
                    resource.refresh();
                }}
              >
                <Check size={14} />
                Accept pitch
              </Button>
              <Button
                variant="ghost"
                disabled={busy || pitch.status === "archived"}
                onClick={() => setDecision("revision_requested")}
              >
                Request revision
              </Button>
              <Button
                variant="ghost"
                disabled={busy || pitch.status === "archived"}
                onClick={() => setDecision("archived")}
              >
                <Archive size={13} />
                Archive
              </Button>
              <Button
                disabled={busy || pitch.status !== "accepted"}
                onClick={() => setConvert(true)}
              >
                {pitch.gameId ? "Open / plan project" : "Convert to project"}
              </Button>
            </div>
          </header>
          {pitchSections.map((key) => (
            <section className="panel form" key={key}>
              <h3>{sectionTitles[key]}</h3>
              <p className="v2-prose">
                {pitch.sections[key] || "Not documented yet."}
              </p>
            </section>
          ))}
          <section className="panel form">
            <h3>Market evidence</h3>
            {!pitch.evidence.length && (
              <p>
                No sourced evidence is attached. This concept is unvalidated.
              </p>
            )}
            {pitch.evidence.map((ref: any) => {
              const row =
                market.data?.current?.id === ref.snapshotId
                  ? market.data.current.games.find(
                      (g: any) => g.universeId === ref.universeId,
                    )
                  : null;
              return (
                <div
                  className="v2-evidence"
                  key={`${ref.snapshotId}:${ref.universeId}`}
                >
                  <strong>{row?.title || `Universe ${ref.universeId}`}</strong>
                  {row && (
                    <p>
                      {row.players !== undefined
                        ? `${row.players.toLocaleString()} observed players. `
                        : ""}
                      {row.rank !== undefined
                        ? `Source rank ${row.rank}. `
                        : ""}
                      {market.data.current.quality} ·{" "}
                      {displayDate(market.data.current.fetchedAt)}
                    </p>
                  )}
                  <Link
                    className="text-link"
                    href={`/market?snapshot=${encodeURIComponent(ref.snapshotId)}`}
                  >
                    Open source snapshot <ArrowUpRight size={13} />
                  </Link>
                </div>
              );
            })}
          </section>
          <section className="panel">
            <h3>Version history</h3>
            {pitch.versions.map((v: any) => (
              <details key={v.version}>
                <summary>
                  Version {v.version} · {displayDate(v.created)}
                </summary>
                <pre>{JSON.stringify(JSON.parse(v.payload), null, 2)}</pre>
              </details>
            ))}
            {(data.reviewEvents || [])
              .filter(
                (e: any) =>
                  e.target_kind === "pitch" && e.target_id === pitch.id,
              )
              .map((h: any) => (
                <div className="v2-history" key={h.id}>
                  <StatusChip status={h.verdict} />
                  <small>{displayDate(h.created)}</small>
                  <p>{h.note}</p>
                </div>
              ))}
          </section>
        </article>
      )}
      {editing && (
        <DetailDrawer
          title={editing.id ? "Revise pitch" : "New pitch"}
          subtitle="Record hypotheses separately from observed evidence. Saving creates a version; it does not start implementation."
          close={() => setEditing(null)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              const out = await act("pitches/save", {
                ...editing,
                expectedVersion: editing.version,
                title: f.get("title"),
                hook: f.get("hook"),
                genre: f.get("genre"),
                confidence: f.get("confidence"),
                tags: String(f.get("tags") || "")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                sections: Object.fromEntries(
                  pitchSections.map((k) => [k, f.get(k) || ""]),
                ),
              });
              if (out) {
                setSelected(out.id);
                setEditing(null);
                resource.refresh();
              } else
                setError(
                  "This version was not saved. Reload if another change was made.",
                );
            }}
          >
            <label>
              Concept title
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={editing.title}
              />
            </label>
            <label>
              One-sentence hook
              <textarea
                name="hook"
                aria-label="One-sentence hook"
                required
                minLength={5}
                maxLength={1000}
                rows={3}
                defaultValue={editing.hook}
              />
            </label>
            <label>
              Genre
              <input name="genre" defaultValue={editing.genre} />
            </label>
            <label>
              Validation state (maintained by you)
              <select name="confidence" defaultValue={editing.confidence}>
                {["unvalidated", "researching", "validated"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Tags
              <input name="tags" defaultValue={editing.tags?.join(", ")} />
            </label>
            {pitchSections.map((k) => (
              <label key={k}>
                {sectionTitles[k]}
                <textarea
                  name={k}
                  aria-label={sectionTitles[k]}
                  rows={3}
                  maxLength={12000}
                  defaultValue={editing.sections?.[k]}
                />
              </label>
            ))}
            {!!editing.evidence?.length && (
              <p>
                {editing.evidence.length} imported market observation(s)
                attached. Keep uncertain interpretation in the design text.
              </p>
            )}
            {error && (
              <p role="alert" className="failure-text">
                {error}
              </p>
            )}
            <Button disabled={busy}>Save pitch version</Button>
          </form>
        </DetailDrawer>
      )}
      {decision &&
        pitch &&
        (decision === "archived" ? (
          <ConfirmDialog
            title="Archive this pitch?"
            confirmLabel="Archive pitch"
            pending={busy}
            close={() => setDecision(null)}
            confirm={async () => {
              if (
                await act("pitches/decision", {
                  id: pitch.id,
                  verdict: "archived",
                })
              ) {
                setDecision(null);
                resource.refresh();
              }
            }}
          >
            All versions and evidence remain stored.
          </ConfirmDialog>
        ) : (
          <DetailDrawer
            title="Request pitch revision"
            close={() => setDecision(null)}
          >
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await act("pitches/decision", {
                    id: pitch.id,
                    verdict: "revision_requested",
                    note: f.get("note"),
                  })
                ) {
                  setDecision(null);
                  resource.refresh();
                }
              }}
            >
              <label>
                Requested changes
                <textarea name="note" required minLength={5} rows={5} />
              </label>
              <p>
                The feedback is recorded in this pitch’s history. Edit a new
                version to address it, or assign a research task to Lead.
              </p>
              <Button disabled={busy}>Record revision request</Button>
            </form>
          </DetailDrawer>
        ))}
      {convert && pitch && (
        <DetailDrawer
          title="Convert accepted pitch"
          subtitle="Create a planning project and optionally queue an implementation plan."
          close={() => setConvert(false)}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const out = await act("pitches/convert", {
                id: pitch.id,
                studioId: f.get("studioId"),
                createTasks: f.get("createTasks") === "on",
              });
              if (out) {
                chooseGame(out.gameId);
                setConvert(false);
                resource.refresh();
              }
            }}
          >
            <p>{pitch.title}</p>
            <label>
              Studio instance ID
              <input
                name="studioId"
                placeholder="Optional for a planning project"
              />
            </label>
            <label className="checkbox">
              <input name="createTasks" type="checkbox" />
              Queue Lead to plan the MVP, with approval before execution
            </label>
            <p>
              This does not publish a game or authorize paid generation.
              Repeating conversion reuses the linked project.
            </p>
            <Button disabled={busy}>Create / update project</Button>
          </form>
        </DetailDrawer>
      )}
    </div>
  );
}
