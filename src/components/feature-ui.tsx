"use client";
import { useState, type ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { DetailDrawer } from "./ui/workspace-primitives";
export type Act = (path: string, body: any) => Promise<any>;
export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`badge ${status.replaceAll(" ", "-")}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function ResourceState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children?: ReactNode;
}) {
  return error ? (
    <p className="alert error" role="alert">
      {error}
    </p>
  ) : loading ? (
    <p className="v2-loading" role="status">
      <Loader2 size={15} className="spin" />
      Loading…
    </p>
  ) : (
    children
  );
}
export function ImportDialog({
  title,
  description,
  template,
  close,
  submit,
}: {
  title: string;
  description: string;
  template: object;
  close: () => void;
  submit: (value: any) => Promise<any>;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <DetailDrawer title={title} subtitle={description} close={close}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError("");
          try {
            const value = JSON.parse(text);
            const result = await submit(value);
            if (result) close();
            else
              setError("Import was not saved. Check the data and try again.");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setPending(false);
          }
        }}
      >
        <details>
          <summary>JSON format</summary>
          <pre>{JSON.stringify(template, null, 2)}</pre>
          <p>
            Fill this format with your authorized export. Empty arrays are
            placeholders, not sample observations.
          </p>
        </details>
        <label className="v2-file-input">
          <Upload size={15} />
          Choose a JSON export
          <input
            type="file"
            accept="application/json,.json"
            disabled={pending}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1000000) {
                setError("Use a JSON file under 1 MB");
                return;
              }
              setText(await file.text());
              setError("");
            }}
          />
        </label>
        <label>
          Export JSON
          <textarea
            rows={14}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="failure-text">
            {error}
          </p>
        )}
        <Button disabled={pending}>
          {pending ? "Importing…" : "Import export"}
        </Button>
      </form>
    </DetailDrawer>
  );
}
