import Studio from "@/components/studio";
import { notFound } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await params;
  if (
    ![
      "chat",
      "team",
      "tasks",
      "games",
      "reviews",
      "library",
      "logs",
      "settings",
      "pitches",
      "market",
    ].includes(page)
  )
    notFound();
  const query = await searchParams;
  return (
    <Studio
      page={page}
      routeTaskId={typeof query.task === "string" ? query.task : ""}
      routeAgent={typeof query.agent === "string" ? query.agent : ""}
    />
  );
}
