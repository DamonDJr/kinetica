import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { JournalClient } from "./journal-client";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const { context } = await searchParams;

  const entries = await db.journalEntry.findMany({
    where: { profileId: profile.id },
    orderBy: { loggedAt: "desc" },
    take: 50,
  });

  return (
    <JournalClient
      displayName={profile.displayName}
      initialContext={context}
      initialEntries={entries.map((e) => ({
        id: e.id,
        content: e.content,
        mood: e.mood,
        energy: e.energy,
        context: e.context,
        isWin: e.isWin,
        coachReply: e.coachReply,
        loggedAt: e.loggedAt.toISOString(),
      }))}
    />
  );
}
