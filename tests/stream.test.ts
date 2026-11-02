import { describe, expect, it } from "vitest";
import { readCompletionStream } from "../worker/stream";
function response(data: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(data);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
describe("Provider streaming", () => {
  it("assembles split UTF-8, comments, interleaved tools and terminal usage without exposing reasoning", async () => {
    const frames = [
      ": OPENROUTER PROCESSING\n\n",
      ...[
        {
          choices: [
            {
              delta: {
                reasoning: "private reasoning",
                content: "A café ",
                tool_calls: [
                  {
                    index: 1,
                    id: "second",
                    function: { name: "multi_edit", arguments: '{"source":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: "plan",
                tool_calls: [
                  {
                    index: 0,
                    id: "first",
                    function: {
                      name: "remember",
                      arguments: '{"content":"note"}',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 1, function: { arguments: '"print(1)"}' } },
                ],
              },
            },
          ],
        },
        {
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 8, cost: 0.001 },
        },
      ].map((v) => `data: ${JSON.stringify(v)}\r\n\r\n`),
      "data: [DONE]\n\n",
    ].join("");
    const shown: string[] = [];
    const result = await readCompletionStream(response(frames), (text) =>
      shown.push(text),
    );
    expect(result.choices[0].message.content).toBe("A café plan");
    expect(result.choices[0].message.tool_calls.map((c: any) => c.id)).toEqual([
      "first",
      "second",
    ]);
    expect(
      JSON.parse(result.choices[0].message.tool_calls[1].function.arguments),
    ).toEqual({ source: "print(1)" });
    expect(result.usage.cost).toBe(0.001);
    expect(shown.join("")).not.toContain("private reasoning");
  });
  it("refuses interrupted streams and provider error frames instead of executing partial tool calls", async () => {
    await expect(
      readCompletionStream(
        response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      ),
    ).rejects.toThrow("Incomplete provider stream");
    await expect(
      readCompletionStream(
        response('data: {"error":{"message":"rate limited"}}\n\n'),
      ),
    ).rejects.toThrow("rate limited");
  });
});
