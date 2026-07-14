import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calcBmr } from "@/lib/bmr";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    displayName, age, gender,
    heightIn, weightLbs, goalWeightLbs,
    activityLevel, conditions, equipment, fitnessGoals,
  } = body;

  if (!displayName?.trim()) {
    return NextResponse.json({ error: "Display name required" }, { status: 400 });
  }

  const calorieTarget = weightLbs && heightIn && age
    ? calcBmr(weightLbs, heightIn, age, gender ?? null)
    : 2000;
  // ~0.8g protein per lb of bodyweight
  const proteinTargetG = weightLbs ? Math.round(weightLbs * 0.8) : 150;

  // Store imperial values directly; field names are just internal labels
  const data = {
    displayName: displayName.trim(),
    age: age ?? null,
    gender: gender ?? null,
    heightCm: heightIn ?? null,      // stores inches
    weightKg: weightLbs ?? null,     // stores lbs
    goalWeightKg: goalWeightLbs ?? null, // stores lbs
    activityLevel: activityLevel ?? "moderate",
    conditions: JSON.stringify(conditions ?? []),
    equipment: JSON.stringify(equipment ?? []),
    fitnessGoals: JSON.stringify(fitnessGoals ?? []),
    calorieTarget,
    proteinTargetG,
  };

  const profile = await db.profile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({ profile });
}

type FitnessGoalInput = { label: string; detail?: string };

function clampInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    activeProgramId?: string | null;
    fitnessGoals?: FitnessGoalInput[];
    targets?: {
      calorieTargetMin?: number;
      calorieTargetMax?: number;
      proteinTargetG?: number;
      carbTargetG?: number;
      fatTargetG?: number;
    };
    basics?: {
      displayName?: string;
      age?: number | null;
      gender?: string | null;
      heightIn?: number | null;
      weightLbs?: number | null;
      goalWeightLbs?: number | null;
      bmrOverride?: number | null;
      activityLevel?: string;
      conditions?: string[];
      injuries?: string[];
      equipment?: string[];
      restrictions?: string[];
    };
  };

  const data: {
    activeProgramId?: string | null;
    fitnessGoals?: string;
    calorieTarget?: number;
    calorieTargetMin?: number;
    calorieTargetMax?: number;
    proteinTargetG?: number;
    carbTargetG?: number | null;
    fatTargetG?: number | null;
    targetsCustom?: boolean;
    displayName?: string;
    age?: number | null;
    gender?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    goalWeightKg?: number | null;
    bmrOverride?: number | null;
    activityLevel?: string;
    conditions?: string;
    injuries?: string;
    equipment?: string;
    restrictions?: string;
  } = {};
  if ("activeProgramId" in body) {
    data.activeProgramId = body.activeProgramId ?? null;
  }
  if (Array.isArray(body.fitnessGoals)) {
    const cleaned = body.fitnessGoals
      .filter((g): g is FitnessGoalInput => !!g && typeof g.label === "string" && g.label.trim().length > 0)
      .map((g) => {
        const detail = typeof g.detail === "string" && g.detail.trim() ? g.detail.trim() : undefined;
        return detail ? { label: g.label.trim(), detail } : { label: g.label.trim() };
      });
    data.fitnessGoals = JSON.stringify(cleaned);
  }

  if (body.targets) {
    const min = clampInt(body.targets.calorieTargetMin, 1000, 6000);
    const max = clampInt(body.targets.calorieTargetMax, 1000, 6000);
    const protein = clampInt(body.targets.proteinTargetG, 30, 400);
    if (!min || !max || !protein) {
      return NextResponse.json({ error: "Calorie range and protein target are required" }, { status: 400 });
    }
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    data.calorieTargetMin = lo;
    data.calorieTargetMax = hi;
    data.calorieTarget = Math.round((lo + hi) / 2); // center, used for the ring + AI
    data.proteinTargetG = protein;
    data.carbTargetG = clampInt(body.targets.carbTargetG, 30, 700);
    data.fatTargetG = clampInt(body.targets.fatTargetG, 20, 250);
    data.targetsCustom = true;
  }

  if (body.basics) {
    const b = body.basics;
    if (b.displayName !== undefined) {
      if (!b.displayName?.trim()) {
        return NextResponse.json({ error: "Display name required" }, { status: 400 });
      }
      data.displayName = b.displayName.trim();
    }
    if ("age" in b) data.age = clampInt(b.age, 5, 120);
    if ("gender" in b) data.gender = b.gender?.trim() || null;
    // heightCm stores inches, weightKg/goalWeightKg store lbs (imperial throughout)
    if ("heightIn" in b) data.heightCm = typeof b.heightIn === "number" && b.heightIn > 0 ? b.heightIn : null;
    if ("weightLbs" in b) data.weightKg = typeof b.weightLbs === "number" && b.weightLbs > 0 ? b.weightLbs : null;
    if ("goalWeightLbs" in b) data.goalWeightKg = typeof b.goalWeightLbs === "number" && b.goalWeightLbs > 0 ? b.goalWeightLbs : null;
    if ("bmrOverride" in b) data.bmrOverride = b.bmrOverride == null ? null : clampInt(b.bmrOverride, 500, 6000);
    if (b.activityLevel) data.activityLevel = b.activityLevel;
    for (const key of ["conditions", "injuries", "equipment", "restrictions"] as const) {
      if (Array.isArray(b[key])) {
        data[key] = JSON.stringify(b[key]!.map((s) => String(s).trim()).filter(Boolean));
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const current = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!current) return NextResponse.json({ error: "No profile" }, { status: 404 });

  // Body edits shift the auto-calculated targets — but never touch targets the
  // user (or the AI targets flow) set explicitly.
  if (body.basics && !body.targets && !current.targetsCustom) {
    const weightLbs = data.weightKg !== undefined ? data.weightKg : current.weightKg;
    const heightIn = data.heightCm !== undefined ? data.heightCm : current.heightCm;
    const age = data.age !== undefined ? data.age : current.age;
    const gender = data.gender !== undefined ? data.gender : current.gender;
    const bmrOverride = data.bmrOverride !== undefined ? data.bmrOverride : current.bmrOverride;
    if (bmrOverride) {
      data.calorieTarget = bmrOverride;
    } else if (weightLbs && heightIn && age) {
      data.calorieTarget = calcBmr(weightLbs, heightIn, age, gender ?? null);
    }
    if (weightLbs) data.proteinTargetG = Math.round(weightLbs * 0.8);
  }

  const profile = await db.profile.update({
    where: { userId: session.user.id },
    data,
  });
  return NextResponse.json({ profile });
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  return NextResponse.json({ profile });
}
