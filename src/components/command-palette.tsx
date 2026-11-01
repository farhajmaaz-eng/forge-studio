"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, Command, FileText, Users } from "lucide-react";
import { roles } from "@/lib/roles";
export default function CommandPalette({
  close,
  tasks,
  choose,
}: {
  close: () => void;
  tasks: any[];
  choose: (href: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const routes = [
    ["Home", "/"],
    ["Lead Chat", "/chat"],
    ["Team", "/team"],
    ["Task board", "/tasks"],
    ["Games", "/games"],
    ["Library", "/library"],
    ["Reviews", "/reviews"],
    ["Activity logs", "/logs"],
    ["Settings", "/settings"],
  ];
  const results = [
    ...routes.map(([label, href]) => ({
      label,
      href,
      category: "Pages",
      icon: Command,
    })),
    ...Object.keys(roles).map((name) => ({
      label: name,
      href: `/team?agent=${name}`,
      category: "Agents",
      icon: Users,
    })),
    ...tasks.slice(0, 30).map((t) => ({
      label: t.title,
      href: "/tasks",
      category: "Tasks",
      icon: FileText,
    })),
  ].filter((x) => x.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      aria-label="Search workspace"
    >
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search pages, agents, and tasks"
          placeholder="Where would you like to go?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close search"
        >
          <kbd>Esc</kbd>
        </button>
      </div>
      <div className="command-results">
        {results.length ? (
          results.map((r, i) => (
            <Link
              onClick={() => {
                choose(r.href);
                close();
              }}
              href={r.href}
              key={r.href + i}
            >
              <r.icon size={17} />
              <span>
                {r.label}
                <small>{r.category}</small>
              </span>
              <ArrowUpRight size={15} />
            </Link>
          ))
        ) : (
          <p>No results for “{query}”. Try an agent name or a page.</p>
        )}
      </div>
      <div className="command-footer">
        <span>Navigate your studio</span>
        <span>
          <kbd>Tab</kbd> to move <kbd>↵</kbd> to open
        </span>
      </div>
    </dialog>
  );
}
