import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseHHMM } from "@/lib/sleep";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: { wakeTimeGoal: true, sleepGoalHours: true },
  });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  return NextResponse.json(profile);
}

export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const data: { wakeTimeGoal?: string | null; sleepGoalHours?: number } = {};

  if (body.wakeTimeGoal !== undefined) {
    if (body.wakeTimeGoal === null || body.wakeTimeGoal === "") {
      data.wakeTimeGoal = null;
    } else if (typeof body.wakeTimeGoal === "string" && parseHHMM(body.wakeTimeGoal)) {
      data.wakeTimeGoal = body.wakeTimeGoal;
    } else {
      return NextResponse.json({ error: "wakeTimeGoal must be HH:MM (24h)" }, { status: 400 });
    }
  }

  if (body.sleepGoalHours !== undefined) {
    const h = Number(body.sleepGoalHours);
    if (!Number.isFinite(h) || h < 4 || h > 12) {
      return NextResponse.json({ error: "sleepGoalHours must be between 4 and 12" }, { status: 400 });
    }
    data.sleepGoalHours = h;
  }

  const updated = await db.profile.update({
    where: { id: profile.id },
    data,
    select: { wakeTimeGoal: true, sleepGoalHours: true },
  });

  return NextResponse.json(updated);
}
