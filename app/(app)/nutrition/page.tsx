import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { Flame, Droplets, Plus, ChevronLeft, ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { LogWaterButton } from "@/components/nutrition/log-water-button";
import { BurnedCaloriesCard } from "@/components/nutrition/burned-calories-card";
import { MealList } from "@/components/nutrition/meal-list";
import { bucketByDay, startOfWeek, summarize, resolveCalorieRange, dayStatus, type DayStatus } from "@/lib/nutrition-stats";
import { profileBmr } from "@/lib/bmr";

function parseDateParam(value: string | undefined): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!value) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return d;
  const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(parsed.getTime())) return d;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const { date: dateParam } = await searchParams;
  const dayStart = parseDateParam(dateParam);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = dayStart.getTime() === today.getTime();
  const prevDate = new Date(dayStart);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dayStart);
  nextDate.setDate(nextDate.getDate() + 1);
  const dateLabel = isToday
    ? "Today"
    : dayStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  const weekStart = startOfWeek(today);

  const [meals, water, burned, weekMeals] = await Promise.all([
    db.mealLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { loggedAt: "asc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    db.waterLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: dayStart, lt: dayEnd } },
    }),
    db.burnedCalorieLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: dayStart, lt: dayEnd } },
      select: { kcal: true },
    }),
    db.mealLog.findMany({
      where: { profileId: profile.id, loggedAt: { gte: weekStart } },
      select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
  ]);

  const totalCals = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.proteinG, 0);
  const totalCarbs = meals.reduce((s, m) => s + m.carbsG, 0);
  const totalFat = meals.reduce((s, m) => s + m.fatG, 0);
  const totalWater = water.reduce((s, w) => s + w.amountMl, 0);
  const totalBurned = burned.reduce((s, b) => s + b.kcal, 0);
  const calorieTarget = profile.calorieTarget ?? 2000;
  const proteinTarget = profile.proteinTargetG ?? 150;
  const waterTarget = 2500;
  const calorieRange = resolveCalorieRange(profile.calorieTarget, profile.calorieTargetMin, profile.calorieTargetMax);
  const bmr = profileBmr(profile);

  const week = summarize(bucketByDay(weekMeals, weekStart), calorieRange);
  const weekMax = Math.max(calorieRange.max, ...week.days.map((d) => d.calories), 1);
  const dateQuery = isToday ? "" : `?date=${formatDateParam(dayStart)}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nutrition</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/nutrition/ideas${dateQuery}`}><Sparkles className="h-4 w-4 mr-1" /> Ideas</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/nutrition/smart-log${dateQuery}`}><Plus className="h-4 w-4 mr-1" /> Log Meal</Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-2 py-1.5">
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Link href={`/nutrition?date=${formatDateParam(prevDate)}`} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{dateLabel}</span>
          {!isToday && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link href="/nutrition">Today</Link>
            </Button>
          )}
        </div>
        {isToday ? (
          <span aria-disabled className="inline-flex h-8 w-8 items-center justify-center opacity-30">
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link href={`/nutrition?date=${formatDateParam(nextDate)}`} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {/* Calorie ring + macros */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-6">
            <ProgressRing
              value={totalCals}
              max={calorieTarget}
              size={100}
              color="#7c6af7"
              label={`${totalCals}`}
              sublabel="kcal"
            />
            <div className="flex-1 space-y-3">
              <MacroBar label="Protein" value={Math.round(totalProtein)} target={proteinTarget} color="bg-accent" />
              <MacroBar label="Carbs" value={Math.round(totalCarbs)} target={profile.carbTargetG ?? 250} color="bg-carbs" />
              <MacroBar label="Fat" value={Math.round(totalFat)} target={profile.fatTargetG ?? 65} color="bg-fat" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Net calories (intake − active burn − resting burn) */}
      <BurnedCaloriesCard
        intakeCals={totalCals}
        activeKcal={totalBurned}
        bmr={bmr}
        date={isToday ? undefined : formatDateParam(dayStart)}
      />

      {/* This week summary → trends */}
      <Link href="/nutrition/trends" className="block">
        <Card className="transition-colors hover:border-primary/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">This week</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground tabular-nums">{week.avgCalories.toLocaleString()}</span> avg kcal</span>
                <span><span className="font-semibold text-foreground tabular-nums">{week.daysOnTarget}/{week.daysLogged || week.daysElapsed}</span> on target</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-14">
              {week.days.map((d) => {
                const pct = Math.max((d.calories / weekMax) * 100, d.calories > 0 ? 6 : 0);
                return (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-md ${calorieBarClass(dayStatus(d.calories, calorieRange))}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {d.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Water */}
      <Card className="border-accent/20 bg-gradient-to-r from-accent/5 to-transparent">
        <CardContent className="pt-4 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Droplets className="h-5 w-5 text-accent" />
            <div>
              <p className="font-semibold text-sm">Hydration</p>
              <p className="text-xs text-muted-foreground">{(totalWater / 1000).toFixed(1)}L / {(waterTarget / 1000).toFixed(1)}L</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[250, 500].map((ml) => (
              <LogWaterButton key={ml} ml={ml} date={isToday ? undefined : formatDateParam(dayStart)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Meals by type */}
      {meals.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Flame className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <p className="font-semibold">No meals logged {isToday ? "today" : `on ${dateLabel}`}</p>
              {isToday && (
                <p className="text-sm text-muted-foreground mt-1">Start tracking to hit your nutrition goals</p>
              )}
            </div>
            <Button asChild>
              <Link href={`/nutrition/smart-log${dateQuery}`}><Plus className="h-4 w-4 mr-1" /> {isToday ? "Log your first meal" : "Log a meal"}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <MealList meals={meals} />
      )}
    </div>
  );
}

/** Bar fill colour by how the day sits against the calorie range. */
function calorieBarClass(status: DayStatus): string {
  switch (status) {
    case "on":
      return "bg-accent/70"; // inside range — on target
    case "over":
      return "bg-fat/70"; // above range
    case "under":
      return "bg-primary/40"; // below range
    default:
      return "bg-primary/40";
  }
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min((value / (target || 1)) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}g / {target}g</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

