"use client";
import { useCallback, useEffect, useState } from "react";
export type DesktopPreferences = {
  theme: "nord" | "graphite" | "evergreen";
  density: "compact" | "comfortable";
  focus: boolean;
};
const defaults: DesktopPreferences = {
  theme: "nord",
  density: "compact",
  focus: false,
};
export function useDesktopPreferences() {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("forge-desktop") || "{}");
      setPreferences({
        theme: ["nord", "graphite", "evergreen"].includes(saved.theme)
          ? saved.theme
          : defaults.theme,
        density: saved.density === "comfortable" ? "comfortable" : "compact",
        focus: !!saved.focus,
      });
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.density = preferences.density;
    if (ready) {
      try {
        localStorage.setItem("forge-desktop", JSON.stringify(preferences));
      } catch {}
    }
  }, [preferences, ready]);
  const update = useCallback(
    (patch: Partial<DesktopPreferences>) =>
      setPreferences((p) => ({ ...p, ...patch })),
    [],
  );
  return [preferences, update] as const;
}
export function downloadDiagnostics(data: any) {
  const report = {
    app: "Forge Studio",
    generatedAt: new Date().toISOString(),
    worker: {
      heartbeat: data?.settings.workerHeartbeat || 0,
      paused: !!data?.settings.paused,
    },
    studio: {
      status: data?.settings.studioStatus || "unknown",
      tools: data?.settings.studioTools?.length || 0,
    },
    provider: {
      id: data?.provider?.id,
      keyConfigured: !!data?.keyConfigured,
      costTracking: data?.provider?.costTracking,
    },
    budget: {
      cap: data?.settings.cap,
      spent: data?.spend.cost,
      reserved: data?.spend.reserved,
      unpricedCalls: data?.spend.unpriced,
      nvidiaInputTokens: data?.spend.nimInputTokens,
      nvidiaOutputTokens: data?.spend.nimOutputTokens,
    },
    agents: (data?.agents || []).map((a: any) => ({
      name: a.name,
      model: a.model,
      enabled: !!a.enabled,
    })),
    tasks: (data?.tasks || []).reduce(
      (counts: Record<string, number>, t: any) => {
        counts[t.status] = (counts[t.status] || 0) + 1;
        return counts;
      },
      {},
    ),
    games: data?.games.length || 0,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "forge-diagnostics.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
