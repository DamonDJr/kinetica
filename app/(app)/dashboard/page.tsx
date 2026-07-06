import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";
import { parseJsonField } from "@/lib/utils";
import { profileBmr } from "@/lib/bmr";

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);

  const lastNightDate = new Date(now);
  lastNightDate.setDate(lastNightDate.getDate() - 1);
  lastNightDate.setHours(0, 0, 0, 0);

  const [todayMeals, todayWater, todayBurned, weekWorkouts, recentInsights, activePlan, activeProgram, lastNightSleep] = await Promise.all([
    db.mealLog.findMany({ where: { profileId: profile.id, loggedAt: { gte: todayStart } } }),
    db.waterLog.findMany({ where: { profileId: profile.id, loggedAt: { gte: todayStart } } }),
    db.burnedCalorieLog.findMany({ where: { profileId: profile.id, loggedAt: { gte: todayStart } }, select: { kcal: true } }),
    db.workoutLog.findMany({ where: { profileId: profile.id, completedAt: { gte: weekStart } } }),
    db.aiInsight.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.workoutPlan.findFirst({
      where: { profileId: profile.id, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    profile.activeProgramId
      ? db.workoutProgram.findUnique({
          where: { id: profile.activeProgramId },
          include: {
            sessions: {
              where: { completed: false },
              orderBy: { dayNumber: "asc" },
              take: 1,
            },
          },
        })
      : null,
    db.sleepLog.findFirst({
      where: { profileId: profile.id, forDate: lastNightDate },
    }),
  ]);

  const todayCalories = todayMeals.reduce((s, m) => s + m.calories, 0);
  const todayWaterMl = todayWater.reduce((s, w) => s + w.amountMl, 0);
  const todayProtein = todayMeals.reduce((s, m) => s + m.proteinG, 0);
  const todayActiveBurnedKcal = todayBurned.reduce((s, b) => s + b.kcal, 0);
  const bmr = profileBmr(profile) ?? 0;
  const todayBurnedKcal = todayActiveBurnedKcal + bmr;

  return (
    <DashboardClient
      profile={{
        id: profile.id,
        displayName: profile.displayName,
        level: profile.level,
        xpPoints: profile.xpPoints,
        streakDays: profile.streakDays,
        calorieTarget: profile.calorieTarget ?? 2000,
        proteinTargetG: profile.proteinTargetG ?? 150,
        conditions: parseJsonField<string[]>(profile.conditions, []),
      }}
      today={{
        calories: todayCalories,
        waterMl: todayWaterMl,
        protein: Math.round(todayProtein),
        workouts: weekWorkouts.length,
        burnedKcal: todayBurnedKcal,
        activeBurnedKcal: todayActiveBurnedKcal,
        bmr,
      }}
      activePlan={activePlan ? { id: activePlan.id, title: activePlan.title, durationMin: activePlan.durationMin } : null}
      activeProgram={
        activeProgram
          ? {
              id: activeProgram.id,
              name: activeProgram.name,
              nextSession: activeProgram.sessions[0]
                ? { id: activeProgram.sessions[0].id, name: activeProgram.sessions[0].name, focus: activeProgram.sessions[0].focus }
                : null,
            }
          : null
      }
      insights={recentInsights.map((i) => ({ id: i.id, type: i.type, content: i.content, read: i.read }))}
      lastNightSleep={
        lastNightSleep
          ? {
              hours: lastNightSleep.hours,
              quality: lastNightSleep.quality,
              forDate: lastNightSleep.forDate.toISOString(),
            }
          : null
      }
    />
  );
}
