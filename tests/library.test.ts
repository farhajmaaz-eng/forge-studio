import { it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const dir = mkdtempSync(resolve(tmpdir(), "forge-library-"));
process.env.FORGE_DATA_DIR = dir;
const { librarySearch, libraryRead, libraryAction } =
  await import("../worker/library");
const { db } = await import("../worker/store");
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("seeds attributed source text and searches code and content", () => {
  expect(librarySearch()).toHaveLength(31);
  const results = librarySearch("RemoteEvent");
  expect(results.length).toBeGreaterThan(0);
  const article = libraryRead(results[0].id);
  expect(article.content.length).toBeGreaterThan(100);
  expect(article.license).toBe("CC BY 4.0");
  expect(article.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(() => librarySearch('" OR * - ()')).not.toThrow();
});
it("persists editable personal references, bookmarks and FTS updates", () => {
  const { id } = libraryAction("save", {
    title: "Quest reference",
    category: "Game design",
    summary: "Personal lesson",
    content: "A cobaltquartz quest example",
    source: "",
  });
  if (!id) throw new Error("Save did not return a reference ID");
  expect(librarySearch("cobaltquartz").map((x) => x.id)).toContain(id);
  libraryAction("star", { id, starred: true });
  expect(librarySearch("", "", true).map((x) => x.id)).toContain(id);
  libraryAction("save", {
    id,
    title: "Updated quest",
    category: "Game design",
    summary: "Updated",
    content: "A moonpearl reward",
    source: "",
  });
  expect(librarySearch("cobaltquartz")).toHaveLength(0);
  expect(librarySearch("moonpearl")[0].title).toBe("Updated quest");
  expect(libraryRead(id).starred).toBe(true);
  libraryAction("delete", { id });
  expect(libraryRead(id)).toBeNull();
});
it("protects official entries and rejects executable image links", () => {
  expect(() =>
    libraryAction("delete", { id: librarySearch()[0].id }),
  ).toThrow();
  expect(() =>
    libraryAction("save", {
      title: "Bad",
      category: "My references",
      summary: "",
      content: "Test",
      image: "javascript:alert(1)",
    }),
  ).toThrow();
});
