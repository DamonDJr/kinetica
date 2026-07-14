import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const CONTEXTS = new Set(["general", "workout", "weigh-in", "meal", "sleep"]);

function clampScale(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(5, Math.max(1, n)));
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const entries = await db.journalEntry.findMany({
    where: { profileId: profile.id },
    orderBy: { loggedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Write a little something first" }, { status: 400 });
  }

  const [entry] = await Promise.all([
    db.journalEntry.create({
      data: {
        profileId: profile.id,
        content: content.slice(0, 4000),
        mood: clampScale(body.mood) ?? 3,
        energy: clampScale(body.energy),
        context: CONTEXTS.has(body.context) ? body.context : "general",
        isWin: body.isWin === true,
      },
    }),
    db.profile.update({
      where: { id: profile.id },
      data: { xpPoints: { increment: 15 }, lastActiveDate: new Date() },
    }),
  ]);

  return NextResponse.json({ entry, xpAwarded: 15 });
}
