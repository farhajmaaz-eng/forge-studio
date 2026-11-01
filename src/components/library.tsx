"use client";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Search,
  Plus,
  Star,
  ArrowLeft,
  ExternalLink,
  Check,
  X,
  Upload,
  Trash2,
  Pencil,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
const categories = [
  "All references",
  "Security",
  "Data & architecture",
  "Luau & networking",
  "World building",
  "Performance",
  "UI & accessibility",
  "Game design",
  "Economy & live ops",
  "Testing & release",
  "My references",
];
export default function Library() {
  const [items, setItems] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All references"),
    [starred, setStarred] = useState(false),
    [article, setArticle] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const r = await fetch(
          "/api/library?" +
            new URLSearchParams({
              q: query,
              category:
                category === "All references" || category === "My references"
                  ? ""
                  : category,
              starred: String(starred),
            }),
          { signal: c.signal },
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setItems(
          category === "My references"
            ? data.filter((x: any) => x.kind === "personal")
            : data,
        );
        setError("");
      } catch (e) {
        if (!c.signal.aborted) setError(String(e));
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      c.abort();
      clearTimeout(timeout);
    };
  }, [query, category, starred, revision]);
  async function read(id: string) {
    setLoading(true);
    try {
      const r = await fetch("/api/library?id=" + encodeURIComponent(id));
      const a = await r.json();
      if (!r.ok || !a) throw new Error(a?.error || "Reference not found");
      setArticle(a);
      setEditing(null);
      setError("");
      document.querySelector(".main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  async function action(name: string, body: any) {
    setSaving(true);
    try {
      const r = await fetch("/api/library/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setRevision((v) => v + 1);
      setError("");
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function favorite(a: any) {
    if (await action("star", { id: a.id, starred: !a.starred })) {
      if (article?.id === a.id) setArticle({ ...article, starred: !a.starred });
    }
  }
  const fresh = () => {
    setArticle(null);
    setEditing({
      title: "",
      summary: "",
      category: "My references",
      source: "",
      content: "",
      image: "",
      agents: [],
    });
  };
  return (
    <div className="reference-library">
      <div className="library-intro">
        <div>
          <span className="section-kicker">Reference index</span>
          <h2>Development library</h2>
          <p>
            Official guides, practical do’s and don’ts, and the knowledge you
            collect along the way.
          </p>
        </div>
        <Button onClick={fresh}>
          <Plus size={16} /> Add reference
        </Button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="library-layout">
        <aside className="library-categories">
          <span className="nav-label">BROWSE TOPICS</span>
          {categories.map((c) => (
            <button
              className={category === c && !starred ? "selected" : ""}
              onClick={() => {
                setCategory(c);
                setStarred(false);
                setArticle(null);
                setEditing(null);
              }}
              key={c}
            >
              {c === "All references" ? (
                <BookOpen size={15} />
              ) : (
                <span className="category-mark" />
              )}
              {c}
            </button>
          ))}
          <button
            className={starred ? "selected" : ""}
            onClick={() => {
              setStarred((v) => !v);
              setCategory("All references");
              setArticle(null);
              setEditing(null);
            }}
          >
            <Star size={15} /> Saved references
          </button>
          <div className="library-agent-note">
            <BookOpen size={19} />
            <strong>Agent access</strong>
            <p>
              All seven agents can search these guides and read them during
              tasks. References are consulted on demand, keeping model context
              focused.
            </p>
            <small>
              Official text is saved locally. External images and links may need
              an internet connection.
            </small>
          </div>
        </aside>
        <div className="library-main">
          {editing ? (
            <form
              className="panel form library-editor"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await action("save", editing);
                if (result) {
                  setEditing(null);
                  await read(result.id);
                }
              }}
            >
              <div className="panel-heading">
                <h3>{editing.id ? "Edit reference" : "Add reference"}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(null)}
                >
                  <X size={15} /> Cancel
                </Button>
              </div>
              <label>
                Title
                <input
                  required
                  maxLength={200}
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Category
                  <input
                    required
                    maxLength={80}
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value })
                    }
                    list="library-topic-list"
                  />
                  <datalist id="library-topic-list">
                    {categories
                      .filter((c) => c !== "All references")
                      .map((c) => (
                        <option key={c} value={c} />
                      ))}
                  </datalist>
                </label>
                <label>
                  Source URL (optional)
                  <input
                    type="url"
                    value={editing.source}
                    placeholder="https://…"
                    onChange={(e) =>
                      setEditing({ ...editing, source: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Short description
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={editing.summary}
                  onChange={(e) =>
                    setEditing({ ...editing, summary: e.target.value })
                  }
                />
              </label>
              <label>
                Guide or notes (Markdown)
                <textarea
                  rows={16}
                  maxLength={60000}
                  value={editing.content}
                  onChange={(e) =>
                    setEditing({ ...editing, content: e.target.value })
                  }
                  placeholder="Write your workflow, checklists, examples, and lessons learned…"
                />
              </label>
              <label className="library-file">
                <Upload size={15} /> Import Markdown or text
                <input
                  type="file"
                  accept=".md,.txt,text/plain,text/markdown"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 60000) {
                      setError("Text imports must be under 60 KB");
                      return;
                    }
                    setEditing({
                      ...editing,
                      content: await f.text(),
                      title:
                        editing.title || f.name.replace(/\.(md|txt)$/i, ""),
                    });
                  }}
                />
              </label>
              <label>
                Cover image URL (optional)
                <input
                  type="url"
                  value={editing.image.startsWith("data:") ? "" : editing.image}
                  placeholder="https://…"
                  onChange={(e) =>
                    setEditing({ ...editing, image: e.target.value })
                  }
                />
              </label>
              <label className="library-file">
                <ImageIcon size={15} /> Or attach a small image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 30000) {
                      setError(
                        "Use an image under 30 KB, or provide an HTTPS image URL",
                      );
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setEditing({ ...editing, image: reader.result });
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
              {editing.image && (
                <img
                  className="reference-cover"
                  src={editing.image}
                  alt="Reference cover preview"
                  referrerPolicy="no-referrer"
                />
              )}
              <p>
                Save a source link, your own guide, or both. Imported text stays
                local and is searchable by the agents.
              </p>
              <Button disabled={saving}>
                Save reference <Check size={15} />
              </Button>
            </form>
          ) : article ? (
            <article className="panel reference-reader">
              <div className="reader-toolbar">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setArticle(null)}
                >
                  <ArrowLeft size={15} /> All references
                </Button>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      article.starred ? "Unsave reference" : "Save reference"
                    }
                    onClick={() => favorite(article)}
                    disabled={saving}
                  >
                    <Star
                      size={17}
                      fill={article.starred ? "currentColor" : "none"}
                    />
                  </Button>
                  {article.kind === "personal" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit reference"
                        onClick={() => setEditing({ ...article })}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete reference"
                        onClick={async () => {
                          if (confirm("Delete this personal reference?")) {
                            if (await action("delete", { id: article.id }))
                              setArticle(null);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <span className="section-kicker">
                {article.category} ·{" "}
                {article.kind === "official"
                  ? "OFFICIAL REFERENCE"
                  : "YOUR REFERENCE"}
              </span>
              <h2>{article.title}</h2>
              <p className="reader-summary">{article.summary}</p>
              <div className="reference-meta">
                <span>
                  {Math.max(
                    1,
                    Math.ceil(article.content.split(/\s+/).length / 220),
                  )}{" "}
                  min read
                </span>
                <span>{article.attribution}</span>
                <span>
                  {article.kind === "official" ? (
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CC BY 4.0
                    </a>
                  ) : (
                    article.license
                  )}
                </span>
              </div>
              {article.source && (
                <a
                  className="text-link source-link"
                  href={article.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original source <ExternalLink size={14} />
                </a>
              )}
              {article.kind === "official" && (
                <p className="source-version">
                  Saved {new Date(article.retrieved).toLocaleDateString()} ·{" "}
                  <a
                    href={article.source_file}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source revision {article.revision.slice(0, 8)}
                  </a>
                  . Official documentation can change; check the live source for
                  current policies and limits. Practical notes below are Forge’s
                  editorial guidance.
                </p>
              )}
              {article.image && (
                <img
                  className="reference-cover"
                  src={article.image}
                  alt={
                    article.kind === "official"
                      ? "Forge diagram illustrating " + article.title
                      : article.title + " reference image"
                  }
                  referrerPolicy="no-referrer"
                />
              )}
              {article.do?.length > 0 && (
                <div className="reference-advice">
                  <section>
                    <h3>
                      <Check size={16} /> Do this
                    </h3>
                    <ul>
                      {article.do.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3>
                      <X size={16} /> Avoid this
                    </h3>
                    <ul>
                      {article.avoid.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              )}
              <div className="reference-markdown">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={resolveReference(href, article)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    img: ({ src, alt }) =>
                      typeof src === "string" ? (
                        <img
                          loading="lazy"
                          src={resolveReference(src, article)}
                          alt={alt || "Documentation illustration"}
                          referrerPolicy="no-referrer"
                        />
                      ) : null,
                  }}
                >
                  {article.content ||
                    "This reference links to an external resource. Open the original source above."}
                </Markdown>
              </div>
            </article>
          ) : (
            <>
              <div className="library-search">
                <Search size={18} />
                <input
                  aria-label="Search library"
                  placeholder="Search guides, code examples, or a topic…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>{items.length} references</span>
              </div>
              {loading ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  Searching your library…
                </div>
              ) : items.length ? (
                <div className="reference-grid">
                  {items.map((a) => (
                    <article className="panel reference-card" key={a.id}>
                      <div className="reference-card-top">
                        <span className="badge">{a.category}</span>
                        <button
                          aria-label={
                            a.starred ? "Unsave " + a.title : "Save " + a.title
                          }
                          onClick={() => favorite(a)}
                          disabled={saving}
                        >
                          <Star
                            size={16}
                            fill={a.starred ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <button
                        className="reference-open"
                        onClick={() => read(a.id)}
                      >
                        <BookOpen size={24} />
                        <h3>{a.title}</h3>
                        <p>{a.summary || "Your saved guide or reference."}</p>
                      </button>
                      <div className="reference-card-footer">
                        <small>
                          {a.kind === "official"
                            ? "Roblox Creator Docs"
                            : "Personal reference"}
                        </small>
                        <button onClick={() => read(a.id)}>Read guide →</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="panel empty">
                  <BookOpen />
                  <h3>No references found</h3>
                  <p>
                    Try another search, choose a topic, or add a reference of
                    your own.
                  </p>
                  <Button onClick={fresh}>Add reference</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function resolveReference(value: string | undefined, article: any) {
  if (!value) return "";
  try {
    const base =
      article.source_file?.replace(
        "https://github.com/Roblox/creator-docs/blob/",
        "https://raw.githubusercontent.com/Roblox/creator-docs/",
      ) ||
      article.source ||
      "https://create.roblox.com/docs/";
    const u = new URL(value, base);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
