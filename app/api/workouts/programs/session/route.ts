import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoachContext } from "@/lib/coach-context";
import { feedbackAdjustNextSessionPrompt } from "@/lib/ai-prompts";
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

type FeedbackItem = { exerciseName: string; difficulty: number; note?: string };

type AdjustResult = {
  adjustment: "none" | "harder" | "lighter" | "mixed";
  summary: string;
  exercises: Exercise[];
};

async function adjustNextSession(
  profileId: string,
  programId: string,
  justCompleted: { name: string; exercises: Exercise[] },
  feedback: FeedbackItem[],
  sessionNote: string | null,
) {
  const nextSession = await db.programSession.findFirst({
    where: { programId, completed: false },
    orderBy: { dayNumber: "asc" },
  });
  if (!nextSession) return null;

  const sourceJson = nextSession.originalExercises ?? nextSession.exercises;
  const sourceExercises = parseJsonField<Exercise[]>(sourceJson, []);
  if (!sourceExercises.length) return null;

  const ctx = await buildCoachContext(profileId);
  const { system, user } = feedbackAdjustNextSessionPrompt(
    ctx,
    justCompleted,
    feedback,
    sessionNote,
    { name: nextSession.name, focus: nextSession.focus, exercises: sourceExercises },
  );

  const result = await generateJSON<AdjustResult>(system, user);
  if (!result || !Array.isArray(result.exercises) || result.exercises.length === 0) return null;

  if (result.adjustment === "none") {
    if (nextSession.originalExercises) {
      await db.programSession.update({
        where: { id: nextSession.id },
        data: { exercises: nextSession.originalExercises, adjustmentNote: result.summary },
      });
    }
    return { sessionId: nextSession.id, sessionName: nextSession.name, summary: result.summary, adjustment: "none" as const };
  }

  await db.programSession.update({
    where: { id: nextSession.id },
    data: {
      exercises: JSON.stringify(result.exercises),
      originalExercises: nextSession.originalExercises ?? sourceJson,
      adjustmentNote: result.summary,
    },
  });

  await db.aiInsight.create({
    data: {
      profileId,
      type: "feedback-adjust",
      content: JSON.stringify({
        sessionId: nextSession.id,
        sessionName: nextSession.name,
        adjustment: result.adjustment,
        summary: result.summary,
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

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json() as {
    sessionId: string;
    durationMin?: number;
    mood?: number;
    energyLevel?: number;
    notes?: string;
    feedback?: FeedbackItem[];
    skipAdjust?: boolean;
  };

  const { sessionId, durationMin, mood, energyLevel, notes, feedback, skipAdjust } = body;

  const programSession = await db.programSession.findUnique({
    where: { id: sessionId },
    include: { program: true },
  });
  if (!programSession || programSession.program.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cleanFeedback: FeedbackItem[] = Array.isArray(feedback)
    ? feedback
        .filter((f) => f && typeof f.exerciseName === "string" && Number.isFinite(f.difficulty))
        .map((f) => ({
          exerciseName: f.exerciseName.slice(0, 120),
          difficulty: Math.min(5, Math.max(1, Math.round(f.difficulty))),
          note: typeof f.note === "string" && f.note.trim() ? f.note.trim().slice(0, 400) : undefined,
        }))
    : [];

  const now = new Date();

  await db.programSession.update({
    where: { id: sessionId },
    data: { completed: true, completedAt: now },
  });

  const log = await db.workoutLog.create({
    data: {
      profileId: profile.id,
      title: programSession.name,
      completedAt: now,
      durationMin: durationMin ?? null,
      mood: mood ?? null,
      energyLevel: energyLevel ?? null,
      notes: notes ?? null,
      exercises: programSession.exercises,
      feedback: JSON.stringify(cleanFeedback),
    },
  });

  await db.profile.update({
    where: { id: profile.id },
    data: { xpPoints: { increment: 50 } },
  });

  let adjustment: Awaited<ReturnType<typeof adjustNextSession>> = null;
  if (!skipAdjust && cleanFeedback.length > 0) {
    try {
      adjustment = await adjustNextSession(
        profile.id,
        programSession.programId,
        {
          name: programSession.name,
          exercises: parseJsonField<Exercise[]>(programSession.exercises, []),
        },
        cleanFeedback,
        notes ?? null,
      );
    } catch {
      adjustment = null;
    }
  }

  return NextResponse.json({ ok: true, logId: log.id, adjustment });
}
