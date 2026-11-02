"use client";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Library from "./library";
import AssetLibrary from "./asset-library";
import type { Act } from "./feature-ui";
export default function LibraryHub({
  data,
  selectedGame,
  act,
  busy,
  newTask,
}: {
  data: any;
  selectedGame: string;
  act: Act;
  busy: boolean;
  newTask: (initial?: string) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") || "references";
  return (
    <div className="v2-stack">
      <div className="tabs" role="group" aria-label="Library sections">
        {["references", "assets", "systems"].map((t) => (
          <button
            key={t}
            className={tab === t ? "current" : ""}
            aria-pressed={tab === t}
            onClick={() => router.replace(`/library?tab=${t}`)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "assets" || tab === "systems" ? (
        data && (
          <AssetLibrary
            key={tab}
            systems={tab === "systems"}
            data={data}
            selectedGame={selectedGame}
            act={act}
            busy={busy}
            newTask={newTask}
          />
        )
      ) : (
        <Library />
      )}
    </div>
  );
}
