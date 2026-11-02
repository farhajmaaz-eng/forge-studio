"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  Check,
  Download,
  FileCode,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { assetKinds, displayDate } from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Button } from "./ui/button";
import {
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
} from "./ui/workspace-primitives";
import { ResourceState, StatusChip, type Act } from "./feature-ui";
import ReviewViewer, { fileKind, type ViewerFile } from "./review-viewer";
export default function AssetLibrary({
  data,
  selectedGame,
  act,
  busy,
  systems = false,
  reviewOnly = false,
  newTask,
}: {
  data: any;
  selectedGame: string;
  act: Act;
  busy: boolean;
  systems?: boolean;
  reviewOnly?: boolean;
  newTask: (initial?: string) => void;
}) {
  const params = useSearchParams();
  const assets = useResource<any[]>(
    "assets",
    data.settings.featureRevision || 0,
  );
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [scope, setScope] = useState("all"),
    [status, setStatus] = useState(reviewOnly ? "pending" : "all"),
    [sort, setSort] = useState("newest"),
    [list, setList] = useState(false),
    [upload, setUpload] = useState(false),
    [selected, setSelected] = useState(params.get("asset") || "");
  useEffect(() => {
    if (params.get("asset")) setSelected(params.get("asset")!);
  }, [params]);
  const items = (assets.data || [])
    .filter(
      (a) =>
        (systems ? a.kind === "system" : reviewOnly || a.kind !== "system") &&
        (!reviewOnly || !!a.task_id) &&
        (status === "all" ? a.status !== "archived" : a.status === status) &&
        (scope === "all" || a.game_id === selectedGame) &&
        (kind === "all" || a.kind === kind) &&
        `${a.name} ${a.tags.join(" ")} ${a.roblox_id}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.created.localeCompare(b.created)
          : b.created.localeCompare(a.created),
    );
  return (
    <div className="v2-stack">
      <div className="toolbar">
        <input
          aria-label="Search assets"
          placeholder="Search assets, tags or Roblox IDs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="v2-sort"
          aria-label="Asset project scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All projects</option>
          <option disabled={!selectedGame} value="selected">
            Selected project
          </option>
        </select>
        <select
          className="v2-sort"
          aria-label="Asset status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "all",
            "pending",
            "approved",
            "rejected",
            "changes_requested",
            "catalogued",
            "archived",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="v2-sort"
          aria-label="Sort assets"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          aria-label={list ? "Show asset grid" : "Show asset list"}
          onClick={() => setList((l) => !l)}
        >
          {list ? <LayoutGrid size={16} /> : <List size={16} />}
        </Button>
        {!reviewOnly && (
          <Button onClick={() => setUpload(true)}>
            <Plus size={14} />
            {systems ? "Add system" : "Import asset"}
          </Button>
        )}
      </div>
      {!systems && (
        <div className="tabs" role="group" aria-label="Asset type">
          {[
            "all",
            ...assetKinds.filter((k) => reviewOnly || k !== "system"),
          ].map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              className={kind === k ? "current" : ""}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
      )}
      <ResourceState loading={assets.loading} error={assets.error}>
        {!items.length ? (
          <section className="panel">
            <EmptyState
              icon={<ImageIcon />}
              title={
                reviewOnly
                  ? "No matching artifact reviews"
                  : systems
                    ? "No reusable systems yet"
                    : "No matching assets"
              }
            >
              {reviewOnly
                ? "Agent-produced deliverables registered with save_artifact or captured as MCP images appear here."
                : "Import a local file, add a real Roblox asset ID, or save a source reference. Files are never executed or published on import."}
            </EmptyState>
          </section>
        ) : (
          <div className={`v2-asset-grid ${list ? "as-list" : ""}`}>
            {items.map((a) => (
              <button
                className="v2-asset-card panel"
                key={a.id}
                onClick={() => setSelected(a.id)}
              >
                <div className="v2-asset-thumb">
                  {fileKind(a) === "image" && a.url ? (
                    <img src={a.url} alt={a.name} loading="lazy" />
                  ) : a.kind === "video" && a.url ? (
                    <video src={a.url} preload="metadata" muted />
                  ) : (
                    <FileCode size={30} />
                  )}
                </div>
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.kind} ·{" "}
                    {data.games.find((g: any) => g.id === a.game_id)?.name ||
                      "Workspace"}
                  </small>
                  <StatusChip status={a.status} />
                  {a.roblox_id && <small>Roblox ID: {a.roblox_id}</small>}
                </div>
              </button>
            ))}
          </div>
        )}
      </ResourceState>
      {upload && (
        <AssetImport
          data={data}
          selectedGame={selectedGame}
          systems={systems}
          act={act}
          busy={busy}
          close={() => setUpload(false)}
          saved={(id) => {
            setUpload(false);
            setSelected(id);
            assets.refresh();
          }}
        />
      )}
      {selected && (
        <AssetDetail
          id={selected}
          data={data}
          act={act}
          busy={busy}
          close={() => {
            setSelected("");
            assets.refresh();
          }}
          newTask={newTask}
        />
      )}
    </div>
  );
}
function AssetImport({
  data,
  selectedGame,
  systems,
  act,
  busy,
  close,
  saved,
}: {
  data: any;
  selectedGame: string;
  systems: boolean;
  act: Act;
  busy: boolean;
  close: () => void;
  saved: (id: string) => void;
}) {
  const catalog = useResource<any[]>(
    "assets",
    data.settings.featureRevision || 0,
  );
  const [file, setFile] = useState<{
      data: string;
      mime: string;
      filename: string;
    } | null>(null),
    [error, setError] = useState(""),
    [kind, setKind] = useState(systems ? "system" : "image");
  return (
    <DetailDrawer
      title={systems ? "Add reusable system" : "Import an asset"}
      subtitle="Store a local reference. Importing does not execute code, upload to Roblox, or grant a license."
      close={close}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget);
          const out = await act("assets/save", {
            name: f.get("name"),
            kind,
            gameId: f.get("gameId") || undefined,
            url: f.get("url"),
            source: f.get("source"),
            license: f.get("license"),
            robloxId: f.get("robloxId"),
            tags: String(f.get("tags") || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            content: f.get("content"),
            compatibility: f.get("compatibility"),
            dependencies: f.getAll("dependencies"),
            ...file,
          });
          if (out) saved(out.id);
          else
            setError(
              "The asset could not be imported. Check its source and file type.",
            );
        }}
      >
        <label>
          Name
          <input name="name" required maxLength={200} />
        </label>
        <div className="form-grid">
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {assetKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select name="gameId" defaultValue={selectedGame}>
              <option value="">Workspace-wide</option>
              {data.games.map((g: any) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Source file URL
          <input type="url" name="url" placeholder="https://…" />
        </label>
        <label>
          Roblox asset ID
          <input
            name="robloxId"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Optional · supply a real ID"
          />
        </label>
        <label className="v2-file-input">
          <Upload size={15} />
          Local file · up to 2 MB
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.txt,.luau,.lua,.json"
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              if (selected.size > 2 * 1024 * 1024) {
                setError(
                  "Use a file under 2 MB, or provide a source URL for larger media.",
                );
                return;
              }
              const mime = /\.(lua|luau|txt)$/i.test(selected.name)
                ? "text/plain"
                : selected.type;
              const bytes = new Uint8Array(await selected.arrayBuffer());
              let raw = "";
              for (let i = 0; i < bytes.length; i += 8192)
                raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
              setFile({ data: btoa(raw), mime, filename: selected.name });
              if (mime.startsWith("image/")) setKind("image");
              else if (mime.startsWith("video/")) setKind("video");
              else if (mime.startsWith("audio/")) setKind("sound");
              setError("");
            }}
          />
        </label>
        {file && (
          <small>
            Selected: {file.filename}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => setFile(null)}
            >
              Remove file
            </button>
          </small>
        )}
        <label>
          Source / provenance
          <input
            name="source"
            placeholder="Creator, export location, or source URL"
          />
        </label>
        <label>
          License / usage terms
          <input
            name="license"
            placeholder="Leave empty if unknown; verify before reuse"
          />
        </label>
        <label>
          Tags
          <input name="tags" placeholder="Comma-separated tags" />
        </label>
        <label>
          Compatibility & dependencies
          <textarea name="compatibility" rows={2} />
        </label>
        <label>
          Dependency assets
          <select name="dependencies" multiple size={3}>
            {(catalog.data || [])
              .filter((a) => a.status !== "archived")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.kind}
                </option>
              ))}
          </select>
          <small>
            Record references only. Dependencies are not installed
            automatically.
          </small>
        </label>
        <label>
          Script, module, or system documentation
          <textarea
            name="content"
            rows={6}
            maxLength={60000}
            placeholder="Stored as text. Never run on import."
          />
        </label>
        {error && (
          <p role="alert" className="failure-text">
            {error}
          </p>
        )}
        <Button disabled={busy}>{busy ? "Saving…" : "Save to library"}</Button>
      </form>
    </DetailDrawer>
  );
}
export function AssetDetail({
  id,
  data,
  act,
  busy,
  close,
  newTask,
}: {
  id: string;
  data: any;
  act: Act;
  busy: boolean;
  close: () => void;
  newTask: (initial?: string) => void;
}) {
  const resource = useResource(
    `assets?id=${encodeURIComponent(id)}`,
    data.settings.featureRevision || 0,
  );
  const asset = resource.data;
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [archive, setArchive] = useState(false),
    [reject, setReject] = useState(false);
  async function verdict(value: string) {
    setError("");
    if (await act("assets/verdict", { id, verdict: value, note })) {
      setReject(false);
      resource.refresh();
    } else {
      setReject(false);
      setError(
        "The verdict was not recorded. This item may have changed; refresh and try again.",
      );
    }
  }
  const files: ViewerFile[] =
    asset?.revisions
      ?.filter((a: any) => a.url)
      .map((a: any) => ({
        url: a.url,
        name: a.filename || a.name,
        mime: a.mime,
        kind: a.kind,
      })) || [];
  if (asset?.url && !files.some((f) => f.url === asset.url))
    files.push({
      url: asset.url,
      name: asset.name,
      mime: asset.mime,
      kind: asset.kind,
    });
  return (
    <DetailDrawer
      title={asset?.name || "Asset details"}
      subtitle="Inspect the actual file and provenance before deciding or reusing it."
      close={close}
      wide
    >
      <ResourceState loading={resource.loading} error={resource.error}>
        {asset && (
          <div className="v2-review-detail">
            <section className="v2-stack">
              <ReviewViewer
                files={files}
                compareRevisions={!!asset.revision_of}
              />
              {asset.content && <pre>{asset.content}</pre>}
            </section>
            <aside className="v2-stack">
              <section className="panel form">
                <StatusChip status={asset.status} />
                <p>
                  {asset.kind} ·{" "}
                  {data.games.find((g: any) => g.id === asset.game_id)?.name ||
                    "Workspace"}
                </p>
                <div className="v2-meta-line">
                  {asset.tags.map((tag: string) => (
                    <span className="badge" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <dl className="v2-detail-list">
                  <div>
                    <dt>Created</dt>
                    <dd>{displayDate(asset.created)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{asset.source || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>{asset.license || "Unknown · verify before reuse"}</dd>
                  </div>
                  {asset.roblox_id && (
                    <div>
                      <dt>Supplied Roblox ID</dt>
                      <dd>{asset.roblox_id}</dd>
                    </div>
                  )}
                  {asset.compatibility && (
                    <div>
                      <dt>Compatibility</dt>
                      <dd>{asset.compatibility}</dd>
                    </div>
                  )}
                </dl>
                {!!asset.dependencies.length && (
                  <div>
                    <h4>Dependencies</h4>
                    {asset.dependencies.map((ref: string) => (
                      <Link
                        key={ref}
                        className="text-link"
                        href={`/library?tab=assets&asset=${encodeURIComponent(ref)}`}
                      >
                        {ref}
                      </Link>
                    ))}
                  </div>
                )}
                {!!asset.usedBy?.length && (
                  <div>
                    <h4>Referenced by</h4>
                    {asset.usedBy.map((a: any) => (
                      <Link
                        key={a.id}
                        className="text-link"
                        href={`/library?tab=${a.kind === "system" ? "systems" : "assets"}&asset=${encodeURIComponent(a.id)}`}
                      >
                        {a.name}
                      </Link>
                    ))}
                  </div>
                )}
                {asset.task_id && (
                  <Link
                    href={`/tasks?task=${encodeURIComponent(asset.task_id)}`}
                    className="text-link"
                  >
                    Producing task <ArrowUpRight size={13} />
                  </Link>
                )}
                {asset.status === "pending" && (
                  <>
                    <label>
                      Review note
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        placeholder="Required when asking for changes"
                      />
                    </label>
                    <Button
                      className="approve-button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void verdict("approved")}
                    >
                      <Check size={14} />
                      Approve artifact
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        busy || note.trim().length < 5 || !asset.task_id
                      }
                      onClick={() => void verdict("changes_requested")}
                    >
                      Ask for changes
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setReject(true)}
                    >
                      <X size={14} />
                      Reject artifact
                    </Button>
                    <small>
                      Approval records a verdict only. It does not publish,
                      upload, or authorize paid operations.
                    </small>
                  </>
                )}
                {error && (
                  <p className="failure-text" role="alert">
                    {error}
                  </p>
                )}
                {asset.url && (
                  <a
                    className="text-link"
                    href={asset.url}
                    download={
                      asset.url.startsWith("/api/") ? asset.filename : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={14} />
                    {asset.url.startsWith("/api/")
                      ? "Download file"
                      : "Open source file"}
                  </a>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    close();
                    newTask(
                      `Reuse asset ${asset.id} (${asset.name}). Source: ${asset.source || asset.url || "local library"}. Roblox ID: ${asset.roblox_id || "not supplied"}. Verify compatibility, dependencies and licensing before use.`,
                    );
                  }}
                >
                  Reference in a new task
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy || asset.status === "archived"}
                  onClick={() => setArchive(true)}
                >
                  <Archive size={14} />
                  Archive from library
                </Button>
              </section>
              <section className="panel">
                <h3>Review history</h3>
                {asset.history.length ? (
                  asset.history.map((h: any) => (
                    <article className="v2-history" key={h.id}>
                      <StatusChip status={h.verdict} />
                      <small>
                        {h.reviewer} · {displayDate(h.created)}
                      </small>
                      {h.note && <p>{h.note}</p>}
                      {h.revision_task_id && (
                        <Link
                          className="text-link"
                          href={`/tasks?task=${encodeURIComponent(h.revision_task_id)}`}
                        >
                          Open revision task <ArrowUpRight size={12} />
                        </Link>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="plain-empty">No verdict has been recorded.</p>
                )}
              </section>
            </aside>
          </div>
        )}
      </ResourceState>
      {archive && (
        <ConfirmDialog
          title="Archive this asset?"
          confirmLabel="Archive asset"
          pending={busy}
          close={() => setArchive(false)}
          confirm={async () => {
            if (await act("assets/archive", { id })) {
              setArchive(false);
              resource.refresh();
            }
          }}
        >
          The file and its review history remain stored. The asset is hidden
          from the default library.
        </ConfirmDialog>
      )}
      {reject && (
        <ConfirmDialog
          title="Reject this artifact?"
          confirmLabel="Reject artifact"
          pending={busy}
          close={() => setReject(false)}
          confirm={() => verdict("rejected")}
        >
          This records a rejection without running any Studio operation.
        </ConfirmDialog>
      )}
    </DetailDrawer>
  );
}
