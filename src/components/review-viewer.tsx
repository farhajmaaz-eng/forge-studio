"use client";
import { useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Expand,
  Image as ImageIcon,
  ZoomIn,
} from "lucide-react";
import { Button } from "./ui/button";
export type ViewerFile = {
  url: string;
  name: string;
  mime?: string;
  kind?: string;
};
export function fileKind(file: ViewerFile) {
  return file.kind === "video" ||
    file.mime?.startsWith("video/") ||
    /\.(mp4|webm)(?:[?#]|$)/i.test(file.url)
    ? "video"
    : file.kind === "sound" || file.mime?.startsWith("audio/")
      ? "sound"
      : file.kind === "image" ||
          file.mime?.startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(file.url) ||
          file.url.startsWith("data:image/")
        ? "image"
        : "document";
}
export default function ReviewViewer({
  files,
  compareRevisions = false,
}: {
  files: ViewerFile[];
  compareRevisions?: boolean;
}) {
  const [index, setIndex] = useState(0),
    [zoom, setZoom] = useState(1),
    [compare, setCompare] = useState(false),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const current = files[Math.min(index, files.length - 1)];
  if (!current)
    return (
      <p className="plain-empty">
        No media preview is available. Inspect the recorded task output below.
      </p>
    );
  function preview(file: ViewerFile) {
    const kind = fileKind(file);
    return kind === "video" ? (
      <video
        key={file.url}
        controls
        playsInline
        preload="metadata"
        src={file.url}
        aria-label={file.name}
      />
    ) : kind === "sound" ? (
      <audio
        key={file.url}
        controls
        preload="metadata"
        src={file.url}
        aria-label={file.name}
      />
    ) : kind === "image" ? (
      <img
        key={file.url}
        src={file.url}
        alt={file.name}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        onError={() =>
          setError(
            "This image cannot be loaded. You can still open its source or inspect the task output.",
          )
        }
      />
    ) : (
      <div className="media-unavailable">
        <ImageIcon size={28} />
        <span>No inline preview for this file type</span>
      </div>
    );
  }
  return (
    <div className="v2-review-viewer" ref={container}>
      <div className="v2-viewer-toolbar">
        <span title={current.name}>{current.name}</span>
        <small>
          {Math.min(index + 1, files.length)} / {files.length}
        </small>
        <button
          className="icon-link"
          aria-label="Fullscreen preview"
          title="Fullscreen preview"
          onClick={async () => {
            try {
              await container.current?.requestFullscreen();
            } catch {
              setError(
                "Fullscreen is unavailable in this browser. Use the open-file link.",
              );
            }
          }}
        >
          <Expand size={15} />
        </button>
      </div>
      <div className={`v2-media-stage ${compare ? "comparing" : ""}`}>
        {compare
          ? files.slice(0, 2).map((f, i) => (
              <figure key={f.url}>
                <figcaption>{i === 0 ? "Original" : "Revision"}</figcaption>
                {preview(f)}
              </figure>
            ))
          : preview(current)}
      </div>
      <div className="v2-viewer-controls">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Previous media"
          disabled={index === 0 || compare}
          onClick={() => {
            setIndex((i) => i - 1);
            setZoom(1);
            setError("");
          }}
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Next media"
          disabled={index >= files.length - 1 || compare}
          onClick={() => {
            setIndex((i) => i + 1);
            setZoom(1);
            setError("");
          }}
        >
          <ChevronRight size={16} />
        </Button>
        {fileKind(current) === "image" && !compare && (
          <label className="v2-zoom">
            <ZoomIn size={14} />
            <input
              aria-label="Image zoom"
              type="range"
              min="1"
              max="3"
              step="0.25"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <small>{zoom}×</small>
          </label>
        )}
        {compareRevisions &&
          files.length >= 2 &&
          files.slice(0, 2).every((f) => fileKind(f) === "image") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCompare((c) => !c);
                setZoom(1);
              }}
            >
              {compare ? "Single preview" : "Compare revisions"}
            </Button>
          )}
        <a
          className="text-link"
          href={current.url}
          target="_blank"
          rel="noreferrer"
        >
          Open file <ArrowUpRight size={13} />
        </a>
      </div>
      {error && (
        <p className="v2-media-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
