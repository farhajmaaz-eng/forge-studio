import { describe, expect, it } from "vitest";
import { approvalGroups, formatPayload, reviewImages } from "../src/lib/review";

describe("Review deliverables", () => {
  it("recognizes MCP images, structured assets, and Markdown without interpreting scripts as media", () => {
    expect(
      reviewImages(
        JSON.stringify({
          content: [
            { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
            { type: "text", text: "![Result](/library/workflow.svg)" },
          ],
        }),
      ),
    ).toEqual(["data:image/png;base64,aGVsbG8=", "/library/workflow.svg"]);
    expect(
      reviewImages({
        image_url: { url: "https://example.com/asset.png" },
        thumbnail: "https://example.com/asset.png",
      }),
    ).toEqual(["https://example.com/asset.png"]);
    expect(
      reviewImages({ source: 'local image = "https://example.com/image.png"' }),
    ).toEqual([]);
  });

  it("rejects executable and unsupported preview URLs, and bounds large image collections", () => {
    for (const image of [
      "javascript:alert(1)",
      "file:///tmp/image.png",
      "//example.com/image.png",
      "data:text/html;base64,aGVsbG8=",
      "data:image/svg+xml;base64,aGVsbG8=",
    ])
      expect(reviewImages({ image })).toEqual([]);
    expect(
      reviewImages(
        Array.from({ length: 50 }, (_, i) => ({ image: `/images/${i}.png` })),
      ),
    ).toHaveLength(8);
    expect(reviewImages(undefined)).toEqual([]);
  });

  it("keeps malformed or plain-text arguments inspectable", () => {
    expect(formatPayload('{"source":')).toBe('{"source":');
    expect(formatPayload('{"source":"print(1)"}')).toContain(
      '"source": "print(1)"',
    );
    expect(formatPayload(undefined)).toBe("No details recorded.");
  });
});

it("limits batch groups to pending approvals belonging to the same game, agent, and change category", () => {
  const data = {
    games: [
      { id: "one", name: "First game" },
      { id: "two", name: "Second game" },
    ],
    runs: [
      { id: "r1", game_id: "one" },
      { id: "r2", game_id: "two" },
    ],
    tasks: [
      { id: "t1", run_id: "r1", agent: "Builder" },
      { id: "t2", run_id: "r2", agent: "Builder" },
    ],
    approvals: [
      { id: "a1", task_id: "t1", tool: "multi_edit", status: "pending" },
      { id: "a2", task_id: "t1", tool: "execute_luau", status: "pending" },
      { id: "a3", task_id: "t2", tool: "multi_edit", status: "pending" },
      { id: "a4", task_id: "t1", tool: "multi_edit", status: "approved" },
      { id: "a5", task_id: "t1", tool: "insert_asset", status: "pending" },
    ],
  };
  const groups = approvalGroups(data);
  expect(groups).toHaveLength(3);
  expect(groups[0].items.map((item) => item.id)).toEqual(["a1", "a2"]);
  expect(groups[1].subtitle).toBe("Second game · Builder");
  expect(groups[2].title).toBe("Asset changes");
});
