import {
  GitBranch,
  Blocks,
  Hammer,
  PanelsTopLeft,
  Mountain,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { roles, type Role } from "@/lib/roles";
const icons = {
  Lead: GitBranch,
  Architect: Blocks,
  Builder: Hammer,
  Frame: PanelsTopLeft,
  Scenic: Mountain,
  Balance: Scale,
  Tester: ShieldCheck,
};
export function Avatar({
  name,
  size = "",
  working = false,
}: {
  name: string;
  size?: string;
  working?: boolean;
}) {
  const r = roles[name as Role];
  const Icon = icons[name as Role] || Blocks;
  return (
    <span
      aria-hidden="true"
      className={`avatar ${size} ${working ? "is-working" : ""}`}
      style={{ "--agent": r?.color || "#aaa" } as React.CSSProperties}
    >
      <Icon size={size === "mini" ? 16 : 21} strokeWidth={1.7} />
    </span>
  );
}
