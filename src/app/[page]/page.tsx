import Studio from "@/components/studio";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
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
    ].includes(page)
  )
    notFound();
  return <Studio page={page} />;
}
