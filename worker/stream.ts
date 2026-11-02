// Chat Completions SSE: framing and tool-call deltas are assembled before any
// tools execute. Reasoning fields are intentionally never surfaced to the UI.
export async function readCompletionStream(
  response: Response,
  onText?: (text: string) => void,
  options: { requireUsage?: boolean } = {},
) {
  if (!response.body) throw new Error("Provider stream has no body");
  const message: any = { role: "assistant", content: "" };
  const calls = new Map<number, any>();
  let usage: any = null,
    buffer = "",
    finished = false,
    lastUpdate = 0;
  function frame(frame: string) {
    const data = frame
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    if (data.trim() === "[DONE]") {
      finished = true;
      return;
    }
    const chunk = JSON.parse(data);
    if (chunk.error)
      throw new Error(
        `Provider stream: ${chunk.error.message || "generation failed"}`,
      );
    if (chunk.usage) usage = chunk.usage;
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (typeof delta.content === "string") {
      message.content += delta.content;
      if (Date.now() - lastUpdate > 200) {
        onText?.(message.content);
        lastUpdate = Date.now();
      }
    }
    for (const call of delta.tool_calls || []) {
      if (!Number.isInteger(call.index) || call.index < 0 || call.index > 100)
        throw new Error("Invalid streamed tool index");
      const current = calls.get(call.index) || {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
      if (call.id) current.id = call.id;
      current.function.name += call.function?.name || "";
      current.function.arguments += call.function?.arguments || "";
      calls.set(call.index, current);
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        frame(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) {
        if (buffer.trim()) frame(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!finished || (!usage && options.requireUsage !== false))
    throw new Error("Incomplete provider stream; budget reservation retained");
  if (calls.size) {
    message.tool_calls = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c);
    if (message.tool_calls.some((c: any) => !c.id || !c.function.name))
      throw new Error("Incomplete streamed tool call");
  }
  if (!message.content) message.content = null;
  else onText?.(message.content);
  return { usage, choices: [{ message }] };
}
