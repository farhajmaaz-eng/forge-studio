"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, BarChart3, Lightbulb, Upload } from "lucide-react";
import { displayDate } from "@/lib/feature-contracts";
import { useResource } from "@/lib/use-resource";
import { Button } from "./ui/button";
import { DetailDrawer, EmptyState } from "./ui/workspace-primitives";
import { ImportDialog, ResourceState, type Act } from "./feature-ui";
export default function Market({
  data,
  act,
  newTask,
}: {
  data: any;
  act: Act;
  newTask: (initial?: string) => void;
}) {
  const params = useSearchParams();
  const [snapshotId, setSnapshotId] = useState(params.get("snapshot") || ""),
    [tab, setTab] = useState("Charts"),
    [query, setQuery] = useState(""),
    [genre, setGenre] = useState("all"),
    [sort, setSort] = useState("rank"),
    [importing, setImporting] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [comps, setComps] = useState<string[]>([]);
  useEffect(() => {
    setSnapshotId(params.get("snapshot") || "");
  }, [params]);
  const resource = useResource(
    `market${snapshotId ? `?id=${encodeURIComponent(snapshotId)}` : ""}`,
    data.settings.featureRevision || 0,
  );
  const current = resource.data?.current,
    previous = resource.data?.previous;
  const comparable =
    !!previous &&
    previous.quality === current?.quality &&
    Date.parse(current.fetchedAt) > Date.parse(previous.fetchedAt);
  function growth(row: any) {
    const old = previous?.games.find(
      (g: any) => g.universeId === row.universeId,
    );
    return comparable && old?.players !== undefined && row.players !== undefined
      ? row.players - old.players
      : null;
  }
  const rows = (current?.games || [])
    .filter(
      (g: any) =>
        `${g.title} ${g.description} ${g.universeId}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (genre === "all" || g.genre === genre) &&
        (tab !== "Comparables" || comps.includes(g.universeId)) &&
        (tab !== "Opportunities" || (growth(g) !== null && growth(g)! > 0)),
    )
    .sort((a: any, b: any) =>
      sort === "rank"
        ? (a.rank ?? Infinity) - (b.rank ?? Infinity)
        : sort === "likes"
          ? (b.votes ? b.likes / b.votes : -1) -
            (a.votes ? a.likes / a.votes : -1)
          : sort === "growth"
            ? (growth(b) ?? -Infinity) - (growth(a) ?? -Infinity)
            : (b[sort] ?? -1) - (a[sort] ?? -1),
    );
  const template = {
    source: "https://your-authorized-source.example/export",
    fetchedAt: "ISO 8601 observation time",
    quality: "exported",
    category: "Your source category / time window",
    games: [],
  };
  return (
    <div className="v2-stack">
      <div className="toolbar">
        <div>
          <h2>Market research</h2>
          <p className="muted-text">
            Observe sources, compare games, and develop testable concepts.
          </p>
        </div>
        <Button onClick={() => setImporting(true)}>
          <Upload size={14} />
          Import market snapshot
        </Button>
      </div>
      <div className="tabs" role="group" aria-label="Market views">
        {["Charts", "Comparables", "Benchmarks", "Opportunities"].map((t) => (
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
      <section className="panel v2-source-banner">
        <div>
          <h3>
            {current
              ? "Imported snapshot · not a live ranking"
              : "No market feed is connected"}
          </h3>
          <p>
            {current ? (
              <>
                <a target="_blank" rel="noreferrer" href={current.source}>
                  {current.source}
                </a>{" "}
                · collected {displayDate(current.fetchedAt)} · {current.quality}{" "}
                · {current.category} · {current.games.length} games
              </>
            ) : (
              "Import a permitted export with its original source and timestamp. Rankings, players and growth remain empty until real observations are supplied."
            )}
          </p>
          <small>
            {current
              ? comparable
                ? `Comparing against ${displayDate(previous.fetchedAt)} from the same source, category and quality.`
                : "Only one comparable snapshot is available. Growth is unknown; missing values are never treated as zero."
              : "Refresh cadence is manual. No scraping, proprietary analytics access, or live-ranking claim is implied."}
          </small>
        </div>
        <Button variant="outline" onClick={resource.refresh}>
          Refresh stored data
        </Button>
      </section>
      <ResourceState loading={resource.loading} error={resource.error}>
        {current ? (
          <>
            <div className="toolbar">
              <input
                aria-label="Search market games"
                placeholder="Search games or universe IDs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className="v2-sort"
                aria-label="Market snapshot"
                value={current.id}
                onChange={(e) => {
                  setSnapshotId(e.target.value);
                  setComps([]);
                }}
              >
                {resource.data.snapshots.map((s: any) => (
                  <option value={s.id} key={s.id}>
                    {s.category} · {displayDate(s.fetched_at)}
                  </option>
                ))}
              </select>
              <select
                className="v2-sort"
                aria-label="Market genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                <option value="all">All genres</option>
                {[
                  ...new Set<string>(
                    current.games.map((g: any) => g.genre).filter(Boolean),
                  ),
                ].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="tabs" role="group" aria-label="Market sort">
              {[
                ["rank", "Source rank"],
                ["players", "Players"],
                ["visits", "Visits"],
                ["likes", "Like ratio"],
                ["growth", "Player change"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={sort === key ? "current" : ""}
                  aria-pressed={sort === key}
                  onClick={() => setSort(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "Benchmarks" ? (
              <div className="v2-chart-grid">
                {["players", "visits"].map((key) => {
                  const values = rows
                    .map((r: any) => r[key])
                    .filter((n: any) => typeof n === "number")
                    .sort((a: number, b: number) => a - b);
                  return (
                    <section className="panel form" key={key}>
                      <h3>Observed {key}</h3>
                      <p>
                        {values.length
                          ? `Median: ${values[Math.floor(values.length / 2)].toLocaleString()} · minimum ${values[0].toLocaleString()} · maximum ${values.at(-1).toLocaleString()}`
                          : "No supplied observations"}
                      </p>
                      <small>
                        {values.length} games in this filtered import. This is a
                        sample baseline, not an industry-wide benchmark.
                      </small>
                    </section>
                  );
                })}
              </div>
            ) : (
              <>
                {tab === "Comparables" && !comps.length && (
                  <p className="plain-empty">
                    Select up to five games using the Compare checkboxes in
                    Charts, then return here.
                  </p>
                )}
                {tab === "Opportunities" && !rows.length && (
                  <p className="plain-empty">
                    Import at least two comparable snapshots. Opportunities list
                    only games with an observed increase in players; this does
                    not establish causation or product-market fit.
                  </p>
                )}
                <section className="panel table-wrap">
                  <table className="v2-market-table">
                    <thead>
                      <tr>
                        <th>Compare</th>
                        <th>Rank</th>
                        <th>Game</th>
                        <th>Players</th>
                        <th>Like ratio</th>
                        <th>Visits</th>
                        <th>Player change</th>
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((g: any) => (
                        <tr key={g.universeId}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Compare ${g.title}`}
                              checked={comps.includes(g.universeId)}
                              disabled={
                                !comps.includes(g.universeId) &&
                                comps.length >= 5
                              }
                              onChange={(e) =>
                                setComps((ids) =>
                                  e.target.checked
                                    ? [...ids, g.universeId]
                                    : ids.filter((id) => id !== g.universeId),
                                )
                              }
                            />
                          </td>
                          <td>{g.rank ?? "—"}</td>
                          <td>
                            <button
                              className="text-link"
                              onClick={() => setSelected(g)}
                            >
                              {g.title}
                            </button>
                            <small>
                              {g.genre || "Genre not supplied"} · {g.universeId}
                            </small>
                          </td>
                          <td>{g.players?.toLocaleString() ?? "—"}</td>
                          <td>
                            {g.votes && g.likes !== undefined
                              ? `${((g.likes / g.votes) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                          <td>{g.visits?.toLocaleString() ?? "—"}</td>
                          <td>
                            {growth(g) !== null
                              ? `${growth(g)! >= 0 ? "+" : ""}${growth(g)!.toLocaleString()}`
                              : "Unknown"}
                          </td>
                          <td>
                            <Link
                              className="text-link"
                              href={`/pitches?evidence=${encodeURIComponent(current.id)}&universe=${g.universeId}`}
                            >
                              <Lightbulb size={13} />
                              Use in a pitch
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && (
                    <p className="plain-empty">No matching source records.</p>
                  )}
                </section>
              </>
            )}
          </>
        ) : (
          <section className="panel">
            <EmptyState icon={<BarChart3 />} title="Bring your market evidence">
              Use an authorized JSON export. Source rank, players, likes,
              visits, genre and descriptions are optional; absent metrics stay
              unknown.
            </EmptyState>
          </section>
        )}
      </ResourceState>
      {importing && (
        <ImportDialog
          title="Import market snapshot"
          description="Include the original source, collection time and quality. Import only datasets you have permission to use."
          template={template}
          close={() => setImporting(false)}
          submit={async (value) => {
            const out = await act("market/import", value);
            if (out) setSnapshotId(out.id);
            return out;
          }}
        />
      )}
      {selected && current && (
        <DetailDrawer
          title={selected.title}
          subtitle={`Observed source record · ${selected.universeId}`}
          close={() => setSelected(null)}
        >
          <div className="form">
            <p>
              {selected.description ||
                "No game-loop or monetization description was supplied. Forge will not infer one as an observed fact."}
            </p>
            <p>
              Genre: {selected.genre || "Not supplied"}. Collected{" "}
              {displayDate(current.fetchedAt)}. Quality: {current.quality}.
            </p>
            <a
              className="text-link"
              href={selected.url || current.source}
              target="_blank"
              rel="noreferrer"
            >
              Open source <ArrowUpRight size={13} />
            </a>
            <Link
              className="text-link"
              href={`/pitches?evidence=${encodeURIComponent(current.id)}&universe=${selected.universeId}`}
            >
              Draft a concept using this evidence <Lightbulb size={13} />
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                const row = selected;
                setSelected(null);
                newTask(
                  `Research a differentiated game concept using imported snapshot ${current.id}, universe ${row.universeId}, ${row.title}. Observations: ${JSON.stringify(row)}. Source: ${current.source}, collected ${current.fetchedAt}, quality ${current.quality}. Separate observed metrics from hypotheses. Save a pitch with save_pitch and evidence [{snapshotId:"${current.id}",universeId:"${row.universeId}"}]. Do not implement or publish the concept.`,
                );
              }}
            >
              Ask Lead to research a pitch
            </Button>
          </div>
        </DetailDrawer>
      )}
    </div>
  );
}
