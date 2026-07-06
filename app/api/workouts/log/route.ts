import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { workoutPlanId, title, durationMin, caloriesBurned, notes, exercises, mood, energyLevel } = await req.json();

  // Streak counts days trained, not individual sessions — only the first workout
  // logged on a given day bumps it. XP still rewards every logged session.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const alreadyLoggedToday = await db.workoutLog.findFirst({
    where: { profileId: profile.id, completedAt: { gte: dayStart } },
    select: { id: true },
  });

  const [log] = await Promise.all([
    db.workoutLog.create({
      data: {
        profileId: profile.id,
        workoutPlanId: workoutPlanId ?? null,
        title,
        durationMin: durationMin ?? null,
        caloriesBurned: caloriesBurned ?? null,
        notes: notes ?? null,
        exercises: JSON.stringify(exercises ?? []),
        mood: mood ?? null,
        energyLevel: energyLevel ?? null,
      },
    }),
    db.profile.update({
      where: { id: profile.id },
      data: {
        xpPoints: { increment: 50 },
        ...(alreadyLoggedToday ? {} : { streakDays: { increment: 1 } }),
        lastActiveDate: new Date(),
      },
    }),
  ]);

  return NextResponse.json({ log });
}
