"use client";
import Link from "next/link";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { displayDate, gameForTask, priorities } from "@/lib/feature-contracts";
import { Button } from "./ui/button";
import { Avatar } from "./agent-avatar";
import type { Act } from "./feature-ui";
export default function HumanAttention({
  data,
  act,
  busy,
}: {
  data: any;
  act: Act;
  busy: boolean;
}) {
  const questions = (data.attention || []).filter(
    (q: any) => q.status === "pending",
  );
  const plans = data.runs.filter(
    (r: any) =>
      r.plan_status === "pending" &&
      r.status === "active" &&
      data.tasks.some(
        (t: any) =>
          t.run_id === r.id && t.agent === "Lead" && t.status === "completed",
      ),
  );
  if (!questions.length && !plans.length) return null;
  return (
    <section className="panel v2-human-attention">
      <div className="window-heading">
        <span>
          <MessageSquare size={15} />
          Questions & decisions
        </span>
        <small>{questions.length + plans.length} need you</small>
      </div>
      {questions.map((q: any) => {
        const task = data.tasks.find((t: any) => t.id === q.task_id);
        return (
          <article className="v2-question" key={q.id}>
            <header>
              <Avatar name={task?.agent || "Lead"} size="mini" />
              <span>
                {task?.agent || "Agent"} ·{" "}
                {task ? gameForTask(data, task)?.name : "Workspace"}
              </span>
              <small>
                {priorities[q.priority]} · {displayDate(q.created)}
              </small>
            </header>
            <p>{q.question}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const reply = new FormData(form).get("reply");
                if (await act("attention/reply", { id: q.id, reply }))
                  form.reset();
              }}
            >
              <label className="sr-only" htmlFor={`reply-${q.id}`}>
                Reply to {task?.agent || "agent"}
              </label>
              <textarea
                id={`reply-${q.id}`}
                name="reply"
                required
                rows={2}
                maxLength={12000}
                placeholder="Your answer or decision…"
              />
              <div className="actions">
                <Link href={`/tasks?task=${q.task_id}`} className="text-link">
                  Details <ArrowUpRight size={12} />
                </Link>
                <Button size="sm" disabled={busy}>
                  Reply & resume task
                </Button>
              </div>
            </form>
          </article>
        );
      })}
      {plans.map((r: any) => (
        <Link key={r.id} href="/chat" className="attention-row">
          <span className="state-square approval" />
          <div>
            <strong>{r.request}</strong>
            <small>
              Lead’s plan is ready · approve before specialists start
            </small>
          </div>
          <ArrowUpRight size={13} />
        </Link>
      ))}
    </section>
  );
}
