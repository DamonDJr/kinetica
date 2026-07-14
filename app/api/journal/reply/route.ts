import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai";
import { journalReplyPrompt } from "@/lib/ai-prompts";

// Separate from POST /api/journal so saving the entry is instant — the client
// calls this afterwards and shows a "coach is replying" state while the local
// model works. A failed reply never loses the entry.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { entryId } = await req.json();
  const entry = await db.journalEntry.findFirst({
    where: { id: entryId, profileId: profile.id },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  if (entry.coachReply) return NextResponse.json({ entry });

  const recentWins = await db.journalEntry.findMany({
    where: { profileId: profile.id, isWin: true, id: { not: entry.id } },
    orderBy: { loggedAt: "desc" },
    take: 3,
    select: { content: true, loggedAt: true },
  });

  const prompt = journalReplyPrompt(
    profile,
    {
      content: entry.content,
      mood: entry.mood,
      energy: entry.energy,
      context: entry.context,
      isWin: entry.isWin,
    },
    recentWins,
  );

  try {
    const reply = (await generateCompletion(prompt.system, prompt.user, {
      temperature: 0.7,
      maxTokens: 2048,
    })).trim();
    if (!reply) return NextResponse.json({ entry });

    const updated = await db.journalEntry.update({
      where: { id: entry.id },
      data: { coachReply: reply.slice(0, 1000) },
    });
    return NextResponse.json({ entry: updated });
  } catch {
    // Model offline or timed out — the entry is already saved, just no reply.
    return NextResponse.json({ entry });
  }
}
