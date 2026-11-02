"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Download,
  Flame,
  Gamepad2,
  Gauge,
  Home,
  Images,
  Keyboard,
  ListTodo,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "./agent-avatar";
import { Button } from "./ui/button";
import { roles, type Role } from "@/lib/roles";
import { downloadDiagnostics, type DesktopPreferences } from "@/lib/desktop";

// Keep the established Alt+1…9 workspace order.
export const navigation = [
  ["home", "Home", Home],
  ["chat", "Lead", Sparkles],
  ["team", "Team", Users],
  ["tasks", "Tasks", ListTodo],
  ["games", "Games", Gamepad2],
  ["reviews", "Review", Images],
  ["library", "Library", BookOpen],
  ["logs", "Activity", Activity],
  ["settings", "Settings", Settings],
] as const;

export function UsagePanel({
  data,
  compact = false,
}: {
  data: any;
  compact?: boolean;
}) {
  if (!data || !Number.isFinite(data.settings.cap)) return null;
  const { cost, reserved } = data.spend;
  const cap = data.settings.cap;
  const percent = cap > 0 ? Math.round(((cost + reserved) / cap) * 100) : 0;
  return (
    <section
      className={`usage-panel ${compact ? "compact" : ""}`}
      aria-label="Workspace API budget"
    >
      <div className="usage-heading">
        <Gauge size={15} />
        <strong>{compact ? "Workspace budget" : "API budget"}</strong>
        {compact ? (
          <Link href="/settings">Change</Link>
        ) : (
          <span>{cap > 0 ? `${percent}%` : "No budget"}</span>
        )}
      </div>
      <progress aria-label="API budget spent" value={cost} max={cap || 1} />
      <p>
        ${cost.toFixed(4)} of ${cap.toFixed(2)} spent
      </p>
      {!compact && (
        <>
          <div className="usage-reserved">
            <span>Reserved</span>
            <span>${reserved.toFixed(4)}</span>
          </div>
          <progress
            className="reserved-progress"
            aria-label="API budget reserved"
            value={reserved}
            max={cap || 1}
          />
          <Link className="text-link" href="/logs">
            See all usage <ChevronDown size={12} />
          </Link>
        </>
      )}
    </section>
  );
}

type Props = {
  children: ReactNode;
  page: string;
  data: any;
  selectedGame: string;
  chooseGame: (id: string) => void;
  connection: string;
  updatedAt: number;
  syncError: boolean;
  refresh: () => Promise<void>;
  preferences: DesktopPreferences;
  updatePreferences: (patch: Partial<DesktopPreferences>) => void;
  openSearch: () => void;
  openShortcuts: () => void;
  selectAgent: (name: string) => void;
};

