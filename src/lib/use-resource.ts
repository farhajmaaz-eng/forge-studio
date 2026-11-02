"use client";
import { useCallback, useEffect, useState } from "react";
export function useResource<T = any>(
  path: string | null,
  revision: unknown = 0,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    void (async () => {
      try {
        const r = await fetch(`/api/${path}`, { signal: controller.signal });
        const value = await r.json();
        if (!r.ok) throw new Error(value.error || "Request failed");
        if (!controller.signal.aborted) setData(value);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [path, revision, version]);
  return { data, error, loading, refresh };
}
