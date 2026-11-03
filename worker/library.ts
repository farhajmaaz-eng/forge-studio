import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./store";
db.exec(`CREATE TABLE IF NOT EXISTS library_entries(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,summary TEXT NOT NULL,content TEXT NOT NULL,payload TEXT NOT NULL,starred INTEGER DEFAULT 0,updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(title,category,summary,content,content='library_entries',content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS library_ai AFTER INSERT ON library_entries BEGIN INSERT INTO library_fts(rowid,title,category,summary,content) VALUES(new.rowid,new.title,new.category,new.summary,new.content); END;
CREATE TRIGGER IF NOT EXISTS library_ad AFTER DELETE ON library_entries BEGIN INSERT INTO library_fts(library_fts,rowid,title,category,summary,content) VALUES('delete',old.rowid,old.title,old.category,old.summary,old.content); END;
CREATE TRIGGER IF NOT EXISTS library_au AFTER UPDATE OF title,category,summary,content ON library_entries BEGIN INSERT INTO library_fts(library_fts,rowid,title,category,summary,content) VALUES('delete',old.rowid,old.title,old.category,old.summary,old.content); INSERT INTO library_fts(rowid,title,category,summary,content) VALUES(new.rowid,new.title,new.category,new.summary,new.content); END;`);
const seeds = JSON.parse(
  readFileSync(resolve("library/official.json"), "utf8"),
);
const put = db.prepare(
  `INSERT INTO library_entries(id,title,category,summary,content,payload) VALUES (@id,@title,@category,@summary,@content,@payload) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,summary=excluded.summary,content=excluded.content,payload=excluded.payload,updated=CURRENT_TIMESTAMP`,
);
db.transaction(() => {
  for (const x of seeds) {
    const old: any = db
      .prepare("SELECT payload FROM library_entries WHERE id=?")
      .get(x.id);
    if (!old || old.payload !== JSON.stringify(x))
      put.run({
        id: x.id,
        title: x.title,
        category: x.category,
        summary: x.summary,
        content: x.content,
        payload: JSON.stringify(x),
      });
  }
})();
export function resetLibrary() {
  db.prepare("DELETE FROM library_entries").run();
  for (const x of seeds)
    put.run({
      id: x.id,
      title: x.title,
      category: x.category,
      summary: x.summary,
      content: x.content,
      payload: JSON.stringify(x),
    });
}
function unpack(row: any, full = false) {
  if (!row) return null;
  const a = JSON.parse(row.payload);
  if (!full) delete a.content;
  return { ...a, starred: !!row.starred, updated: row.updated };
}
export function libraryRead(id: string) {
  return unpack(
    db.prepare("SELECT * FROM library_entries WHERE id=?").get(id),
    true,
  );
}
export function librarySearch(query = "", category = "", starred = false) {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 12) || [];
  let sql = tokens.length
    ? `SELECT e.* FROM library_fts f JOIN library_entries e ON e.rowid=f.rowid WHERE library_fts MATCH ?`
    : "SELECT e.* FROM library_entries e WHERE 1=1";
  const args: any[] = tokens.length
    ? [tokens.map((t) => '"' + t + '"*').join(" OR ")]
    : [];
  if (category) {
    sql += " AND e.category=?";
    args.push(category);
  }
  if (starred) sql += " AND e.starred=1";
  sql += tokens.length
    ? " ORDER BY bm25(library_fts,8,3,2,1),e.title LIMIT 100"
    : " ORDER BY e.starred DESC,e.title LIMIT 200";
  return (db.prepare(sql).all(...args) as any[]).map((r) => unpack(r));
}
const webUrl = z
  .string()
  .max(2000)
  .refine((s) => !s || /^https?:\/\//i.test(s), "Use an http(s) source URL");
const schema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  summary: z.string().max(1000),
  content: z.string().max(60000),
  source: webUrl.default(""),
  image: z
    .string()
    .max(80000)
    .refine(
      (s) =>
        !s ||
        /^https:\/\//i.test(s) ||
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
      "Use an HTTPS image URL or upload a PNG, JPEG or WebP",
    )
    .default(""),
  agents: z.array(z.string()).max(7).default([]),
});
export function libraryAction(action: string, body: any) {
  if (action === "save") {
    const a = schema.parse(body);
    if (!a.content.trim() && !a.source)
      throw new Error("Add guide text or a source link");
    if (a.id && libraryRead(a.id)?.kind !== "personal")
      throw new Error("Only personal references can be edited");
    const id = a.id || randomUUID();
    const entry = {
      ...a,
      id,
      kind: "personal",
      retrieved: new Date().toISOString(),
      attribution: "Your workspace",
      license: "User supplied",
      do: [],
      avoid: [],
    };
    put.run({
      id,
      title: a.title,
      category: a.category,
      summary: a.summary,
      content: a.content,
      payload: JSON.stringify(entry),
    });
    return { id };
  }
  const a = z
    .object({ id: z.string(), starred: z.boolean().optional() })
    .parse(body);
  const entry = libraryRead(a.id);
  if (!entry) throw new Error("Reference not found");
  if (action === "star") {
    db.prepare("UPDATE library_entries SET starred=? WHERE id=?").run(
      Number(!!a.starred),
      a.id,
    );
    return { ok: true };
  }
  if (action === "delete") {
    if (entry.kind !== "personal")
      throw new Error("Official references are maintained by the source pack");
    db.prepare("DELETE FROM library_entries WHERE id=?").run(a.id);
    return { ok: true };
  }
  throw new Error("Unknown library action");
}
