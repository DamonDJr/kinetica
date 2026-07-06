import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Back-dating support: accept a YYYY-MM-DD string pinned to noon so it lands
// inside the day window the nutrition page computes. Future dates / bad input
// fall back to "now". Mirrors resolveLoggedAt in /api/nutrition.
function resolveDate(date: unknown): Date {
  if (typeof date === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= todayEnd.getTime()) return d;
    }
  }
  return new Date();
}

function dayWindow(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const { start, end } = dayWindow(dateStr ? new Date(dateStr) : new Date());

  const logs = await db.burnedCalorieLog.findMany({
    where: { profileId: profile.id, loggedAt: { gte: start, lte: end } },
  });

  return NextResponse.json({ kcal: logs.reduce((s, l) => s + l.kcal, 0) });
}

// Replaces the day's burned value rather than accumulating — a daily total is a
// single number the user re-reads and edits (e.g. from a watch).
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const kcal = Math.round(Number(body.kcal));
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 20000) {
    return NextResponse.json({ error: "Enter a valid calories-burned figure." }, { status: 400 });
  }

  const loggedAt = resolveDate(body.date);
  const { start, end } = dayWindow(loggedAt);

  await db.burnedCalorieLog.deleteMany({
    where: { profileId: profile.id, loggedAt: { gte: start, lte: end } },
  });

  if (kcal === 0) return NextResponse.json({ kcal: 0 });

  const log = await db.burnedCalorieLog.create({
    data: {
      profileId: profile.id,
      kcal,
      source: "manual",
      note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
      loggedAt,
    },
  });

  return NextResponse.json({ kcal: log.kcal });
}
