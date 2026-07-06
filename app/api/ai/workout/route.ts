import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateJSON } from "@/lib/ai";
import { workoutPlanPrompt } from "@/lib/ai-prompts";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const { duration = 30, difficulty = "beginner", category = "strength" } = await req.json();
  const { system, user } = workoutPlanPrompt(profile, { duration, difficulty, category });

  const plan = await generateJSON<{
    title: string;
    description: string;
    warmup: { name: string; duration: string; notes: string }[];
    exercises: { name: string; sets: number; reps: string; rest: string; notes: string }[];
    cooldown: { name: string; duration: string; notes: string }[];
    coachNote: string;
  }>(system, user);

  if (!plan) {
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  const saved = await db.workoutPlan.create({
    data: {
      profileId: profile.id,
      title: plan.title,
      description: plan.description,
      difficulty,
      durationMin: duration,
      category,
      exercises: JSON.stringify([
        ...plan.warmup.map((e) => ({ ...e, type: "warmup" })),
        ...plan.exercises.map((e) => ({ ...e, type: "main" })),
        ...plan.cooldown.map((e) => ({ ...e, type: "cooldown" })),
      ]),
      aiGenerated: true,
    },
  });

  return NextResponse.json({ plan: saved, preview: plan });
}
