import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoachContext } from "@/lib/coach-context";
import { bedtimePrompt } from "@/lib/ai-prompts";
import { generateJSON } from "@/lib/ai";
import { calcBedtime, parseHHMM } from "@/lib/sleep";

export const maxDuration = 60;

type Reco = { bedtime: string; getReadyAt: string; reasoning: string };

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  if (!profile.wakeTimeGoal) {
    return NextResponse.json({ error: "Set a wake time goal first" }, { status: 400 });
  }

  const ctx = await buildCoachContext(profile.id);
  const baseline = calcBedtime(profile.wakeTimeGoal, profile.sleepGoalHours, ctx.recent.sleep7d.debtHours);

  const recentNights = await db.sleepLog.findMany({
    where: { profileId: profile.id },
    orderBy: { forDate: "desc" },
    take: 7,
    select: { forDate: true, hours: true, quality: true },
  });

  const { system, user } = bedtimePrompt(ctx, {
    wakeTime: profile.wakeTimeGoal,
    goalHours: profile.sleepGoalHours,
    baselineBedtime: baseline.bedtime,
    baselineGetReadyAt: baseline.getReadyAt,
    targetHours: baseline.targetHours,
    recentNights: recentNights.map((n) => ({
      forDate: n.forDate.toISOString().slice(0, 10),
      hours: n.hours,
      quality: n.quality,
    })),
  });

  const reco = await generateJSON<Reco>(system, user);

  // Fall back to deterministic baseline if the model returned junk.
  const valid = reco && parseHHMM(reco.bedtime) && parseHHMM(reco.getReadyAt);
  const recommendation = valid
    ? reco
    : { bedtime: baseline.bedtime, getReadyAt: baseline.getReadyAt, reasoning: "Based on your goal and recent sleep debt." };

  return NextResponse.json({
    recommendation,
    baseline,
    debt: ctx.recent.sleep7d,
    aiUsed: !!valid,
  });
}
