"use client";
import { motion } from "framer-motion";
import { Dumbbell, Droplets, Flame, Sparkles, ChevronRight, Plus, Trophy, Play, Activity } from "lucide-react";
import Link from "next/link";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { SleepCard } from "@/components/dashboard/sleep-card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { xpForNextLevel } from "@/lib/utils";

interface DashboardClientProps {
  profile: {
    id: string;
    displayName: string;
    level: number;
    xpPoints: number;
    streakDays: number;
    calorieTarget: number;
    proteinTargetG: number;
    conditions: string[];
  };
  today: {
    calories: number;
    waterMl: number;
    protein: number;
    workouts: number;
    burnedKcal: number;
    activeBurnedKcal: number;
    bmr: number;
  };
  activePlan: { id: string; title: string; durationMin: number } | null;
  activeProgram: {
    id: string;
    name: string;
    nextSession: { id: string; name: string; focus: string } | null;
  } | null;
  insights: { id: string; type: string; content: string; read: boolean }[];
  lastNightSleep: { hours: number; quality: number; forDate: string } | null;
}

const insightAccents: Record<string, { bg: string; dot: string; label: string }> = {
  workout: { bg: "bg-primary/8 border-primary/20", dot: "bg-primary", label: "Workout" },
  nutrition: { bg: "bg-accent/8 border-accent/20", dot: "bg-accent", label: "Nutrition" },
  recovery: { bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500", label: "Recovery" },
  motivation: { bg: "bg-rose-50 border-rose-200", dot: "bg-rose-400", label: "Motivation" },
};

export function DashboardClient({ profile, today, activePlan, activeProgram, insights, lastNightSleep }: DashboardClientProps) {
  const xpNext = xpForNextLevel(profile.level);
  const xpCurrent = profile.xpPoints % xpNext;

  const waterTarget = 2500;
  const calPct = Math.min((today.calories / profile.calorieTarget) * 100, 100);
  const waterPct = Math.min((today.waterMl / waterTarget) * 100, 100);
  const proteinPct = Math.min((today.protein / profile.proteinTargetG) * 100, 100);

  return (
    <div className="space-y-8">

      {/* XP / Level bar */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Level {profile.level}</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{xpCurrent} / {xpNext} XP</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
            initial={{ width: 0 }}
            animate={{ width: `${(xpCurrent / xpNext) * 100}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* Today's rings */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <SectionHeader label="Today" />
        <div className="grid grid-cols-3 gap-3">
          <RingCard value={today.calories} max={profile.calorieTarget} color="#7c6af7" label={String(today.calories)} sub="kcal" name="Calories" />
          <RingCard value={today.waterMl} max={waterTarget} color="#2dd4bf" label={`${(today.waterMl/1000).toFixed(1)}L`} sub="water" name="Hydration" />
          <RingCard value={today.protein} max={profile.proteinTargetG} color="#f59e0b" label={`${today.protein}g`} sub="protein" name="Protein" />
        </div>
        {today.burnedKcal > 0 && (
          <Link href="/nutrition" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-2 text-xs">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Net</span>
            <span className="font-black tabular-nums">{(today.calories - today.burnedKcal).toLocaleString()} kcal</span>
            <span className="text-muted-foreground/70">
              · {today.burnedKcal.toLocaleString()} burned ({today.activeBurnedKcal.toLocaleString()} active + {today.bmr.toLocaleString()} resting)
            </span>
          </Link>
        )}
      </motion.div>

      {/* Quick stat row */}
      <div className="grid grid-cols-2 gap-3">
        <QuickStat
          value={today.workouts}
          label="workouts this week"
          icon={<Dumbbell className="h-4 w-4" />}
          color="purple"
        />
        <QuickStat
          value={profile.streakDays}
          label="day streak"
          icon={<Flame className="h-4 w-4" />}
          color="amber"
        />
      </div>

      {/* Sleep */}
      <SleepCard lastNight={lastNightSleep} />

      {/* Active Program */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <SectionHeader
          label="Active Program"
          action={
            <Button asChild size="sm" variant="ghost" className="text-xs h-7 gap-1">
              <Link href="/workouts"><span>All workouts</span><ChevronRight className="h-3.5 w-3.5" /></Link>
            </Button>
          }
        />
        {activeProgram ? (
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 to-violet-50 overflow-hidden">
            <Link href={`/workouts/programs/${activeProgram.id}`}>
              <div className="group relative p-4 hover:bg-primary/5 transition-colors">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Dumbbell className="h-16 w-16 text-primary" />
                </div>
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Active Program</p>
                <p className="text-lg font-black tracking-tight">{activeProgram.name}</p>
              </div>
            </Link>
            {activeProgram.nextSession ? (
              <div className="border-t border-primary/15 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Next Session</p>
                  <p className="font-bold text-sm truncate">{activeProgram.nextSession.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{activeProgram.nextSession.focus}</p>
                </div>
                <Button asChild size="sm" className="shrink-0 gap-1.5">
                  <Link href={`/workouts/programs/${activeProgram.id}/session/${activeProgram.nextSession.id}`}>
                    <Play className="h-3.5 w-3.5 fill-white" />Start
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="border-t border-primary/15 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-600">All sessions complete!</p>
              </div>
            )}
          </div>
        ) : activePlan ? (
          <Link href={`/workouts/${activePlan.id}`}>
            <div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 to-violet-50 p-4 hover:border-primary/40 transition-colors">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Dumbbell className="h-16 w-16 text-primary" />
              </div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Today's Workout</p>
              <p className="text-lg font-black tracking-tight">{activePlan.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{activePlan.durationMin} min · Tap to start</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center space-y-3">
            <Dumbbell className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No active plan — let the AI build one for you</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button asChild size="sm">
                <Link href="/workouts/generate"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Quick Workout</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/workouts/programs/create"><Plus className="h-3.5 w-3.5 mr-1.5" />Full Program</Link>
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <SectionHeader label="AI" accent="Insights" />
          <div className="space-y-2.5">
            {insights.map((insight) => {
              let parsed: { headline?: string; body?: string; action?: string } = {};
              try { parsed = JSON.parse(insight.content); } catch { parsed = { body: insight.content }; }
              const style = insightAccents[insight.type] ?? insightAccents.motivation;
              return (
                <div key={insight.id} className={`rounded-2xl border p-4 ${style.bg} ${insight.read ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{style.label}</span>
                  </div>
                  {parsed.headline && <p className="font-bold text-sm leading-snug mb-1">{parsed.headline}</p>}
                  {parsed.body && <p className="text-sm text-muted-foreground leading-relaxed">{parsed.body}</p>}
                  {parsed.action && (
                    <p className="text-xs font-semibold text-primary mt-2">→ {parsed.action}</p>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 pb-6">
        <Button asChild variant="outline" className="h-12 rounded-xl font-semibold">
          <Link href="/nutrition/smart-log"><Flame className="h-4 w-4 mr-2 text-primary" />Log Meal</Link>
        </Button>
        <Button asChild variant="outline" className="h-12 rounded-xl font-semibold">
          <Link href="/nutrition"><Droplets className="h-4 w-4 mr-2 text-accent" />Log Water</Link>
        </Button>
        <Button asChild variant="outline" className="h-12 rounded-xl font-semibold col-span-2">
          <Link href="/journal"><Trophy className="h-4 w-4 mr-2 text-amber-500" />How are you feeling? Log a win</Link>
        </Button>
      </div>
    </div>
  );
}

function RingCard({ value, max, color, label, sub, name }: {
  value: number; max: number; color: string; label: string; sub: string; name: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl bg-white border border-border shadow-sm shadow-black/4">
      <ProgressRing value={value} max={max} size={74} strokeWidth={6} color={color} label={label} sublabel={sub} />
      <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">{name}</span>
    </div>
  );
}

function QuickStat({ value, label, icon, color }: {
  value: number; label: string; icon: React.ReactNode; color: "purple" | "amber";
}) {
  const styles = {
    purple: { wrap: "border-primary/15 bg-gradient-to-br from-primary/6 to-white", icon: "bg-primary/10 text-primary", val: "text-foreground" },
    amber: { wrap: "border-amber-200 bg-gradient-to-br from-amber-50 to-white", icon: "bg-amber-100 text-amber-600", val: "text-foreground" },
  };
  const s = styles[color];
  return (
    <div className={`flex items-center gap-3 p-4 rounded-2xl border ${s.wrap}`}>
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>{icon}</div>
      <div>
        <p className={`text-2xl font-black leading-none ${s.val}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
