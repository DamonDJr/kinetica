import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      mealRemindersEnabled: true,
      workoutNudgesEnabled: true,
      notifyStartHour: true,
      notifyEndHour: true,
      lastMealNudgeAt: true,
      lastWorkoutNudgeAt: true,
    },
  });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const sub = await db.pushSubscription.findUnique({
    where: { profileId: profile.id },
    select: { endpoint: true, createdAt: true },
  });

  return NextResponse.json({
    settings: profile,
    subscription: sub ? { active: true, createdAt: sub.createdAt } : { active: false },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = (await req.json()) as {
    mealRemindersEnabled?: boolean;
    workoutNudgesEnabled?: boolean;
    notifyStartHour?: number;
    notifyEndHour?: number;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.mealRemindersEnabled === "boolean") data.mealRemindersEnabled = body.mealRemindersEnabled;
  if (typeof body.workoutNudgesEnabled === "boolean") data.workoutNudgesEnabled = body.workoutNudgesEnabled;
  if (typeof body.notifyStartHour === "number" && body.notifyStartHour >= 0 && body.notifyStartHour <= 23) {
    data.notifyStartHour = Math.floor(body.notifyStartHour);
  }
  if (typeof body.notifyEndHour === "number" && body.notifyEndHour >= 0 && body.notifyEndHour <= 23) {
    data.notifyEndHour = Math.floor(body.notifyEndHour);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.profile.update({ where: { id: profile.id }, data });
  return NextResponse.json({
    settings: {
      mealRemindersEnabled: updated.mealRemindersEnabled,
      workoutNudgesEnabled: updated.workoutNudgesEnabled,
      notifyStartHour: updated.notifyStartHour,
      notifyEndHour: updated.notifyEndHour,
    },
  });
}
