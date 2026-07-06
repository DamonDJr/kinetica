import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoachContext } from "@/lib/coach-context";
import { sleepAdjustWorkoutPrompt } from "@/lib/ai-prompts";
import { generateJSON } from "@/lib/ai";
import { parseJsonField } from "@/lib/utils";

export const maxDuration = 60;

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets: number;
  reps: string;
  rest?: string;
  notes?: string;
};

type AdjustResult = {
  adjustment: "none" | "lighter" | "harder";
  summary: string;
  exercises: Exercise[];
};

async function adjustNextSession(
  profileId: string,
  hours: number,
  quality: number,
): Promise<{ sessionId: string; sessionName: string; summary: string; adjustment: string } | null> {
  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (!profile?.activeProgramId) return null;

  const nextSession = await db.programSession.findFirst({
    where: { programId: profile.activeProgramId, completed: false },
    orderBy: { dayNumber: "asc" },
  });
  if (!nextSession) return null;

  const ctx = await buildCoachContext(profileId);
  // Always re-adjust from the pristine original if one exists, so repeated
  // sleep updates don't compound (e.g., easier → easier again).
  const sourceExercisesJson = nextSession.originalExercises ?? nextSession.exercises;
  const sourceExercises = parseJsonField<Exercise[]>(sourceExercisesJson, []);
  if (!sourceExercises.length) return null;

  const { system, user } = sleepAdjustWorkoutPrompt(
    ctx,
    { name: nextSession.name, focus: nextSession.focus, exercises: sourceExercises },
    { hours, quality },
  );

  const result = await generateJSON<AdjustResult>(system, user);
  if (!result || !Array.isArray(result.exercises) || result.exercises.length === 0) return null;
  if (result.adjustment === "none") {
    // Still surface the AI's reasoning, but don't write changes — revert
    // exercises back to the original in case a previous adjustment was applied.
    if (nextSession.originalExercises) {
      await db.programSession.update({
        where: { id: nextSession.id },
        data: { exercises: nextSession.originalExercises, adjustmentNote: result.summary },
      });
    }
    return { sessionId: nextSession.id, sessionName: nextSession.name, summary: result.summary, adjustment: "none" };
  }

  await db.programSession.update({
    where: { id: nextSession.id },
    data: {
      exercises: JSON.stringify(result.exercises),
      originalExercises: nextSession.originalExercises ?? sourceExercisesJson,
      adjustmentNote: result.summary,
    },
  });

  await db.aiInsight.create({
    data: {
      profileId,
      type: "sleep-adjust",
      content: JSON.stringify({
        sessionId: nextSession.id,
        sessionName: nextSession.name,
        adjustment: result.adjustment,
        summary: result.summary,
        sleep: { hours, quality },
      }),
    },
  });

  return {
    sessionId: nextSession.id,
    sessionName: nextSession.name,
    summary: result.summary,
    adjustment: result.adjustment,
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") ?? "30", 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await db.sleepLog.findMany({
    where: { profileId: profile.id, forDate: { gte: since } },
    orderBy: { forDate: "desc" },
  });

  return NextResponse.json({ logs });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json({ error: "hours must be between 0 and 24" }, { status: 400 });
  }

  const quality = Math.min(Math.max(parseInt(body.quality, 10) || 3, 1), 5);
  const forDate = body.forDate
    ? startOfDay(new Date(body.forDate))
    : startOfDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const sleepStart = body.sleepStart ? new Date(body.sleepStart) : null;
  const wakeAt = body.wakeAt ? new Date(body.wakeAt) : null;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;

  const existing = await db.sleepLog.findFirst({
    where: { profileId: profile.id, forDate },
  });

  const log = existing
    ? await db.sleepLog.update({
        where: { id: existing.id },
        data: { hours, quality, sleepStart, wakeAt, notes },
      })
    : await db.sleepLog.create({
        data: { profileId: profile.id, hours, quality, sleepStart, wakeAt, notes, forDate },
      });

  // Adjust today's workout based on sleep. Best-effort — failure must not
  // block the sleep log itself.
  const skipAdjust = body.skipAdjust === true;
  let adjustment: Awaited<ReturnType<typeof adjustNextSession>> = null;
  if (!skipAdjust) {
    try {
      adjustment = await adjustNextSession(profile.id, hours, quality);
    } catch {
      adjustment = null;
    }
  }

  return NextResponse.json({ log, adjustment });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const log = await db.sleepLog.findUnique({ where: { id } });
  if (!log || log.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.sleepLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
