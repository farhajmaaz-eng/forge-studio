import "dotenv/config";
import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
// A separate SQLite transaction provides an OS-backed lifetime ownership lock.
// It releases on process death, including on Windows, and avoids stale-PID
// cleanup races. Acquire before importing the application's SQLite/runtime.
const dir = resolve(process.env.FORGE_DATA_DIR || ".data");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const path = resolve(dir, "worker.pid");
const ownership = new Database(resolve(dir, "worker-owner.sqlite"), {
  timeout: 0,
});
try {
  ownership.exec(
    "BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner (id INTEGER)",
  );
} catch (error: any) {
  ownership.close();
  if (["SQLITE_BUSY", "SQLITE_LOCKED"].includes(error.code)) {
    const pid = existsSync(path)
      ? readFileSync(path, "utf8").trim()
      : "starting";
    throw new Error(
      `Another Forge worker is using this data directory (PID ${pid}). Stop it before starting another.`,
    );
  }
  throw error;
}
writeFileSync(path, String(process.pid), { mode: 0o600 });
let released = false;
export function releaseWorkerLock() {
  if (released) return;
  released = true;
  try {
    if (existsSync(path) && readFileSync(path, "utf8") === String(process.pid))
      unlinkSync(path);
  } finally {
    ownership.close();
  }
}
process.on("exit", () => {
  try {
    releaseWorkerLock();
  } catch {
    /* OS releases the ownership lock even after an unclean exit. */
  }
});
