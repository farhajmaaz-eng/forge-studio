import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || "";
  if (
    !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
    (origin && origin !== `http://${host}`)
  )
    return NextResponse.json(
      { error: "Local same-origin requests only" },
      { status: 403 },
    );
  try {
    const { path } = await params;
    const secret = await readFile(
      resolve(process.env.FORGE_DATA_DIR || ".data", "worker.secret"),
      "utf8",
    );
    const r = await fetch(
      `http://127.0.0.1:${process.env.WORKER_PORT || 4318}/${path.map(encodeURIComponent).join("/")}`,
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: req.method === "POST" ? await req.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(130000),
      },
    );
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Worker unavailable. Run npm run worker in a separate terminal.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
