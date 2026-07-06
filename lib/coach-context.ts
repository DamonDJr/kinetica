import { db } from "./db";
import { parseJsonField, parseGoals, type FitnessGoal } from "./utils";
import { calcSleepDebt } from "./sleep";
import { profileBmr } from "./bmr";

export type CoachContext = {
  generatedAt: Date;
  profile: {
    id: string;
    displayName: string;
    age: number | null;
    gender: string | null;
    heightCm: number | null;
    weightKg: number | null;
    goalWeightKg: number | null;
    activityLevel: string;
    conditions: string[];
    injuries: string[];
    restrictions: string[];
    equipment: string[];
    goals: FitnessGoal[];
    streakDays: number;
    level: number;
    xpPoints: number;
  };
  targets: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
  today: {
    date: string;
    meals: {
      count: number;
      totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
      lastMealAt: Date | null;
      lastMealType: string | null;
      hasBreakfast: boolean;
      mealsList: Array<{ name: string; mealType: string; calories: number; proteinG: number; loggedAt: Date }>;
    };
    water: { totalMl: number };
    activeCaloriesBurned: number;
    bmr: number;
    caloriesBurned: number;
    netCalories: number;
    workoutLogged: boolean;
  };
  recent: {
    meals7d: {
      avgCaloriesPerDay: number;
      avgProteinPerDay: number;
      breakfastSkipRate: number;
      mealsByDay: Record<string, number>;
    };
    workouts14d: {
      count: number;
      lastWorkoutAt: Date | null;
      titles: string[];
    };
    sleep7d: {
      avgHours: number | null;
      avgQuality: number | null;
      lastNight: { hours: number; quality: number; forDate: Date } | null;
      nightsLogged: number;
      goalHours: number;
      wakeTimeGoal: string | null;
      debtHours: number;
      debtSeverity: "none" | "mild" | "moderate" | "severe";
    };
    insights7d: Array<{ type: string; content: string; createdAt: Date }>;
  };
  program: {
    id: string;
    name: string;
    daysPerWeek: number;
    weeklyCompletionRate: number;
    nextSession: { id: string; name: string; focus: string; dayNumber: number } | null;
  } | null;
  measurements: {
    latest: BodyMeasurementSnapshot | null;
    deltas30d: BodyMeasurementDelta | null;
    deltas90d: BodyMeasurementDelta | null;
    history: BodyMeasurementSnapshot[];
  };
  nudgeState: {
    smartEnabled: boolean;
    dailyCap: number;
    sentToday: number;
    lastSmartNudgeAt: Date | null;
    notifyStartHour: number;
    notifyEndHour: number;
  };
};

export type BodyMeasurementSnapshot = {
  takenAt: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
};

export type BodyMeasurementDelta = {
  daysSpan: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

function snapshot(m: {
  takenAt: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
}): BodyMeasurementSnapshot {
  return {
    takenAt: m.takenAt,
    weightKg: m.weightKg,
    bodyFatPct: m.bodyFatPct,
    waistCm: m.waistCm,
    chestCm: m.chestCm,
    hipsCm: m.hipsCm,
    armCm: m.armCm,
    thighCm: m.thighCm,
    neckCm: m.neckCm,
  };
}

function diff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return +(a - b).toFixed(2);
}

function deltaBetween(latest: BodyMeasurementSnapshot, prior: BodyMeasurementSnapshot): BodyMeasurementDelta {
  const daysSpan = Math.max(1, Math.round((latest.takenAt.getTime() - prior.takenAt.getTime()) / MS_PER_DAY));
  return {
    daysSpan,
    weightKg: diff(latest.weightKg, prior.weightKg),
    bodyFatPct: diff(latest.bodyFatPct, prior.bodyFatPct),
    waistCm: diff(latest.waistCm, prior.waistCm),
    chestCm: diff(latest.chestCm, prior.chestCm),
    hipsCm: diff(latest.hipsCm, prior.hipsCm),
    armCm: diff(latest.armCm, prior.armCm),
    thighCm: diff(latest.thighCm, prior.thighCm),
    neckCm: diff(latest.neckCm, prior.neckCm),
  };
}

function findClosestBefore(history: BodyMeasurementSnapshot[], target: Date): BodyMeasurementSnapshot | null {
  let best: BodyMeasurementSnapshot | null = null;
  for (const m of history) {
    if (m.takenAt.getTime() <= target.getTime()) {
      if (!best || m.takenAt.getTime() > best.takenAt.getTime()) best = m;
    }
  }
  return best;
}