export default function WorkspaceShell(props: Props) {
  const {
    page,
    data,
    selectedGame,
    chooseGame,
    connection,
    updatedAt,
    syncError,
    refresh,
    preferences,
    updatePreferences,
    openSearch,
    openShortcuts,
    selectAgent,
  } = props;
  const mobileNav = useRef<HTMLDialogElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const tasks: any[] = data?.tasks || [];
  const running = tasks.filter((t) => t.status === "running");
  const workingAgents = new Set(running.map((t) => t.agent)).size;
  const reviews =
    (data?.approvals || []).filter((a: any) => a.status === "pending").length +
    (data?.runs || []).filter((r: any) => r.status === "review").length +
    (data?.uncertain || []).length;
  const attention =
    reviews +
    tasks.filter((t) => ["failed", "blocked"].includes(t.status)).length;
  const game = data?.games.find((g: any) => g.id === selectedGame);
  const title = navigation.find((n) => n[0] === page)?.[1] || "Home";
  const agents = data?.agents || [];
  const counts: Record<string, number> = {
    home: attention,
    team: workingAgents,
    tasks: tasks.filter((t) =>
      ["running", "queued", "approval"].includes(t.status),
    ).length,
    reviews,
  };
  useEffect(() => {
    mobileNav.current?.close();
  }, [page]);
  // A mobile drawer must not remain modal after resizing to desktop.
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const close = () => {
      if (media.matches) mobileNav.current?.close();
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);

  function navItem(id: string) {
    const entry = navigation.find((n) => n[0] === id)!;
    const [, label, Icon] = entry;
    return (
      <Link
        key={id}
        href={id === "home" ? "/" : `/${id}`}
        className={`nav-item ${page === id ? "active" : ""}`}
        aria-label={label}
        aria-current={page === id ? "page" : undefined}
        title={`${label} · Alt+${navigation.indexOf(entry) + 1}`}
        onClick={() => mobileNav.current?.close()}
      >
        <Icon size={18} />
        <span className="nav-text">{label}</span>
        {counts[id] > 0 && (
          <span
            className={`count ${id === "home" ? "attention-count" : ["team", "tasks"].includes(id) ? "active-count" : ""}`}
          >
            {["team", "tasks"].includes(id) && <span className="dot green" />}
            {counts[id]}
          </span>
        )}
      </Link>
    );
  }

  const sidebarContent = (
    <>
      <Link href="/" className="brand" aria-label="Forge Studio home">
        <span className="brand-symbol">
          <Flame size={21} />
        </span>
        <strong>
          forge<span>studio</span>
        </strong>
        <span className="brand-tag">LOCAL</span>
      </Link>
      <button
        className="workspace-search"
        onClick={() => {
          mobileNav.current?.close();
          openSearch();
        }}
      >
        <Search size={15} />
        <span>Search workspace</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav aria-label="Main navigation">
        {["home", "chat", "team", "tasks", "reviews"].map(navItem)}
      </nav>
      <span className="nav-label">Studio</span>
      <nav aria-label="Studio navigation">
        {["games", "library", "logs"].map(navItem)}
      </nav>
      <section className="sidebar-team" aria-label="Agent team">
        <span className="nav-label">
          Team <span>{agents.length || ""}</span>
        </span>
        <div className="agent-tile-grid">
          {agents.map((a: any) => {
            const active = running.some((t) => t.agent === a.name);
            const status = !a.enabled
              ? "disabled"
              : active
                ? "working"
                : "idle";
            return (
              <Link
                key={a.name}
                href={`/team?agent=${encodeURIComponent(a.name)}`}
                aria-label={`Open ${a.name} agent`}
                title={`${a.name} · ${roles[a.name as Role]?.title || "Agent"} · ${status}`}
                onClick={() => {
                  selectAgent(a.name);
                  mobileNav.current?.close();
                }}
              >
                <Avatar name={a.name} size="mini" working={active} />
              </Link>
            );
          })}
        </div>
      </section>
      <div className="sidebar-footer">
        <UsagePanel data={data} />
        <button
          className="sidebar-utility"
          onClick={() => {
            mobileNav.current?.close();
            openShortcuts();
          }}
        >
          <Keyboard size={16} /> Keyboard shortcuts <kbd>?</kbd>
        </button>
        <button
          className="sidebar-utility"
          onClick={() => downloadDiagnostics(data)}
          disabled={!data}
        >
          <Download size={16} /> Download diagnostics
        </button>
        {navItem("settings")}
        <Link
          href="/team"
          className="agent-activity-status"
          onClick={() => mobileNav.current?.close()}
        >
          <span className={`dot ${workingAgents ? "green" : "muted"}`} />
          <div>
            <strong>
              {workingAgents} {workingAgents === 1 ? "agent" : "agents"} working
            </strong>
            <small>
              {data?.settings.paused
                ? "Team is paused"
                : workingAgents
                  ? "Across your workspace"
                  : "Ready for your next request"}
            </small>
          </div>
          <ChevronDown size={13} />
        </Link>
      </div>
    </>
  );

  return (
    <div
      className={`app page-${page} ${preferences.focus ? "focus-mode" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        {sidebarContent}
      </aside>
      <dialog
        ref={mobileNav}
        className="mobile-navigation"
        aria-label="Workspace navigation"
        onClick={(e) => {
          if (e.target === e.currentTarget) mobileNav.current?.close();
        }}
      >
        <div className="mobile-sidebar-content">
          <button
            className="icon-link close-navigation"
            onClick={() => mobileNav.current?.close()}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
          {sidebarContent}
        </div>
      </dialog>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-link mobile-nav-toggle"
              aria-label="Open navigation"
              onClick={() => mobileNav.current?.showModal()}
            >
              <PanelLeft size={17} />
            </button>
            <button
              className="icon-link focus-toggle"
              aria-label={
                preferences.focus ? "Show navigation" : "Hide navigation"
              }
              title="Toggle navigation · Alt+F"
              onClick={() => updatePreferences({ focus: !preferences.focus })}
            >
              <PanelLeft size={17} />
            </button>
            <div className="game-switcher">
              <span className="project-avatar">
                {game?.name?.[0]?.toUpperCase() || <Gamepad2 size={16} />}
              </span>
              <select
                aria-label="Workspace game"
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
            {attention > 0 && (
              <Link
                href={reviews ? "/reviews" : "/tasks"}
                className="attention-chip"
              >
                <span>{attention}</span> need your attention
              </Link>
            )}
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-page">{title}</span>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${connection === "live" && data && !syncError ? "is-live" : ""}`}
              title={
                updatedAt
                  ? `Last synced ${new Date(updatedAt).toLocaleTimeString()}`
                  : "Waiting for worker"
              }
            >
              <span
                className={`dot ${data && !syncError ? "green" : "amber"}`}
              />
              {syncError
                ? "Connection interrupted"
                : data
                  ? connection === "live"
                    ? "Live · updated just now"
                    : "Synced · polling"
                  : "Connecting"}
            </span>
            <button
              className="refresh-button"
              disabled={refreshing}
              aria-label="Refresh workspace"
              title="Refresh workspace"
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={14} className={refreshing ? "spin" : ""} />
              <span>Refresh numbers</span>
            </button>
            <button
              className="icon-link toolbar-search"
              onClick={openSearch}
              aria-label="Search workspace"
              title="Search workspace · Ctrl+K"
            >
              <Search size={16} />
            </button>
            <Button asChild>
              <Link href="/chat" aria-label="New task">
                <Plus size={16} />
                <span>New task</span>
              </Link>
            </Button>
          </div>
        </header>
        {props.children}
      </div>
    </div>
  );
}
