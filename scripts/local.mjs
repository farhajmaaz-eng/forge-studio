import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = ["worker", "dev"].map((name) =>
  spawn(npm, ["run", name], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
);
process.on("SIGINT", () => processes.forEach((p) => p.kill("SIGINT")));
process.on("SIGTERM", () => processes.forEach((p) => p.kill("SIGTERM")));