/**
 * Build the full coaching context for a profile. Single source of truth that
 * every AI feature (smart nudges, plan import, measurement insights, etc.)
 * reads from — keeps prompts consistent and avoids re-querying scattered
 * across the codebase.
 */
export async function buildCoachContext(profileId: string, now: Date = new Date()): Promise<CoachContext> {
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY);

  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error(`profile ${profileId} not found`);

  const [
    todayMeals,
    todayWater,
    todayBurned,
    todayWorkout,
    meals7d,
    workouts14d,
    sleep7d,
    insights7d,
    program,
    measurements90d,
  ] = await Promise.all([
    db.mealLog.findMany({
      where: { profileId, loggedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { loggedAt: "asc" },
    }),
    db.waterLog.findMany({
      where: { profileId, loggedAt: { gte: dayStart, lt: dayEnd } },
      select: { amountMl: true },
    }),
    db.burnedCalorieLog.findMany({
      where: { profileId, loggedAt: { gte: dayStart, lt: dayEnd } },
      select: { kcal: true },
    }),
    db.workoutLog.findFirst({
      where: { profileId, completedAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true },
    }),
    db.mealLog.findMany({
      where: { profileId, loggedAt: { gte: sevenDaysAgo } },
      select: { mealType: true, calories: true, proteinG: true, loggedAt: true },
    }),
    db.workoutLog.findMany({
      where: { profileId, completedAt: { gte: fourteenDaysAgo } },
      orderBy: { completedAt: "desc" },
      select: { title: true, completedAt: true },
    }),
    db.sleepLog.findMany({
      where: { profileId, forDate: { gte: sevenDaysAgo } },
      orderBy: { forDate: "desc" },
      select: { hours: true, quality: true, forDate: true },
    }),
    db.aiInsight.findMany({
      where: { profileId, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { type: true, content: true, createdAt: true },
    }),
    profile.activeProgramId
      ? db.workoutProgram.findUnique({
          where: { id: profile.activeProgramId },
          include: {
            sessions: {
              orderBy: { dayNumber: "asc" },
              select: { id: true, name: true, focus: true, dayNumber: true, completed: true },
            },
          },
        })
      : Promise.resolve(null),
    db.bodyMeasurement.findMany({
      where: { profileId, takenAt: { gte: ninetyDaysAgo } },
      orderBy: { takenAt: "asc" },
    }),
  ]);

  const todayTotals = todayMeals.reduce(
    (acc, m) => {
      acc.calories += m.calories;
      acc.proteinG += m.proteinG;
      acc.carbsG += m.carbsG;
      acc.fatG += m.fatG;
      return acc;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const lastMeal = todayMeals.at(-1) ?? null;
  const hasBreakfast = todayMeals.some((m) => m.mealType === "breakfast");

  const mealsByDay: Record<string, number> = {};
  let cal7 = 0;
  let pro7 = 0;
  const breakfastDays = new Set<string>();
  const dayKeys = new Set<string>();
  for (const m of meals7d) {
    const key = isoDate(m.loggedAt);
    dayKeys.add(key);
    mealsByDay[key] = (mealsByDay[key] ?? 0) + 1;
    cal7 += m.calories;
    pro7 += m.proteinG;
    if (m.mealType === "breakfast") breakfastDays.add(key);
  }
  const days7 = Math.max(1, dayKeys.size);
  const breakfastSkipRate = dayKeys.size > 0 ? 1 - breakfastDays.size / dayKeys.size : 0;

  const sleepNights = sleep7d.length;
  const lastNight = sleep7d[0] ?? null;
  const avgSleepHours = sleepNights > 0 ? +(sleep7d.reduce((s, n) => s + n.hours, 0) / sleepNights).toFixed(2) : null;
  const avgSleepQuality =
    sleepNights > 0 ? +(sleep7d.reduce((s, n) => s + n.quality, 0) / sleepNights).toFixed(2) : null;
  const sleepDebt = calcSleepDebt(sleep7d, profile.sleepGoalHours, 7);

  const history = measurements90d.map(snapshot);
  const latest = history.at(-1) ?? null;
  let deltas30d: BodyMeasurementDelta | null = null;
  let deltas90d: BodyMeasurementDelta | null = null;
  if (latest) {
    const target30 = new Date(latest.takenAt.getTime() - 30 * MS_PER_DAY);
    const target90 = new Date(latest.takenAt.getTime() - 90 * MS_PER_DAY);
    const prior30 = findClosestBefore(history.slice(0, -1), target30);
    const prior90 = findClosestBefore(history.slice(0, -1), target90);
    if (prior30) deltas30d = deltaBetween(latest, prior30);
    if (prior90) deltas90d = deltaBetween(latest, prior90);
  }

  let programCtx: CoachContext["program"] = null;
  if (program) {
    const total = program.sessions.length;
    const done = program.sessions.filter((s) => s.completed).length;
    const next = program.sessions.find((s) => !s.completed) ?? null;
    programCtx = {
      id: program.id,
      name: program.name,
      daysPerWeek: program.daysPerWeek,
      weeklyCompletionRate: total > 0 ? +(done / total).toFixed(2) : 0,
      nextSession: next
        ? { id: next.id, name: next.name, focus: next.focus, dayNumber: next.dayNumber }
        : null,
    };
  }

  const activeBurned = todayBurned.reduce((s, b) => s + b.kcal, 0);
  const bmr = profileBmr(profile) ?? 0;

  const sentToday = insights7d.filter(
    (i) => i.type === "nudge" && i.createdAt.getTime() >= dayStart.getTime(),
  ).length;

  return {
    generatedAt: now,
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      goalWeightKg: profile.goalWeightKg,
      activityLevel: profile.activityLevel,
      conditions: parseJsonField<string[]>(profile.conditions, []),
      injuries: parseJsonField<string[]>(profile.injuries, []),
      restrictions: parseJsonField<string[]>(profile.restrictions, []),
      equipment: parseJsonField<string[]>(profile.equipment, []),
      goals: parseGoals(profile.fitnessGoals),
      streakDays: profile.streakDays,
      level: profile.level,
      xpPoints: profile.xpPoints,
    },
    targets: {
      calories: profile.calorieTarget,
      proteinG: profile.proteinTargetG,
      carbsG: profile.carbTargetG,
      fatG: profile.fatTargetG,
    },
    today: {
      date: isoDate(now),
      meals: {
        count: todayMeals.length,
        totals: {
          calories: Math.round(todayTotals.calories),
          proteinG: +todayTotals.proteinG.toFixed(1),
          carbsG: +todayTotals.carbsG.toFixed(1),
          fatG: +todayTotals.fatG.toFixed(1),
        },
        lastMealAt: lastMeal?.loggedAt ?? null,
        lastMealType: lastMeal?.mealType ?? null,
        hasBreakfast,
        mealsList: todayMeals.map((m) => ({
          name: m.name,
          mealType: m.mealType,
          calories: m.calories,
          proteinG: m.proteinG,
          loggedAt: m.loggedAt,
        })),
      },
      water: { totalMl: todayWater.reduce((s, w) => s + w.amountMl, 0) },
      // Watches only report active calories — add BMR so caloriesBurned/netCalories
      // reflect total energy expenditure, not just the active portion.
      activeCaloriesBurned: activeBurned,
      bmr,
      caloriesBurned: activeBurned + bmr,
      netCalories: Math.round(todayTotals.calories) - (activeBurned + bmr),
      workoutLogged: !!todayWorkout,
    },
    recent: {
      meals7d: {
        avgCaloriesPerDay: Math.round(cal7 / days7),
        avgProteinPerDay: +(pro7 / days7).toFixed(1),
        breakfastSkipRate: +breakfastSkipRate.toFixed(2),
        mealsByDay,
      },
      workouts14d: {
        count: workouts14d.length,
        lastWorkoutAt: workouts14d[0]?.completedAt ?? null,
        titles: workouts14d.slice(0, 5).map((w) => w.title),
      },
      sleep7d: {
        avgHours: avgSleepHours,
        avgQuality: avgSleepQuality,
        lastNight: lastNight ? { hours: lastNight.hours, quality: lastNight.quality, forDate: lastNight.forDate } : null,
        nightsLogged: sleepNights,
        goalHours: profile.sleepGoalHours,
        wakeTimeGoal: profile.wakeTimeGoal,
        debtHours: sleepDebt.debtHours,
        debtSeverity: sleepDebt.severity,
      },
      insights7d: insights7d.map((i) => ({ type: i.type, content: i.content, createdAt: i.createdAt })),
    },
    program: programCtx,
    measurements: {
      latest,
      deltas30d,
      deltas90d,
      history,
    },
    nudgeState: {
      smartEnabled: profile.smartNudgesEnabled,
      dailyCap: profile.dailyNudgeCap,
      sentToday,
      lastSmartNudgeAt: profile.lastSmartNudgeAt,
      notifyStartHour: profile.notifyStartHour,
      notifyEndHour: profile.notifyEndHour,
    },
  };
}
