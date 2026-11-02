"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Gamepad2, Link2, Plus, Upload } from "lucide-react";
import {
  gameStages,
  metricDefinitions,
  displayDate,
} from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Button } from "./ui/button";
import { DetailDrawer, EmptyState } from "./ui/workspace-primitives";
import {
  ImportDialog,
  ResourceState,
  StatusChip,
  type Act,
} from "./feature-ui";
export default function GameOps({
  data,
  selectedGame,
  chooseGame,
  act,
  busy,
  newTask,
}: {
  data: any;
  selectedGame: string;
  chooseGame: (id: string) => void;
  act: Act;
  busy: boolean;
  newTask: (initial?: string) => void;
}) {
  const [tab, setTab] = useState("Overview"),
    [add, setAdd] = useState(false),
    [edit, setEdit] = useState(false),
    [importing, setImporting] = useState(false),
    [discovery, setDiscovery] = useState<any>(null),
    [range, setRange] = useState("30");
  const game = data.games.find((g: any) => g.id === selectedGame);
  const telemetry = useResource(
    game ? `telemetry?gameId=${encodeURIComponent(game.id)}` : null,
    data.settings.featureRevision || 0,
  );
  const snapshots: any[] = telemetry.data?.snapshots || [];
  const [source, setSource] = useState("");
  const sources = [...new Set(snapshots.map((s) => s.source))];
  const selectedSource = sources.includes(source) ? source : sources[0];
  const scoped = snapshots.filter((s) => s.source === selectedSource);
  const newest = scoped[0];
  const latest = Math.max(
    0,
    ...scoped.flatMap((s) =>
      s.metrics.flatMap((m: any) => m.points.map((p: any) => Date.parse(p.at))),
    ),
  );
  const from = range === "all" ? 0 : latest - Number(range) * 86400000;
  const observations = new Map<string, any>();
  for (const s of [...scoped].reverse())
    for (const m of s.metrics)
      for (const p of m.points)
        if (Date.parse(p.at) >= from)
          observations.set(`${m.metric}:${p.series}:${p.at}`, {
            ...p,
            metric: m.metric,
            quality: s.quality,
          });
  const points = [...observations.values()].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const runIds = new Set(
    data.runs.filter((r: any) => r.game_id === game?.id).map((r: any) => r.id),
  );
  const tasks = data.tasks.filter((t: any) => runIds.has(t.run_id));
  const tabs = [
    "Overview",
    "Charts",
    "Players",
    "Sessions / Retention",
    "Trends",
    "Benchmarks",
    "Fixes & Reports",
  ];
  return (
    <div className="v2-stack">
      <div className="toolbar">
        <h2>Your games & LiveOps</h2>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            const out = await act("studios", {});
            if (out) setDiscovery(out);
          }}
        >
          <Link2 size={14} />
          Discover Studios
        </Button>
        <Button onClick={() => setAdd(true)}>
          <Plus size={14} />
          Add project
        </Button>
      </div>
      {discovery && (
        <section className="panel">
          <h3>Discovered Studio instances</h3>
          <pre>{JSON.stringify(discovery.content, null, 2)}</pre>
        </section>
      )}
      <div className="v2-game-grid">
        {data.games.map((g: any) => (
          <button
            key={g.id}
            className={`panel v2-game-select ${g.id === selectedGame ? "selected" : ""}`}
            onClick={() => chooseGame(g.id)}
          >
            <Gamepad2 size={22} />
            <span>
              <strong>{g.name}</strong>
              <small>
                {g.studio_id
                  ? `Studio ${g.studio_id}`
                  : "No Studio instance · planning project"}
              </small>
            </span>
            <StatusChip status={g.stage || "prototype"} />
          </button>
        ))}
      </div>
      {!data.games.length && (
        <section className="panel">
          <EmptyState icon={<Gamepad2 />} title="No games registered">
            Create a planning project, or discover a Studio instance and
            register it.
          </EmptyState>
        </section>
      )}
      {game && (
        <>
          <div className="toolbar">
            <div>
              <h2>{game.name}</h2>
              <p className="muted-text">
                Lifecycle: {game.stage || "prototype"} · manually maintained ·{" "}
                {game.universe_id
                  ? `Universe ${game.universe_id}`
                  : "Universe ID not connected"}
              </p>
            </div>
            <Button variant="outline" onClick={() => setEdit(true)}>
              Edit project
            </Button>
          </div>
          <div className="tabs" role="group" aria-label="Game analytics views">
            {tabs.map((t) => (
              <button
                key={t}
                className={tab === t ? "current" : ""}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Overview" ? (
            <>
              <div className="stats overview-stats">
                <div>
                  <span>Tasks</span>
                  <strong>{tasks.length}</strong>
                  <label>
                    {tasks.filter((t: any) => t.status === "running").length}{" "}
                    working
                  </label>
                </div>
                <div>
                  <span>Review</span>
                  <strong>
                    {
                      data.runs.filter(
                        (r: any) => runIds.has(r.id) && r.status === "review",
                      ).length
                    }
                  </strong>
                  <label>requests awaiting acceptance</label>
                </div>
                <div>
                  <span>Build status</span>
                  <strong className="v2-small-stat">
                    {tasks.some((t: any) => t.status === "failed")
                      ? "Needs attention"
                      : tasks.some((t: any) => t.status === "running")
                        ? "In progress"
                        : tasks.length
                          ? "See task evidence"
                          : "No builds yet"}
                  </strong>
                  <label>Derived from tracked work</label>
                </div>
                <div>
                  <span>Telemetry</span>
                  <strong>{snapshots.length}</strong>
                  <label>imported snapshots · no live feed</label>
                </div>
              </div>
              <section className="panel form">
                <h3>Latest work</h3>
                {tasks.slice(0, 5).map((t: any) => (
                  <Link
                    className="v2-row-link"
                    key={t.id}
                    href={`/tasks?task=${encodeURIComponent(t.id)}`}
                  >
                    <span>{t.title}</span>
                    <StatusChip status={t.status} />
                    <ArrowUpRight size={13} />
                  </Link>
                ))}
                {!tasks.length && (
                  <p>No work has been queued for this project.</p>
                )}
                <Button
                  variant="outline"
                  onClick={() =>
                    newTask(
                      `Plan the next development milestone for ${game.name}. Include acceptance criteria and independent verification.`,
                    )
                  }
                >
                  Create project task
                </Button>
                <Link href="/reviews" className="text-link">
                  Open reviews <ArrowUpRight size={13} />
                </Link>
              </section>
            </>
          ) : tab === "Fixes & Reports" ? (
            <section className="panel form">
              <h3>Tracked failures and test reports</h3>
              {tasks
                .filter(
                  (t: any) =>
                    ["failed", "blocked"].includes(t.status) ||
                    t.agent === "Tester",
                )
                .map((t: any) => (
                  <div className="v2-report" key={t.id}>
                    <Link
                      href={`/tasks?task=${encodeURIComponent(t.id)}`}
                      className="text-link"
                    >
                      {t.title} <ArrowUpRight size={13} />
                    </Link>
                    <StatusChip status={t.status} />
                    <p>{t.error || t.result || "No result recorded"}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        newTask(
                          `Investigate task ${t.id}: ${t.title}. Evidence: ${t.error || t.result || "Inspect the task ledger"}. Verify the fix in Studio.`,
                        )
                      }
                    >
                      Create investigation
                    </Button>
                  </div>
                ))}
              {!tasks.some(
                (t: any) =>
                  ["failed", "blocked"].includes(t.status) ||
                  t.agent === "Tester",
              ) && (
                <p>
                  No failures or test reports have been recorded for this
                  project.
                </p>
              )}
            </section>
          ) : (
            <>
              <section className="panel v2-source-banner">
                <div>
                  <h3>
                    {newest
                      ? "Imported analytics · not a live feed"
                      : "Telemetry is not connected"}
                  </h3>
                  <p>
                    {newest ? (
                      <>
                        <a
                          href={newest.source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {newest.source}
                        </a>{" "}
                        · {newest.quality} · collected{" "}
                        {displayDate(newest.fetchedAt)}
                      </>
                    ) : (
                      "Import an authorized Roblox analytics export. Forge cannot access players, revenue, sessions or retention without your data."
                    )}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload size={14} />
                  Import analytics
                </Button>
              </section>
              <ResourceState
                loading={telemetry.loading}
                error={telemetry.error}
              >
                {snapshots.length ? (
                  <>
                    <div className="toolbar">
                      <label>
                        Source
                        <select
                          value={selectedSource || ""}
                          onChange={(e) => setSource(e.target.value)}
                        >
                          {sources.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Observation window
                        <select
                          value={range}
                          onChange={(e) => setRange(e.target.value)}
                        >
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="all">All observations</option>
                        </select>
                      </label>
                      <small>
                        Window ends at the latest imported observation. Gaps are
                        not zero-filled.
                      </small>
                    </div>
                    {tab === "Trends" || tab === "Benchmarks" ? (
                      <div className="v2-chart-grid">
                        {Object.entries(metricDefinitions).map(([key, def]) => {
                          const ps = points.filter(
                            (p) =>
                              p.metric === key &&
                              p.series ===
                                points.find((x) => x.metric === key)?.series,
                          );
                          if (ps.length < 2) return null;
                          const delta = ps.at(-1).value - ps[0].value;
                          return (
                            <section className="panel form" key={key}>
                              <h3>{def.label}</h3>
                              <p>
                                {tab === "Trends"
                                  ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString()} ${def.unit} between ${displayDate(ps[0].at)} and ${displayDate(ps.at(-1).at)}`
                                  : `Observed range: ${Math.min(...ps.map((p) => p.value)).toLocaleString()}–${Math.max(...ps.map((p) => p.value)).toLocaleString()} ${def.unit}. Median: ${median(ps.map((p) => p.value)).toLocaleString()}.`}
                              </p>
                              <small>
                                Source: {selectedSource} · {ps.length}{" "}
                                observations · {ps[0].series}. This is an
                                imported project baseline, not an industry
                                benchmark.
                              </small>
                              {tab === "Trends" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    newTask(
                                      `Investigate ${def.label} for ${game.name}. Observed change: ${delta} ${def.unit} from ${ps[0].at} to ${ps.at(-1).at}. Source: ${selectedSource}. Explain uncertainty and gather evidence before changing the game.`,
                                    )
                                  }
                                >
                                  Investigate trend
                                </Button>
                              )}
                            </section>
                          );
                        })}
                        {!Object.keys(metricDefinitions).some(
                          (k) =>
                            points.filter((p) => p.metric === k).length >= 2,
                        ) && (
                          <p className="plain-empty">
                            At least two comparable observations are needed for
                            trends or baselines.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="v2-chart-grid">
                        {Object.entries(metricDefinitions)
                          .filter(
                            ([, d]) => tab === "Charts" || d.group === tab,
                          )
                          .map(([key, def]) => (
                            <ChartPanel
                              key={key}
                              title={def.label}
                              unit={def.unit}
                              points={points.filter((p) => p.metric === key)}
                            />
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={<Gamepad2 />}
                    title="No analytics observations yet"
                  >
                    No charts or player metrics will be shown until you import
                    real data. Files must include a source, collection time,
                    quality and metric observations.
                  </EmptyState>
                )}
              </ResourceState>
            </>
          )}
        </>
      )}
      {(add || edit) && (
        <DetailDrawer
          title={edit ? "Edit project" : "Add a project"}
          subtitle="Studio IDs connect local execution; universe and place IDs identify the Roblox experience."
          close={() => {
            setAdd(false);
            setEdit(false);
          }}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const out = await act(
                edit ? "games/update" : "games",
                edit
                  ? {
                      id: game.id,
                      name: f.get("name"),
                      studioId: f.get("studioId"),
                      stage: f.get("stage"),
                      universeId: f.get("universeId"),
                      placeId: f.get("placeId"),
                    }
                  : { name: f.get("name"), studioId: f.get("studioId") },
              );
              if (out) {
                setAdd(false);
                setEdit(false);
              }
            }}
          >
            <label>
              Game name
              <input
                name="name"
                required
                defaultValue={edit ? game.name : ""}
              />
            </label>
            <label>
              Studio instance ID
              <input
                name="studioId"
                defaultValue={edit ? game.studio_id : ""}
                placeholder="Optional for planning; required for Studio execution"
              />
            </label>
            {edit && (
              <>
                <label>
                  Lifecycle stage
                  <select name="stage" defaultValue={game.stage}>
                    {gameStages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Roblox universe ID
                  <input
                    name="universeId"
                    pattern="[0-9]*"
                    defaultValue={game.universe_id}
                  />
                </label>
                <label>
                  Roblox place ID
                  <input
                    name="placeId"
                    pattern="[0-9]*"
                    defaultValue={game.place_id}
                  />
                </label>
              </>
            )}
            <p>
              Changing the project connection does not retarget existing runs.
              Draft plans bind their Studio target only when you explicitly
              approve execution.
            </p>
            <Button disabled={busy}>
              {edit ? "Save project" : "Add project"}
            </Button>
          </form>
        </DetailDrawer>
      )}
      {importing && game && (
        <ImportDialog
          title="Import analytics"
          description="Use a JSON export from a source you are authorized to access. No credentials are stored in this export."
          template={{
            gameId: game.id,
            source: "https://create.roblox.com/dashboard/analytics",
            fetchedAt: "ISO 8601 collection time",
            quality: "exported",
            metrics: [{ metric: "dau", points: [] }],
          }}
          close={() => setImporting(false)}
          submit={(value) =>
            act("telemetry/import", { ...value, gameId: game.id })
          }
        />
      )}
    </div>
  );
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
export function ChartPanel({
  title,
  unit,
  points,
}: {
  title: string;
  unit: string;
  points: any[];
}) {
  if (!points.length)
    return (
      <section className="panel v2-chart">
        <h3>{title}</h3>
        <p className="plain-empty">
          No {title.toLowerCase()} observations in this window.
        </p>
      </section>
    );
  const series = [...new Set(points.map((p) => p.series))];
  const colors = [
    "#a68aff",
    "#31d6a0",
    "#ffc65d",
    "#7eacff",
    "#f17c88",
    "#77d6bb",
  ];
  const xMin = Math.min(...points.map((p) => Date.parse(p.at))),
    xMax = Math.max(...points.map((p) => Date.parse(p.at)));
  const yMax =
    unit === "%" ? 100 : Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (p: any) =>
      48 +
      (xMax === xMin ? 210 : ((Date.parse(p.at) - xMin) / (xMax - xMin)) * 420),
    y = (p: any) => 158 - (p.value / yMax) * 130;
  return (
    <section className="panel v2-chart">
      <h3>{title}</h3>
      <small>{unit} · actual imported observations</small>
      <svg
        role="img"
        aria-label={`${title}, ${points.length} observations`}
        viewBox="0 0 500 200"
      >
        <title>
          {title} ({unit})
        </title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="48"
              x2="470"
              y1={158 - f * 130}
              y2={158 - f * 130}
              stroke="var(--border)"
            />
            <text x="42" y={162 - f * 130} textAnchor="end">
              {Math.round(yMax * f * 10) / 10}
            </text>
          </g>
        ))}
        {series.map((s, i) => (
          <g key={s}>
            <polyline
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="2"
              points={points
                .filter((p) => p.series === s)
                .map((p) => `${x(p)},${y(p)}`)
                .join(" ")}
            />
            {points
              .filter((p) => p.series === s)
              .map((p) => (
                <circle
                  key={`${p.at}:${p.series}`}
                  cx={x(p)}
                  cy={y(p)}
                  r="2.5"
                  fill={colors[i % colors.length]}
                >
                  <title>
                    {displayDate(p.at)}: {p.value} {unit} · {p.series} ·{" "}
                    {p.quality}
                  </title>
                </circle>
              ))}
          </g>
        ))}
        <text x="48" y="185">
          {new Date(xMin).toLocaleDateString()}
        </text>
        <text x="470" y="185" textAnchor="end">
          {new Date(xMax).toLocaleDateString()}
        </text>
      </svg>
      <div className="v2-chart-legend">
        {series.map((s, i) => (
          <span key={s}>
            <i style={{ background: colors[i % colors.length] }} />
            {s}
          </span>
        ))}
      </div>
      <details>
        <summary>View data table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Observed</th>
                <th>Series</th>
                <th>{unit}</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={`${p.series}:${p.at}`}>
                  <td>{displayDate(p.at)}</td>
                  <td>{p.series}</td>
                  <td>{p.value}</td>
                  <td>{p.quality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
