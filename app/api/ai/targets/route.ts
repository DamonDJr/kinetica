import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildCoachContext } from "@/lib/coach-context";
import { nutritionTargetsPrompt } from "@/lib/ai-prompts";
import { generateJSON } from "@/lib/ai";

export const maxDuration = 60;

type TargetsResponse = {
  calorieTarget: number;
  calorieTargetMin: number;
  calorieTargetMax: number;
  proteinTargetG: number;
  carbTargetG: number;
  fatTargetG: number;
  reasoning: string;
  confidence: "high" | "medium" | "low";
};

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const ctx = await buildCoachContext(profile.id);
  const { system, user } = nutritionTargetsPrompt(ctx);
  const result = await generateJSON<TargetsResponse>(system, user);

  if (!result) {
    return NextResponse.json({ error: "AI did not return usable targets" }, { status: 502 });
  }

  const calorieTarget = clampInt(result.calorieTarget, 1000, 6000);
  const proteinTargetG = clampInt(result.proteinTargetG, 30, 400);
  const carbTargetG = clampInt(result.carbTargetG, 30, 700);
  const fatTargetG = clampInt(result.fatTargetG, 20, 250);

  if (!calorieTarget || !proteinTargetG) {
    return NextResponse.json({ error: "AI returned invalid numbers" }, { status: 502 });
  }

  // Derive a calorie range from the AI's min/max, falling back to a ±10% band.
  let calorieTargetMin = clampInt(result.calorieTargetMin, 1000, 6000) ?? Math.round(calorieTarget * 0.9);
  let calorieTargetMax = clampInt(result.calorieTargetMax, 1000, 6000) ?? Math.round(calorieTarget * 1.1);
  // Guard against a degenerate/inverted band that doesn't bracket the target.
  if (calorieTargetMin >= calorieTarget || calorieTargetMax <= calorieTarget) {
    calorieTargetMin = Math.round(calorieTarget * 0.9);
    calorieTargetMax = Math.round(calorieTarget * 1.1);
  }

  const updated = await db.profile.update({
    where: { id: profile.id },
    data: {
      calorieTarget,
      calorieTargetMin,
      calorieTargetMax,
      proteinTargetG,
      carbTargetG: carbTargetG ?? profile.carbTargetG,
      fatTargetG: fatTargetG ?? profile.fatTargetG,
      targetsCustom: false,
    },
  });

  await db.aiInsight.create({
    data: {
      profileId: profile.id,
      type: "targets",
      content: JSON.stringify({
        calorieTarget,
        calorieTargetMin,
        calorieTargetMax,
        proteinTargetG,
        carbTargetG,
        fatTargetG,
        reasoning: result.reasoning,
        confidence: result.confidence,
      }),
    },
  });

  return NextResponse.json({
    targets: {
      calorieTarget: updated.calorieTarget,
      calorieTargetMin: updated.calorieTargetMin,
      calorieTargetMax: updated.calorieTargetMax,
      proteinTargetG: updated.proteinTargetG,
      carbTargetG: updated.carbTargetG,
      fatTargetG: updated.fatTargetG,
    },
    reasoning: result.reasoning,
    confidence: result.confidence,
  });
}
