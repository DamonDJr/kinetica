import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonField } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkoutDetailClient } from "./workout-detail-client";

type Exercise = {
  name: string;
  type?: "warmup" | "main" | "cooldown";
  sets?: number;
  reps?: string;
  rest?: string;
  duration?: string;
  notes?: string;
};

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const plan = await db.workoutPlan.findUnique({ where: { id } });
  if (!plan || plan.profileId !== profile.id) notFound();

  const exercises = parseJsonField<Exercise[]>(plan.exercises, []);

  return (
    <WorkoutDetailClient
      planId={plan.id}
      title={plan.title}
      description={plan.description ?? ""}
      difficulty={plan.difficulty}
      durationMin={plan.durationMin}
      category={plan.category}
      aiGenerated={plan.aiGenerated}
      exercises={exercises}
    />
  );
}
