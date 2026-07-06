import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { ArrowLeft } from "lucide-react";
import {
  bucketByDay,
  startOfMonth,
  startOfWeek,
  summarize,
  resolveCalorieRange,
  dayStatus,
  type DayTotal,
  type CalorieRange,
  type DayStatus,
} from "@/lib/nutrition-stats";
import { cn } from "@/lib/utils";

type Period = "week" | "month";

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const { period: periodParam } = await searchParams;
  const period: Period = periodParam === "month" ? "month" : "week";

  const now = new Date();
  const start = period === "month" ? startOfMonth(now) : startOfWeek(now);

  const meals = await db.mealLog.findMany({
    where: { profileId: profile.id, loggedAt: { gte: start } },
    select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
  });

  const calorieRange = resolveCalorieRange(profile.calorieTarget, profile.calorieTargetMin, profile.calorieTargetMax);
  const proteinTarget = profile.proteinTargetG ?? 150;
  const stats = summarize(bucketByDay(meals, start), calorieRange);

  const rangeLabel =
    period === "month"
      ? now.toLocaleDateString(undefined, { month: "long" })
      : `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – today`;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <Link href="/nutrition" aria-label="Back to nutrition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Nutrition</p>
          <h1 className="text-2xl font-black tracking-tight">Trends</h1>
        </div>
      </div>

      {/* Week / Month toggle */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-secondary">
        {(["week", "month"] as const).map((p) => (
          <Link
            key={p}
            href={`/nutrition/trends?period=${p}`}
            className={cn(
              "flex-1 text-center py-2 rounded-xl text-sm font-bold capitalize transition-colors",
              period === p ? "bg-card text-foreground shadow-sm shadow-black/8" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p}
          </Link>
        ))}
      </div>

      {/* Headline: avg/day ring + key stats */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-6">
            <ProgressRing
              value={stats.avgCalories}
              max={calorieRange.target}
              size={104}
              color="#7c6af7"
              label={stats.avgCalories.toLocaleString()}
              sublabel="avg/day"
            />
            <div className="flex-1 space-y-3">
              <Stat
                label="Cumulative"
                value={`${stats.totalCalories.toLocaleString()} kcal`}
                sub={`budget ${stats.goalMinToDate.toLocaleString()}–${stats.goalMaxToDate.toLocaleString()} (${stats.daysElapsed}d)`}
                tone={stats.totalCalories <= stats.goalMaxToDate ? "good" : "over"}
              />
              <Stat
                label="Days in range"
                value={`${stats.daysOnTarget}/${stats.daysLogged || stats.daysElapsed}`}
                sub={stats.daysLogged ? "logged days inside goal range" : "no meals logged yet"}
              />
              <Stat
                label="Avg protein"
                value={`${stats.avgProtein}g`}
                sub={`target ${proteinTarget}g`}
                tone={stats.avgProtein >= proteinTarget ? "good" : undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily calories chart */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Daily calories</h2>
            <span className="text-xs text-muted-foreground">{rangeLabel}</span>
          </div>
          <CalorieChart days={stats.days} range={calorieRange} period={period} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent/70" /> in range</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary/40" /> under</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fat/70" /> over</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-accent/10 border border-accent/30" /> goal range</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "over";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            tone === "good" && "text-accent",
            tone === "over" && "text-fat"
          )}
        >
          {value}
        </span>
      </div>
      {sub && <p className="text-[11px] text-muted-foreground/80 text-right">{sub}</p>}
    </div>
  );
}

const BAR_CLASS: Record<DayStatus, string> = {
  on: "bg-accent/70 group-hover:bg-accent",
  over: "bg-fat/70 group-hover:bg-fat",
  under: "bg-primary/40 group-hover:bg-primary/60",
  empty: "",
};

function CalorieChart({ days, range, period }: { days: DayTotal[]; range: CalorieRange; period: Period }) {
  const chartMax = Math.max(range.max, ...days.map((d) => d.calories), 1);
  const minPct = (range.min / chartMax) * 100;
  const maxPct = (range.max / chartMax) * 100;

  return (
    <div className="relative h-44">
      {/* Goal range band */}
      <div
        className="absolute inset-x-0 z-10 pointer-events-none bg-accent/10 border-y border-dashed border-accent/40"
        style={{ bottom: `${minPct}%`, height: `${maxPct - minPct}%` }}
      >
        <span className="absolute -top-2 right-0 text-[10px] font-medium text-accent bg-card px-1">
          {range.min.toLocaleString()}–{range.max.toLocaleString()}
        </span>
      </div>

      {/* Bars */}
      <div className="absolute inset-0 flex items-end gap-1">
        {days.map((d, i) => {
          const pct = d.calories > 0 ? Math.max((d.calories / chartMax) * 100, 3) : 0;
          const status = dayStatus(d.calories, range);
          const showLabel =
            period === "week" || i === 0 || i === days.length - 1 || (i + 1) % 5 === 0;
          return (
            <div key={d.key} className="group flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1">
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn("w-full rounded-md transition-colors", BAR_CLASS[status])}
                  style={{ height: `${pct}%` }}
                  title={`${d.calories.toLocaleString()} kcal`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground h-3 leading-3 tabular-nums">
                {showLabel
                  ? period === "week"
                    ? d.date.toLocaleDateString(undefined, { weekday: "narrow" })
                    : d.date.getDate()
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
