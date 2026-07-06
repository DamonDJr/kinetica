import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SessionWorkoutClient } from "./session-workout-client";

export default async function SessionWorkoutPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const programSession = await db.programSession.findUnique({
    where: { id: sessionId },
    include: { program: true },
  });
  if (!programSession || programSession.program.profileId !== profile.id || programSession.programId !== id) {
    notFound();
  }

  let exercises: {
    name: string;
    type?: "warmup" | "main" | "cooldown";
    sets: number;
    reps: string;
    rest: string;
    notes: string;
  }[] = [];
  try {
    exercises = JSON.parse(programSession.exercises);
  } catch {}

  let conditionTips: { condition: string; tip: string }[] = [];
  try {
    conditionTips = JSON.parse(programSession.conditionTips);
  } catch {}

  return (
    <SessionWorkoutClient
      programId={id}
      session={{
        id: programSession.id,
        name: programSession.name,
        focus: programSession.focus,
        notes: programSession.notes,
        completed: programSession.completed,
      }}
      exercises={exercises}
      conditionTips={conditionTips}
    />
  );
}
