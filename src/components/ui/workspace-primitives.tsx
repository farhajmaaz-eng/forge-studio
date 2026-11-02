"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function DetailDrawer({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="detail-drawer"
      aria-labelledby="drawer-title"
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="drawer-content">
        <header className="drawer-heading">
          <div>
            <span className="section-kicker">Review details</span>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-link"
            aria-label="Close review"
            onClick={() => ref.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending,
  close,
  confirm,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending: boolean;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        if (pending) e.preventDefault();
      }}
      onClose={close}
    >
      <h2 id="confirm-title">{title}</h2>
      <p>{children}</p>
      <div className="actions">
        <Button variant="ghost" disabled={pending} onClick={close}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => void confirm()}
        >
          {pending ? "Recording…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Skeleton() {
  return (
    <div
      className="loading-layout"
      role="status"
      aria-label="Loading workspace"
    >
      <span className="skeleton skeleton-summary" />
      <div className="skeleton-grid">
        {[0, 1, 2, 3].map((i) => (
          <span className="skeleton skeleton-card" key={i} />
        ))}
      </div>
      <span className="sr-only">Connecting to your local worker…</span>
    </div>
  );
}
